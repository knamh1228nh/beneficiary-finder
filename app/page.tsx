'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BeneficiaryTable from '@/components/BeneficiaryTable'
import Header from '@/components/Header'
import LoginModal from '@/components/LoginModal'
import type { ScoredBeneficiary } from '@/lib/gemini'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

type Step = 'idle' | 'collecting' | 'analyzing' | 'done' | 'error'

interface AnalysisResult {
  news_log_id:      string
  title:            string
  beneficiaries:    ScoredBeneficiary[]
  cached?:          boolean
  same_user_cache?: boolean
  cached_days?:     number
}

interface PopularNews {
  title: string
  url: string | null
  count: number
  id: string
}

export default function Home() {
  const router = useRouter()
  const [tab, setTab] = useState<'url' | 'pdf'>('url')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [popular, setPopular] = useState<PopularNews[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    fetchPopular()
    return () => subscription.unsubscribe()
  }, [])

  async function fetchPopular() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('news_logs')
      .select('id, title, source_url, created_at')
      .gte('created_at', cutoff)
      .eq('analyzed', true)
      .order('created_at', { ascending: false })

    if (!data) return
    const grouped = new Map<string, PopularNews>()
    for (const log of data) {
      const key = log.source_url || log.title || log.id
      if (grouped.has(key)) {
        grouped.get(key)!.count++
      } else {
        grouped.set(key, { title: log.title || '(제목 없음)', url: log.source_url, count: 1, id: log.id })
      }
    }
    setPopular([...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 10))
  }

  async function getAuthHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return {}
    return { 'Authorization': `Bearer ${session.access_token}` }
  }

  async function runAnalysis(newsLogId: string, title: string) {
    setStep('analyzing')
    const authHeader = await getAuthHeader()
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ news_log_id: newsLogId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setResult({ news_log_id: newsLogId, title, beneficiaries: data.beneficiaries })
    setStep('done')
    fetchPopular()
  }

  async function handleUrlSubmit() {
    if (!user) { setShowLoginModal(true); return }
    if (!url) return
    setStep('collecting'); setError(''); setResult(null)
    try {
      const authHeader = await getAuthHeader()
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.cached) {
        setResult({ news_log_id: data.id, title: data.title, beneficiaries: data.beneficiaries, cached: true, same_user_cache: data.same_user_cache, cached_days: data.cached_days })
        setStep('done')
        fetchPopular()
      } else {
        await runAnalysis(data.id, data.title)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
      setStep('error')
    }
  }

  async function handlePdfSubmit() {
    if (!user) { setShowLoginModal(true); return }
    if (!file) return
    setStep('collecting'); setError(''); setResult(null)
    try {
      const authHeader = await getAuthHeader()
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        headers: authHeader,
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.cached) {
        setResult({ news_log_id: data.id, title: data.title, beneficiaries: data.beneficiaries, cached: true, same_user_cache: data.same_user_cache, cached_days: data.cached_days })
        setStep('done')
        fetchPopular()
      } else {
        await runAnalysis(data.id, data.title)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
      setStep('error')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !isLoading) handleUrlSubmit()
  }

  const isLoading = step === 'collecting' || step === 'analyzing'

  return (
    <>
      <Header />

      <div className="max-w-[86rem] mx-auto p-8 flex gap-6">
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

            {popular.length === 0 ? (
              <div className="p-4 text-xs text-zinc-400 text-center py-8">
                아직 분석된 뉴스가 없습니다.
              </div>
            ) : (
              <ul className="divide-y">
                {popular.map((item, i) => (
                  <li key={i}>
                    <button
                      onClick={() => router.push(`/history/${item.id}`)}
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

        {/* 오른쪽: 메인 분석 영역 */}
        <main className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold mb-2">수혜주 찾기</h1>
          <p className="text-zinc-500 text-sm mb-8">뉴스 URL 또는 PDF 리포트를 입력하면 AI가 수혜 종목을 분석합니다.</p>

          {/* 탭 */}
          <div className="flex gap-2 mb-4">
            {(['url', 'pdf'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} disabled={isLoading}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition
                  ${tab === t ? 'bg-black text-white border-black' : 'bg-white text-zinc-700 hover:bg-zinc-50'}`}>
                {t === 'url' ? 'URL 입력' : 'PDF 업로드'}
              </button>
            ))}
          </div>

          {/* 입력 영역 */}
          {tab === 'url' ? (
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://news.example.com/article/..."
                disabled={isLoading}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50"
              />
              <button onClick={handleUrlSubmit} disabled={!url || isLoading}
                className="px-5 py-2 bg-black text-white text-sm rounded-lg disabled:opacity-40 hover:bg-zinc-800 transition">
                분석
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="file" accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={isLoading}
                className="flex-1 border rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
              <button onClick={handlePdfSubmit} disabled={!file || isLoading}
                className="px-5 py-2 bg-black text-white text-sm rounded-lg disabled:opacity-40 hover:bg-zinc-800 transition">
                분석
              </button>
            </div>
          )}

          {/* 투자 면책 조항 */}
          <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed">
            ⚠️ 본 분석은 AI가 생성한 정보이며 투자 권유가 아닙니다. 투자 결정은 반드시 본인의 판단과 책임 하에 이루어져야 합니다.
          </p>

          {/* 비로그인 안내 */}
          {!user && (
            <p className="mt-3 text-xs text-zinc-400">
              분석 기능은 로그인 후 이용 가능합니다.{' '}
              <button onClick={() => setShowLoginModal(true)} className="underline hover:text-zinc-600">
                로그인 / 회원가입
              </button>
            </p>
          )}

          {/* 로딩 단계 표시 */}
          {isLoading && (
            <div className="mt-6 flex items-center gap-4 text-sm text-zinc-600">
              <StepIndicator label="자료 수집" active={step === 'collecting'} done={step === 'analyzing'} />
              <div className="w-6 border-t border-zinc-300" />
              <StepIndicator label="AI 분석" active={step === 'analyzing'} done={false} />
            </div>
          )}

          {/* 오류 */}
          {step === 'error' && <p className="mt-4 text-red-500 text-sm whitespace-pre-line">{error}</p>}

          {/* 분석 결과 */}
          {step === 'done' && result && (
            <div className="mt-8">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs text-zinc-400">분석 완료</p>
                {result.same_user_cache && (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full font-medium">
                    ⚡ 캐시됨 — 토큰 절약
                  </span>
                )}
                {result.cached && result.cached_days !== undefined && result.cached_days > 0 && (
                  <span className="text-xs text-zinc-400">
                    현재 날짜 기준 {result.cached_days}일 전 분석된 정보입니다
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold mb-4 text-zinc-800">{result.title}</h2>
              <BeneficiaryTable beneficiaries={result.beneficiaries} />
            </div>
          )}
        </main>
      </div>

      {/* 로그인 모달 */}
      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  )
}

function StepIndicator({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${done ? 'text-zinc-400 line-through' : active ? 'text-black font-semibold' : 'text-zinc-400'}`}>
      {active && <span className="w-3 h-3 rounded-full border-2 border-black border-t-transparent animate-spin inline-block" />}
      {done && <span className="text-zinc-400">✓</span>}
      {label}
    </div>
  )
}
