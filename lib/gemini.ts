import { GoogleGenerativeAI } from '@google/generative-ai'

// ─────────────────────────────────────────────────────────────
// API 키 및 모델 배분 전략
// ─────────────────────────────────────────────────────────────
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[]

const ANALYSIS_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash']
const VALIDATION_MODEL = 'gemini-2.5-flash-lite'
const MAX_ANALYSIS_CHARS = 8000

// ─────────────────────────────────────────────────────────────
// 수혜 강도 가중치 (Short-term / Long-term)
// ─────────────────────────────────────────────────────────────
export const SHORT_WEIGHTS: Record<string, number> = {
  directness:          0.20,
  profit_contribution: 0.10,
  penetration_speed:   0.25,
  sustainability:      0.05,
  psychology_scarcity: 0.35,
  financial_readiness: 0.05,
}

export const LONG_WEIGHTS: Record<string, number> = {
  directness:          0.20,
  profit_contribution: 0.25,
  penetration_speed:   0.10,
  sustainability:      0.25,
  psychology_scarcity: 0.10,
  financial_readiness: 0.10,
}

export const SCORE_LABELS: Record<string, string> = {
  directness:          '직접성',
  profit_contribution: '이익 기여도',
  penetration_speed:   '침투 속도',
  sustainability:      '지속성',
  psychology_scarcity: '심리/희소성',
  financial_readiness: '재무 준비도',
}

// ─────────────────────────────────────────────────────────────
// 점수 계산 (서버 사이드)
// ─────────────────────────────────────────────────────────────
export interface ScoreBreakdown {
  directness:          number // 0~100
  profit_contribution: number
  penetration_speed:   number
  sustainability:      number
  psychology_scarcity: number
  financial_readiness: number
}

export function calcScores(b: ScoreBreakdown): { short_score: number; long_score: number } {
  const short_score = Math.round(
    b.directness          * SHORT_WEIGHTS.directness +
    b.profit_contribution * SHORT_WEIGHTS.profit_contribution +
    b.penetration_speed   * SHORT_WEIGHTS.penetration_speed +
    b.sustainability      * SHORT_WEIGHTS.sustainability +
    b.psychology_scarcity * SHORT_WEIGHTS.psychology_scarcity +
    b.financial_readiness * SHORT_WEIGHTS.financial_readiness
  )
  const long_score = Math.round(
    b.directness          * LONG_WEIGHTS.directness +
    b.profit_contribution * LONG_WEIGHTS.profit_contribution +
    b.penetration_speed   * LONG_WEIGHTS.penetration_speed +
    b.sustainability      * LONG_WEIGHTS.sustainability +
    b.psychology_scarcity * LONG_WEIGHTS.psychology_scarcity +
    b.financial_readiness * LONG_WEIGHTS.financial_readiness
  )
  return { short_score, long_score }
}

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────
export interface BeneficiaryResult {
  name:            string
  code:            string
  score_breakdown: ScoreBreakdown
  narrative:       string
}

/** DB 저장 또는 API 응답에 포함된 최종 수혜주 데이터 (점수 계산 완료) */
export interface ScoredBeneficiary extends BeneficiaryResult {
  short_score: number
  long_score:  number
}

export interface GeminiAnalysisResult {
  beneficiaries: BeneficiaryResult[]
}

// ─────────────────────────────────────────────────────────────
// System Prompt
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `당신은 대한민국 주식 시장 전문 애널리스트입니다.
주어진 뉴스 또는 리포트 내용을 분석하여, 해당 사건으로 인해 상승 가능성이 높은 국내 상장 주식 수혜 종목을 식별합니다.

## 수혜 강도 평가 기준 (각 지표: 0~100 정수)

아래 6가지 지표를 각각 0~100 사이의 정수로 평가하세요.
최종 점수는 시스템이 가중치를 적용하여 계산하므로 score 필드는 출력하지 마세요.

| 지표 | 변수명 | 평가 핵심 질문 |
|---|---|---|
| 직접성 | directness | 뉴스 내용이 실적에 즉각 연결되는가? |
| 이익 기여도 | profit_contribution | 매출 증대뿐 아니라 순이익이 높은가? |
| 침투 속도 | penetration_speed | 해당하는 시장이 얼마나 뉴스나 기사에 민감하게 반응하는가? |
| 지속성 | sustainability | 일회성인가, 구조적 변화인가? |
| 심리/희소성 | psychology_scarcity | 투자자들이 열광할 키워드인가? (독점성) |
| 재무 준비도 | financial_readiness | 호재를 감당할 돈과 설비가 있는가? |

## 분석 내러티브 구조
반드시 아래 4단계 형식으로 서술하세요. 각 단계는 → 로 구분합니다.
**각 단계는 문구 하나로만 작성하세요. 절대 두 문장 이상 쓰지 마세요.**
**한국어 띄어쓰기 규칙을 반드시 준수하세요. 단어와 단어 사이에 반드시 공백을 넣으세요.**
**각 단계는 공백 포함 30~50자 내외로 작성하세요.**

- 1단계 (사건): "~했음", "~함", 또는 명사형으로 끝낼 것. ("~사건" 금지)
- 2단계 (현상): "~했음", "~함", 또는 명사형으로 끝낼 것. ("~현상" 금지)
- 3단계 (산업/수요 변화): 형식 자유.
- 4단계 (기업 이익): "~했음", "~함", 또는 명사형으로 끝낼 것. ("~기업 이익" 금지)

## 출력 형식 (JSON만 반환, 다른 텍스트 없음)
\`\`\`json
{
  "beneficiaries": [
    {
      "name": "종목명",
      "code": "6자리 종목코드",
      "score_breakdown": {
        "directness": 75,
        "profit_contribution": 60,
        "penetration_speed": 80,
        "sustainability": 50,
        "psychology_scarcity": 70,
        "financial_readiness": 55
      },
      "narrative": "A 발생함 → B 심화됨 → C 수요 증가 → D 매출 급증"
    }
  ]
}
\`\`\`

## 규칙
- 수혜 종목은 3~7개 사이로 식별하세요.
- 수혜 종목을 뽑는 기준은 수혜 강도 평가 기준의 6가지 지표를 기반으로 해서 상위 4~6개의 종목을 선정합니다.
- KOSPI, KOSDAQ, KONEX 상장 종목만 포함하세요.
- 종목코드는 반드시 6자리 숫자로 작성하세요.
- score 필드는 절대 출력하지 마세요. score_breakdown의 6개 지표만 출력하세요.
- JSON 외의 텍스트는 절대 출력하지 마세요.`

