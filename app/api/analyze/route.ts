import { NextRequest, NextResponse } from 'next/server'
import { analyzeBeneficiaries, calcScores } from '@/lib/gemini'
import { supabaseServer } from '@/lib/supabase-server'
import { verifyStockCode } from '@/lib/naver-stock'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }
  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: '인증에 실패했습니다' }, { status: 401 })
  }

  const { news_log_id } = await req.json()
  if (!news_log_id) {
    return NextResponse.json({ error: 'news_log_id가 필요합니다' }, { status: 400 })
  }

  const { data: log, error: fetchError } = await supabaseServer
    .from('news_logs')
    .select('id, title, content, source_type, source_url')
    .eq('id', news_log_id)
    .single()

  if (fetchError || !log) {
    return NextResponse.json({ error: '해당 뉴스 로그를 찾을 수 없습니다' }, { status: 404 })
  }

  try {
    // 1. Gemini 분석 (6개 지표 raw 점수 반환)
    const { beneficiaries } = await analyzeBeneficiaries(log.content)

    // 2. 네이버 금융으로 종목코드 검증
    const verified = await Promise.all(
      beneficiaries.map((b) => verifyStockCode(b.name, b.code))
    )

    // 3. short_score / long_score 계산 후 DB 저장
    const rows = beneficiaries.map((b, i) => {
      const { short_score, long_score } = calcScores(b.score_breakdown)
      return {
        news_log_id: log.id,
        name:            verified[i].name,
        code:            verified[i].code,
        short_score,
        long_score,
        score_breakdown: b.score_breakdown,
        narrative:       b.narrative,
      }
    })

    // 기존 beneficiaries 삭제 후 재삽입 (재분석 시 중복 방지)
    await supabaseServer
      .from('beneficiaries')
      .delete()
      .eq('news_log_id', log.id)

    const { data: saved, error: insertError } = await supabaseServer
      .from('beneficiaries')
      .insert(rows)
      .select()

    if (insertError) throw insertError

    await supabaseServer
      .from('news_logs')
      .update({ analyzed: true })
      .eq('id', log.id)

    return NextResponse.json({
      news_log_id: log.id,
      title:       log.title,
      beneficiaries: saved,
    })
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as Record<string, unknown>).message)
          : JSON.stringify(err)
    console.error('[analyze] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
