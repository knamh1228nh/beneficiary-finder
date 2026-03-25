/**
 * lib/tools/definitions.ts
 *
 * Gemini SDK가 인식하는 FunctionDeclaration 정의
 * 오케스트레이터(app/api/chat/route.ts)에서 tools 배열에 주입합니다.
 */

import type { Tool, FunctionDeclaration } from '@google/generative-ai'
import { SchemaType } from '@google/generative-ai'

// ─────────────────────────────────────────────────────────────
// 도구 1: find_beneficiaries
// 뉴스 URL을 받아 수혜주 분석 파이프라인 실행
// ─────────────────────────────────────────────────────────────
const findBeneficiaries: FunctionDeclaration = {
  name: 'find_beneficiaries',
  description:
    '뉴스 기사 또는 금융 리서치 URL을 분석하여 해당 사건으로 인해 상승 가능성이 높은 국내 주식 수혜 종목을 식별합니다. ' +
    '종목명, 종목코드, 수혜 강도 점수(100점 만점), 4가지 지표 세부 점수, 투자 내러티브를 반환합니다.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      url: {
        type: SchemaType.STRING,
        description: '분석할 뉴스 기사 또는 금융 리서치 리포트의 URL',
      },
    },
    required: ['url'],
  },
}

// ─────────────────────────────────────────────────────────────
// 도구 2: get_antwiki_data
// Supabase에서 AntWiki 테마/섹터 정보 조회
// ─────────────────────────────────────────────────────────────
const getAntwikiData: FunctionDeclaration = {
  name: 'get_antwiki_data',
  description:
    'AntWiki 데이터베이스에서 특정 종목 또는 테마/섹터의 투자 데이터를 조회합니다. ' +
    '과거 수혜주 분석 이력, 인기 테마, 관련 종목 정보를 반환합니다.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      query_type: {
        type: SchemaType.STRING,
        format: 'enum',
        description: '조회 유형: "theme" (테마/섹터 조회), "stock" (특정 종목 이력), "popular" (인기 분석 목록)',
        enum: ['theme', 'stock', 'popular'],
      },
      keyword: {
        type: SchemaType.STRING,
        description:
          'query_type이 "theme"일 때 테마명(예: "AI", "반도체"), "stock"일 때 종목명 또는 종목코드. ' +
          '"popular" 조회 시 생략 가능.',
      },
      limit: {
        type: SchemaType.NUMBER,
        description: '반환할 최대 결과 수 (기본값: 5, 최대: 20)',
      },
    },
    required: ['query_type'],
  },
}

// ─────────────────────────────────────────────────────────────
// 도구 3: Google Search (Gemini 내장 grounding 도구)
// 최신 팩트 체크 및 실시간 지표 검색용
// ─────────────────────────────────────────────────────────────
export const googleSearchTool: Tool = {
  googleSearchRetrieval: {},
}

// ─────────────────────────────────────────────────────────────
// 커스텀 함수 도구 묶음 (find_beneficiaries + get_antwiki_data)
// ─────────────────────────────────────────────────────────────
export const customFunctionsTool: Tool = {
  functionDeclarations: [findBeneficiaries, getAntwikiData],
}

// 오케스트레이터에서 사용할 전체 도구 목록
// Google Search는 다른 functionDeclarations와 함께 쓸 수 없어 분리합니다.
// 사용 시: tools: [customFunctionsTool] 또는 tools: [googleSearchTool]
export const ALL_CUSTOM_TOOLS: Tool[] = [customFunctionsTool]

// 도구 이름 상수 (route.ts에서 분기 처리용)
export const TOOL_NAMES = {
  FIND_BENEFICIARIES: 'find_beneficiaries',
  GET_ANTWIKI_DATA: 'get_antwiki_data',
} as const

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES]