// ─────────────────────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────────────────────
function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('too many requests')
}

async function generateWithFallback(
  fn: (client: GoogleGenerativeAI, keyIndex: number) => Promise<string>,
  modelNames?: string[]
): Promise<string> {
  if (API_KEYS.length === 0) {
    throw new Error('Gemini API 키가 설정되지 않았습니다. .env.local에 GEMINI_API_KEY_1을 확인해주세요.')
  }

  let lastError: unknown
  for (let i = 0; i < API_KEYS.length; i++) {
    const modelLabel = modelNames?.[i] ?? '(unknown)'
    try {
      console.log(`[Gemini] KEY_${i + 1} (${modelLabel}) 시도 중...`)
      const client = new GoogleGenerativeAI(API_KEYS[i])
      const result = await fn(client, i)
      console.log(`[Gemini] KEY_${i + 1} (${modelLabel}) 성공`)
      return result
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      if (isQuotaError(err)) {
        console.warn(`[Gemini] KEY_${i + 1} (${modelLabel}) quota 초과 → ${i < API_KEYS.length - 1 ? '다음 키로 전환' : '모든 키 소진'}`)
        if (i < API_KEYS.length - 1) continue
        throw new Error('토큰을 전부 사용했습니다.')
      }
      console.error(`[Gemini] KEY_${i + 1} (${modelLabel}) 오류:`, msg)
      throw err
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Gemini API 오류: ${msg}`)
}

// ─────────────────────────────────────────────────────────────
// 공개 함수
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// PDF 제목 추출 (원문 텍스트 탐색 전용)
// ─────────────────────────────────────────────────────────────
const TITLE_PROMPT = `아래는 PDF 문서 첫 페이지에서 추출한 텍스트입니다.
이 텍스트에 실제로 존재하는 단어만을 사용하여 문서의 제목을 반환하세요.

규칙:
1. 증권/투자 리포트인 경우: 텍스트에서 [증권사명] [종목명] [리포트 소제목]을 찾아 공백으로 이어붙여 반환
   예) "BNK투자증권 크래프톤 두마리 토끼를 잡아야 할 때"
2. 뉴스 기사 / 일반 문서: 가장 눈에 띄는 헤드라인 줄을 그대로 반환
3. 원문에 없는 단어를 만들거나 요약하지 말 것
4. 제목 텍스트만 한 줄로 반환. 설명이나 따옴표 없이.`

export async function extractPdfTitle(firstPageText: string): Promise<string | null> {
  const prompt = `${TITLE_PROMPT}\n\n텍스트:\n${firstPageText.slice(0, 1500)}`

  try {
    const raw = await generateWithFallback(
      (client) => {
        const model = client.getGenerativeModel({ model: VALIDATION_MODEL })
        return model.generateContent(prompt).then((r) => r.response.text())
      },
      API_KEYS.map(() => VALIDATION_MODEL)
    )

    const candidate = raw.trim().replace(/^["']|["']$/g, '').trim()
    if (!candidate || candidate.length < 2) return null

    // 검증: AI 반환값의 단어 중 하나 이상이 원문에 실제 존재해야 함
    const words = candidate.split(/\s+/).filter((w) => w.length >= 2)
    const isValid = words.some((w) => firstPageText.includes(w))
    if (!isValid) return null

    return candidate.slice(0, 200)
  } catch {
    return null
  }
}

export async function isNewsOrResearch(content: string): Promise<boolean> {
  const prompt = `다음 텍스트가 뉴스 기사 또는 금융/투자 리서치 자료인지 판단하세요.
뉴스 또는 리서치 자료이면 "YES", 아니면 "NO"만 출력하세요. 다른 텍스트는 절대 출력하지 마세요.

텍스트:
${content.slice(0, 1000)}`

  const text = await generateWithFallback(
    (client) => {
      const model = client.getGenerativeModel({ model: VALIDATION_MODEL })
      return model.generateContent(prompt).then((r) => r.response.text())
    },
    API_KEYS.map(() => VALIDATION_MODEL)
  )
  return text.trim().toUpperCase().startsWith('YES')
}

export async function analyzeBeneficiaries(content: string): Promise<GeminiAnalysisResult> {
  const truncated = content.slice(0, MAX_ANALYSIS_CHARS)

  const text = await generateWithFallback(
    async (client, keyIndex) => {
      const model = client.getGenerativeModel({
        model: ANALYSIS_MODELS[keyIndex] ?? 'gemini-2.5-flash',
        systemInstruction: SYSTEM_PROMPT,
      })
      const result = await model.generateContent(truncated)
      return result.response.text()
    },
    ANALYSIS_MODELS
  )

  const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(jsonText) as GeminiAnalysisResult
  } catch {
    throw new Error(`Gemini 응답 파싱 실패: ${jsonText.slice(0, 200)}`)
  }
}
