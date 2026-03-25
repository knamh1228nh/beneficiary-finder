'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import type { User } from '@supabase/supabase-js'

function detailUrl(id: string) {
  return `/history/${id}`
}

interface NewsLog {
  id: string
  title: string
  source_type: 'url' | 'pdf'
  source_url: string | null
  created_at: string
  beneficiary_count: number
  analyzed: boolean
}

interface PopularNews {
  title: string
  url: string | null
  count: number
  id: string
}

const PAGE_SIZE = 10

export default function HistoryPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [myLogs, setMyLogs] = useState<NewsLog[]>([])
  const [popular, setPopular] = useState<PopularNews[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      fetchData(data.user)
    })
  }, [])

  async function fetchData(currentUser: User | null) {
    setLoading(true)

    // 실시간 인기 뉴스: 전체 사용자, 최근 24시간, 분석 성공한 것만
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentAll } = await supabase
      .from('news_logs')
      .select('id, title, source_url, created_at')
      .gte('created_at', cutoff)
      .eq('analyzed', true)
      .order('created_at', { ascending: false })

    if (recentAll) {
      const grouped = new Map<string, PopularNews>()
      for (const log of recentAll) {
        const key = log.source_url || log.title || log.id
        if (grouped.has(key)) {
          grouped.get(key)!.count++
        } else {
          grouped.set(key, {
            title: log.title || '(제목 없음)',
            url: log.source_url,
            count: 1,
            id: log.id,
          })
        }
      }
      const sorted = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 10)
      setPopular(sorted)
    }

    // 내 히스토리: 로그인한 경우만
    if (currentUser) {
      const { data, error: fetchError } = await supabase
        .from('news_logs')
        .select('id, title, source_type, source_url, created_at, analyzed, beneficiaries(count)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setMyLogs(
          (data ?? []).map((row: any) => ({
            ...row,
            analyzed: row.analyzed ?? false,
            beneficiary_count: row.beneficiaries?.[0]?.count ?? 0,
          }))
        )
      }
    }

    setLoading(false)
  }

  return (
    <>
      <Header />

      <div className="max-w-[86rem] mx-auto p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">분석 히스토리</h1>
            <p className="text-zinc-500 text-sm mt-1">나의 분석 기록과 실시간 인기 뉴스를 확인하세요.</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-zinc-800 transition"
          >
            + 새 분석
          </button>
        </div>

        <div className="flex gap-6">
          {/* 왼쪽: 실시간 인기 뉴스 배너 */}
          <aside className="w-64 shrink-0">
            <div className="border rounded-xl overflow-hidden sticky top-24">
              <div className="bg-zinc-900 text-white px-4 py-3 flex items-center gap-2">
                <span className="text-red-400 text-sm animate-pulse">●</span>
                <span className="text-sm font-semibold">실시간 인기 뉴스 TOP 10</span>
              </div>
              <div className="bg-zinc-50 px-3 py-1.5 text-xs text-zinc-400 border-b">
                최근 24시간 기준
              </div>

              {loading ? (
                <div className="p-4 text-xs text-zinc-400">불러오는 중...</div>
              ) : popular.length === 0 ? (
                <div className="p-4 text-xs text-zinc-400 text-center py-8">
                  아직 분석된 뉴스가 없습니다.
                </div>
              ) : (
                <ul className="divide-y">
                  {popular.map((item, i) => (
                    <li key={i}>
                      <button
                        onClick={() => router.push(detailUrl(item.id))}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition"
                      >
                        <div className="flex items-start gap-2">
                          <span className={`text-xs font-bold mt-0.5 shrink-0 w-4 ${i < 3 ? 'text-red-500' : 'text-zinc-400'}`}>
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-800 line-clamp-2 leading-relaxed">
                              {item.title}
                            </p>
                            <p className="text-xs text-zinc-400 mt-0.5">{item.count}회 분석</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {/* 오른쪽: 내 히스토리 */}
          <main className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-zinc-800 mb-3">내 분석 기록</h2>

            {!user ? (
              <div className="border rounded-xl p-12 text-center text-zinc-400">
                <p className="text-base mb-1">로그인 후 이용 가능합니다.</p>
                <p className="text-sm">나의 분석 기록을 보려면 로그인하세요.</p>
                <button
                  onClick={() => router.push('/login')}
                  className="mt-4 px-4 py-2 bg-black text-white text-sm rounded-lg hover:bg-zinc-800 transition"
                >
                  로그인
                </button>
              </div>
            ) : loading ? (
              <p className="text-zinc-400 text-sm">불러오는 중...</p>
            ) : error ? (
              <p className="text-red-500 text-sm">{error}</p>
            ) : myLogs.length === 0 ? (
              <div className="border rounded-xl p-12 text-center text-zinc-400">
                <p className="text-base">아직 분석 기록이 없습니다.</p>
                <p className="text-sm mt-1">홈에서 URL 또는 PDF를 분석해보세요.</p>
              </div>
            ) : (() => {
              const totalPages = Math.ceil(myLogs.length / PAGE_SIZE)
              const pageLogs = myLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
              return (
                <>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-zinc-500 text-xs">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium">제목</th>
                          <th className="text-left px-4 py-3 font-medium">유형</th>
                          <th className="text-left px-4 py-3 font-medium">수혜주</th>
                          <th className="text-left px-4 py-3 font-medium">날짜</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageLogs.map((log, i) => (
                          <tr
                            key={log.id}
                            onClick={() => router.push(detailUrl(log.id))}
                            className={`border-t cursor-pointer hover:bg-blue-50 transition-colors
                              ${i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-zinc-900 truncate max-w-[220px]">{log.title || '(제목 없음)'}</p>
                                {!log.analyzed && (
                                  <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-500 font-medium">분석 실패</span>
                                )}
                              </div>
                              {log.source_url && (
                                <p className="text-xs text-zinc-400 truncate max-w-[240px] mt-0.5">{log.source_url}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium
                                ${log.source_type === 'url' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                                {log.source_type === 'url' ? 'URL' : 'PDF'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-zinc-700 font-semibold">
                              {log.beneficiary_count > 0 ? `${log.beneficiary_count}개` : <span className="text-zinc-300">-</span>}
                            </td>
                            <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">
                              {new Date(log.created_at).toLocaleDateString('ko-KR', {
                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-xs text-zinc-400">
                        전체 {myLogs.length}개 · {page}/{totalPages} 페이지
                      </p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-30 hover:bg-zinc-50 transition"
                        >
                          이전
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`px-3 py-1.5 text-xs border rounded-lg transition
                              ${p === page ? 'bg-black text-white border-black' : 'hover:bg-zinc-50'}`}
                          >
                            {p}
                          </button>
                        ))}
                        <button
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-30 hover:bg-zinc-50 transition"
                        >
                          다음
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </main>
        </div>
      </div>
    </>
  )
}
