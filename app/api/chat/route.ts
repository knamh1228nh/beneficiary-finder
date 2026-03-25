/**
 * app/api/chat/route.ts
 *
 * AntWiki AI Agent — Orchestrator
 *
 * 흐름:
 *   1. 사용자 메시지 수신
 *   2. Gemini generateContent 호출 (tools 포함)
 *   3. Gemini가 functionCall 반환 시 → 실제 로직 실행 → 결과를 functionResponse로 재전달
 *   4. Gemini가 최종 텍스트 반환 시 → 응답 (투자 면책 조항 첨부)
 *   5. MAX_LOOPS 초과 시 안전하게 종료
 */

import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai'
import { customFunctionsTool, TOOL_NAMES } from '@/lib/tools/definitions'
import { executeBeneficiaryTool } from '@/lib/tools/beneficiary-logic'
import { supabaseServer } from '@/lib/supabase-server'

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────
const MAX_LOOPS = 5

const DISCLAIMER = `\n\n---\n⚠️ **투자 면책 조항**: 본 분석은 AI가 생성한 정보이며 투자 권유가 아닙니다. 실제 투자 결정은 반드시 본인의 판단과 책임 하에 이루어져야 하며, 전문 금융 어드바이저와 상담하시기 바랍니다.`

const SYSTEM_PROMPT = `당신은 AntWiki의 AI 투자 비서입니다. 사용자의 질문을 분석하여 적절한 도구를 선택하고 실행합니다.

## 역할
- 뉴스 URL이 주어지면 find_beneficiaries 도구로 수혜 종목을 분석합니다.
- 특정 테마, 섹터, 종목에 대한 질문은 get_antwiki_data 도구로 DB를 조회합니다.
- 최신 시장 동향이나 팩트 확인이 필요하면 검색을 활용합니다.

## 응답 규칙
- 도구 실행 결과를 바탕으로 명확하고 구체적으로 답변하세요.
- 수혜 종목 분석 결과는 종목명, 점수, 근거(내러티브)를 포함하세요.
- 결과를 찾을 수 없거나 도구가 실패한 경우 반드시 "해당 결과를 찾을 수 없습니다"라고 명시하세요.
- 모든 응답은 한국어로 작성하세요.
- 투자 관련 조언은 반드시 객관적 근거를 포함하며, 확실하지 않은 내용은 명시하세요.`

// ─────────────────────────────────────────────────────────────
// 도구 실행 디스패처
// ─────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (name === TOOL_NAMES.FIND_BENEFICIARIES) {
    const url = args.url as string
    if (!url) return { error: 'url 파라미터가 필요합니다.' }
    const result = await executeBeneficiaryTool(url)
    return result

  } else if (name === TOOL_NAMES.GET_ANTWIKI_DATA) {
    return await executeAntwikiQuery(
      args.query_type as string,
      args.keyword as string | undefined,
      args.limit as number | undefined
    )

  } else {
    return { error: `알 수 없는 도구: ${name}` }
  }
}

