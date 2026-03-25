'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import BeneficiaryTable from '@/components/BeneficiaryTable'
import type { ScoredBeneficiary } from '@/lib/gemini'

interface NewsLog {
  id: string
  title: string
  source_type: 'url' | 'pdf'
  source_url: string | null
  file_url: string | null
  content: string
  created_at: string
}

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [log, setLog] = useState<NewsLog | null>(null)
  const [beneficiaries, setBeneficiaries] = useState<ScoredBeneficiary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    async function fetchDetail() {
      const [{ data: logData, error: logError }, { data: bData, error: bError }] =
        await Promise.all([
          supabase
            .from('news_logs')
            .select('id, title, source_type, source_url, file_url, content, created_at')
            .eq('id', id)
            .single(),
          supabase
            .from('beneficiaries')
            .select('name, code, short_score, long_score, score_breakdown, narrative, created_at')
            .eq('news_log_id', id)
            .order('created_at', { ascending: false })
            .order('short_score', { ascending: false }),
        ])

      if (logError) { setError(logError.message); setLoading(false); return }
      if (bError)   { setError(bError.message);   setLoading(false); return }

      setLog(logData)
      setBeneficiaries(bData ?? [])
      setLoading(false)
    }

    fetchDetail()
  }, [id])

  if (loading) return <div className="max-w-[58rem] mx-auto p-8 text-zinc-400 text-sm">불러오는 중...</div>
  if (error)   return <div className="max-w-[58rem] mx-auto p-8 text-red-500 text-sm">{error}</div>
  if (!log)    return <div className="max-w-[58rem] mx-auto p-8 text-zinc-400 text-sm">데이터를 찾을 수 없습니다.</div>

  return (
    <main className="max-w-[58rem] mx-auto p-8">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.push('/history')}
        className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-700 transition mb-6"
      >
        ← 히스토리로
      </button>

      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium
            ${log.source_type === 'url' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
            {log.source_type === 'url' ? 'URL' : 'PDF'}
          </span>
          <span className="text-xs text-zinc-400">
            {new Date(log.created_at).toLocaleDateString('ko-KR', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </span>
        </div>
        <h1 className="text-xl font-bold text-zinc-900">{log.title || '(제목 없음)'}</h1>
        {log.source_url && (
          <a href={log.source_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline mt-1 block truncate">
            {log.source_url}
          </a>
        )}
      </div>

      {/* 수혜주 결과 */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          수혜 종목 {beneficiaries.length}개
        </h2>
        {beneficiaries.length > 0
          ? <BeneficiaryTable beneficiaries={beneficiaries} />
          : <p className="text-zinc-400 text-sm">분석된 수혜 종목이 없습니다.</p>
        }
      </div>

      {/* 원문 토글 */}
      <div>
        <button
          onClick={() => setShowContent(!showContent)}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800 transition"
        >
          <span>{showContent ? '▲' : '▼'}</span>
          원문 보기
        </button>
        {showContent && (
          <div className="mt-3 border rounded-xl p-4 bg-zinc-50 text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
            {log.content}
          </div>
        )}
      </div>
    </main>
  )
}
