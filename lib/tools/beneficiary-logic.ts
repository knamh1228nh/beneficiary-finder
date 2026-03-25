/**
 * lib/tools/beneficiary-logic.ts
 *
 * 수혜주 분석 로직 통합 모듈 (Shared Library)
 * 크롤링 → Gemini 분석 → 네이버 종목 검증을 한 번에 캡슐화합니다.
 */

import { crawlUrl } from '../crawler'
import { isNewsOrResearch, analyzeBeneficiaries, calcScores, BeneficiaryResult } from '../gemini'
import { verifyStockCode, ValidatedStock } from '../naver-stock'

export interface BeneficiaryToolResult {
  success: true
  title: string
  beneficiaries: EnrichedBeneficiary[]
}

export interface BeneficiaryToolError {
  success: false
  error: string
}

export type BeneficiaryToolResponse = BeneficiaryToolResult | BeneficiaryToolError

export interface EnrichedBeneficiary extends BeneficiaryResult {
  short_score: number
  long_score:  number
  verified:    boolean
  corrected:   boolean
  stockUrl:    string
}

/**
 * 뉴스 URL 하나를 받아 수혜주 분석 전체 파이프라인을 실행합니다.
 *
 * 파이프라인:
 *   1. URL 크롤링 → 제목 + 본문 추출
 *   2. 뉴스/리서치 여부 검증 (Gemini lite)
 *   3. 수혜주 분석 (Gemini 분석 모델)
 *   4. short_score / long_score 계산
 *   5. 종목코드 검증 및 보정 (Naver Pay증권 API)
 */
export async function executeBeneficiaryTool(url: string): Promise<BeneficiaryToolResponse> {
  // 1. 크롤링
  let title: string
  let content: string
  try {
    const crawled = await crawlUrl(url)
    title = crawled.title
    content = crawled.content
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `크롤링 실패: ${msg}` }
  }

  // 2. 뉴스/리서치 여부 검증
  let isValid: boolean
  try {
    isValid = await isNewsOrResearch(content)
  } catch {
    isValid = true
  }

  if (!isValid) {
    return {
      success: false,
      error: '입력된 URL이 뉴스 기사 또는 금융 리서치 자료가 아닙니다. 관련 기사 URL을 입력해주세요.',
    }
  }

  // 3. Gemini 수혜주 분석
  let rawBeneficiaries: BeneficiaryResult[]
  try {
    const result = await analyzeBeneficiaries(content)
    rawBeneficiaries = result.beneficiaries
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `AI 분석 실패: ${msg}` }
  }

  if (!rawBeneficiaries || rawBeneficiaries.length === 0) {
    return { success: false, error: '분석 결과에서 수혜 종목을 찾을 수 없습니다.' }
  }

  // 4. 종목코드 검증 (병렬)
  const validated: ValidatedStock[] = await Promise.all(
    rawBeneficiaries.map((b) => verifyStockCode(b.name, b.code))
  )

  const enriched: EnrichedBeneficiary[] = rawBeneficiaries.map((b, i) => {
    const { short_score, long_score } = calcScores(b.score_breakdown)
    return {
      ...b,
      name:        validated[i].name,
      code:        validated[i].code,
      short_score,
      long_score,
      verified:    validated[i].verified,
      corrected:   validated[i].corrected,
      stockUrl:    `https://www.ant.wiki/wiki/${validated[i].code}`,
    }
  })

  return { success: true, title, beneficiaries: enriched }
}