// ─────────────────────────────────────────────────────────────
// get_antwiki_data 실제 Supabase 쿼리
// ─────────────────────────────────────────────────────────────
async function executeAntwikiQuery(
  queryType: string,
  keyword?: string,
  limit: number = 5
): Promise<unknown> {
  const safeLimit = Math.min(Math.max(1, limit), 20)

  try {
    if (queryType === 'popular') {
      // 최근 24h 분석 성공 기사 중 인기 뉴스
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabaseServer
        .from('news_logs')
        .select('id, title, source_url, created_at')
        .eq('analyzed', true)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(safeLimit)

      if (error) throw error
      return { query_type: 'popular', results: data ?? [] }
    }

    if (queryType === 'stock') {
      if (!keyword) return { error: 'stock 조회 시 keyword(종목명 또는 코드)가 필요합니다.' }
      // beneficiaries 테이블에서 종목 검색
      const { data, error } = await supabaseServer
        .from('beneficiaries')
        .select('id, name, code, score, score_breakdown, narrative, news_log_id, created_at')
        .or(`name.ilike.%${keyword}%,code.eq.${keyword}`)
        .order('score', { ascending: false })
        .limit(safeLimit)

      if (error) throw error
      return { query_type: 'stock', keyword, results: data ?? [] }
    }

    if (queryType === 'theme') {
      if (!keyword) return { error: 'theme 조회 시 keyword(테마명)가 필요합니다.' }
      // 제목 또는 내러티브에서 테마 키워드 검색
      const { data: logs, error: logError } = await supabaseServer
        .from('news_logs')
        .select('id, title, source_url, created_at')
        .ilike('title', `%${keyword}%`)
        .eq('analyzed', true)
        .order('created_at', { ascending: false })
        .limit(safeLimit)

      if (logError) throw logError

      // 관련 뉴스의 수혜주도 함께 조회
      const logIds = (logs ?? []).map((l) => l.id)
      let beneficiaries: unknown[] = []
      if (logIds.length > 0) {
        const { data: bData } = await supabaseServer
          .from('beneficiaries')
          .select('name, code, score, narrative, news_log_id')
          .in('news_log_id', logIds)
          .order('score', { ascending: false })
          .limit(safeLimit * 3)

        beneficiaries = bData ?? []
      }

      return { query_type: 'theme', keyword, news: logs ?? [], beneficiaries }
    }

    return { error: `지원하지 않는 query_type: ${queryType}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: `DB 조회 실패: ${msg}` }
  }
}

// ─────────────────────────────────────────────────────────────
// Gemini 키 순환 (lib/gemini.ts와 동일한 전략)
// ─────────────────────────────────────────────────────────────
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
].filter(Boolean) as string[]

const CHAT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash']

// ─────────────────────────────────────────────────────────────
// POST /api/chat
// Body: { messages: { role: 'user' | 'model', parts: [{ text: string }] }[] }
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (API_KEYS.length === 0) {
    return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다.' }, { status: 500 })
  }

  let body: { messages?: Content[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문 파싱 실패' }, { status: 400 })
  }

  const messages = body.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages 배열이 필요합니다.' }, { status: 400 })
  }

  // 키 인덱스: 가용 첫 번째 키부터 시도
  let keyIndex = 0
  let client = new GoogleGenerativeAI(API_KEYS[keyIndex])
  let model = client.getGenerativeModel({
    model: CHAT_MODELS[keyIndex] ?? 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT,
  })

  // 대화 히스토리 (재귀 루프 내에서 누적)
  const contents: Content[] = [...messages]

  // 상태 추적 (클라이언트 스트리밍용)
  const toolCallLog: { tool: string; args: unknown; result: unknown }[] = []

  let loopCount = 0

  while (loopCount < MAX_LOOPS) {
    loopCount++

    let response
    try {
      response = await model.generateContent({
        contents,
        tools: [customFunctionsTool],
      })
    } catch (err) {
      // 쿼터 에러 시 다음 키로 교체
      const msg = err instanceof Error ? err.message : String(err)
      const isQuota =
        msg.includes('429') ||
        msg.toLowerCase().includes('quota') ||
        msg.toLowerCase().includes('too many requests')

      if (isQuota && keyIndex < API_KEYS.length - 1) {
        keyIndex++
        client = new GoogleGenerativeAI(API_KEYS[keyIndex])
        model = client.getGenerativeModel({
          model: CHAT_MODELS[keyIndex] ?? 'gemini-2.0-flash',
          systemInstruction: SYSTEM_PROMPT,
        })
        continue // 같은 contents로 재시도
      }

      return NextResponse.json(
        { error: isQuota ? '토큰을 전부 사용했습니다.' : msg },
        { status: 500 }
      )
    }

    const candidate = response.response.candidates?.[0]
    if (!candidate) {
      return NextResponse.json({ error: '모델 응답이 없습니다.' }, { status: 500 })
    }

    const parts: Part[] = candidate.content?.parts ?? []

    // ── 텍스트 최종 응답 ──
    const textPart = parts.find((p) => 'text' in p && typeof p.text === 'string')
    if (textPart && 'text' in textPart) {
      return NextResponse.json({
        reply: textPart.text + DISCLAIMER,
        tool_calls: toolCallLog,
      })
    }

    // ── functionCall 처리 ──
    const fnParts = parts.filter((p) => 'functionCall' in p)
    if (fnParts.length === 0) {
      // 텍스트도 없고 functionCall도 없는 경우
      return NextResponse.json({
        reply: '해당 결과를 찾을 수 없습니다.' + DISCLAIMER,
        tool_calls: toolCallLog,
      })
    }

    // 모델의 functionCall 메시지를 히스토리에 추가
    contents.push({ role: 'model', parts })

    // 각 functionCall 실행 후 functionResponse 수집
    const responseParts: Part[] = []

    for (const part of fnParts) {
      if (!('functionCall' in part)) continue
      const { name, args } = part.functionCall as { name: string; args: Record<string, unknown> }

      console.log(`[Agent] 도구 실행: ${name}`, args)
      const toolResult = await executeTool(name, args ?? {})

      toolCallLog.push({ tool: name, args, result: toolResult })

      responseParts.push({
        functionResponse: {
          name,
          response: { result: toolResult },
        },
      } as Part)
    }

    // functionResponse를 user 역할로 히스토리에 추가
    contents.push({ role: 'user', parts: responseParts })
  }

  // MAX_LOOPS 초과
  return NextResponse.json({
    reply: '해당 결과를 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.' + DISCLAIMER,
    tool_calls: toolCallLog,
  })
}
