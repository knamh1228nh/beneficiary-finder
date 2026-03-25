import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { parsePdf } from '@/lib/pdf-parser'
import { supabaseServer } from '@/lib/supabase-server'

const CACHE_TTL_DAYS = 14

function daysDiff(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }
  const { data: { user }, error: authError } = await supabaseServer.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: '인증에 실패했습니다' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'PDF 파일만 허용됩니다' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const { title, content, pageCount } = await parsePdf(buffer, file.name)

    // 내용 해시 계산 (중복 감지용)
    const contentHash = createHash('sha256').update(content).digest('hex')

    // ── STEP 1: 전체 계정 기준 동일 내용의 분석 결과 확인 (2주 이내) ──
    const { data: latestCache } = await supabaseServer
      .from('news_logs')
      .select('id, title, content, created_at')
      .eq('content_hash', contentHash)
      .eq('analyzed', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (latestCache && daysDiff(latestCache.created_at) < CACHE_TTL_DAYS) {
      const cachedDays = daysDiff(latestCache.created_at)

      // ── STEP 2: 이 계정이 이미 이 PDF를 분석한 적 있는지 확인 ──
      const { data: userEntry } = await supabaseServer
        .from('news_logs')
        .select('id')
        .eq('content_hash', contentHash)
        .eq('user_id', user.id)
        .eq('analyzed', true)
        .limit(1)
        .single()

      let targetId: string
      let isSameUserCache = false

      if (userEntry) {
        // 같은 계정 — 기존 항목 재사용
        targetId = userEntry.id
        isSameUserCache = true
      } else {
        // 다른 계정 — 이 계정용 새 항목 생성 + beneficiaries 복사
        const { data: newLog, error: newLogError } = await supabaseServer
          .from('news_logs')
          .insert({
            source_type:  'pdf',
            file_url:     null,
            title:        latestCache.title,
            content:      latestCache.content,
            content_hash: contentHash,
            user_id:      user.id,
            analyzed:     true,
          })
          .select('id')
          .single()

        if (newLogError || !newLog) throw newLogError

        // 원본 beneficiaries 복사
        const { data: srcBeneficiaries } = await supabaseServer
          .from('beneficiaries')
          .select('name, code, short_score, long_score, score_breakdown, narrative')
          .eq('news_log_id', latestCache.id)

        if (srcBeneficiaries?.length) {
          await supabaseServer
            .from('beneficiaries')
            .insert(srcBeneficiaries.map((b) => ({ ...b, news_log_id: newLog.id })))
        }

        targetId = newLog.id
      }

      // 캐시 결과 반환
      const { data: beneficiaries } = await supabaseServer
        .from('beneficiaries')
        .select('name, code, short_score, long_score, score_breakdown, narrative')
        .eq('news_log_id', targetId)
        .order('short_score', { ascending: false })

      return NextResponse.json({
        id:              targetId,
        title:           latestCache.title,
        cached:          true,
        same_user_cache: isSameUserCache,
        cached_days:     cachedDays,
        beneficiaries:   beneficiaries ?? [],
        pageCount,
      })
    }

    // ── STEP 3: 신선한 캐시 없음 — Storage 업로드 후 DB 저장 ──
    const safeName = file.name.replace(/\s+/g, '_').replace(/[^\w.\-]/g, '')
    const fileName = `${Date.now()}_${safeName || 'report'}.pdf`

    const { error: storageError } = await supabaseServer.storage
      .from('pdf-reports')
      .upload(fileName, buffer, { contentType: 'application/pdf' })

    if (storageError) throw storageError

    const { data: { publicUrl } } = supabaseServer.storage
      .from('pdf-reports')
      .getPublicUrl(fileName)

    const { data, error } = await supabaseServer
      .from('news_logs')
      .insert({
        source_type:  'pdf',
        file_url:     publicUrl,
        title,
        content,
        content_hash: contentHash,
        user_id:      user.id,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ ...data, cached: false, pageCount })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
