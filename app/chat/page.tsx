'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ChatWindow, ChatMessage, ToolCall } from '@/components/ChatWindow'

// ─────────────────────────────────────────────────────────────
// 추천 프롬프트 (빈 화면 표시용)
// ─────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  { icon: '📰', label: '뉴스 수혜주 분석', text: '이 뉴스의 수혜주를 분석해줘: ' },
  { icon: '🔥', label: '인기 테마 조회', text: 'AI 반도체 관련 최근 분석 결과를 보여줘' },
  { icon: '🏢', label: '특정 종목 이력', text: '삼성전자 수혜 분석 이력을 찾아줘' },
  { icon: '📊', label: '최근 인기 뉴스', text: '최근 24시간 인기 분석 뉴스를 알려줘' },
]

// ─────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // localStorage에서 세션 토큰 로드
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setToken(session?.access_token ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // textarea 자동 높이 조절
  useEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessage = { role: 'user', text: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    // API 호출용 Content 형식으로 변환 (기존 대화 포함)
    const history = [...messages, userMsg].map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: history }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: `오류가 발생했습니다: ${data.error ?? res.statusText}` },
        ])
        return
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        text: data.reply ?? '응답을 받지 못했습니다.',
        toolCalls: (data.tool_calls as ToolCall[]) ?? [],
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const msg = err instanceof Error ? err.message : '네트워크 오류가 발생했습니다.'
      setMessages((prev) => [...prev, { role: 'assistant', text: msg }])
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0 && !isLoading

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white">
      {/* ── 헤더 ── */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-zinc-800/70">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 hover:opacity-75 transition"
        >
          <span className="text-xl">🐜</span>
          <span className="font-semibold text-white">AntWiki</span>
          <span className="text-xs text-amber-400 border border-amber-400/40 rounded-full px-2 py-0.5">AI Agent</span>
        </button>

        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition px-2 py-1"
            >
              새 대화
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            className="text-xs text-zinc-400 hover:text-white transition px-3 py-1.5 border border-zinc-700 rounded-lg"
          >
            수혜주 찾기
          </button>
        </div>
      </header>

      {/* ── 채팅 영역 ── */}
      <main className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* 빈 화면 — 웰컴 */
          <div className="flex flex-col items-center justify-center h-full gap-8 px-6 pb-16">
            <div className="text-center space-y-2">
              <div className="text-5xl mb-4">🐜</div>
              <h1 className="text-2xl font-semibold text-white">AntWiki AI Agent</h1>
              <p className="text-zinc-400 text-sm max-w-xs">
                뉴스 URL을 붙여넣거나 투자 관련 질문을 입력하세요.
              </p>
            </div>

            {/* 추천 프롬프트 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setInput(s.text)
                    setTimeout(() => inputRef.current?.focus(), 50)
                  }}
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-zinc-700/60 bg-zinc-900/60 hover:border-amber-500/50 hover:bg-zinc-800/60 transition text-left group"
                >
                  <span className="text-lg shrink-0">{s.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-zinc-200 group-hover:text-white transition">{s.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{s.text.replace(': ', '')}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6">
            <ChatWindow messages={messages} isLoading={isLoading} />
          </div>
        )}
      </main>

      {/* ── 입력창 ── */}
      <div className="shrink-0 border-t border-zinc-800/70 bg-zinc-950 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3 bg-zinc-800/70 border border-zinc-700/60 rounded-2xl px-4 py-3 focus-within:border-amber-500/50 transition-colors">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="뉴스 URL 또는 질문을 입력하세요... (Shift+Enter: 줄바꿈)"
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none outline-none leading-relaxed disabled:opacity-50"
              style={{ minHeight: '24px' }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || isLoading}
              className="shrink-0 w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black font-bold text-sm flex items-center justify-center transition-colors"
            >
              {isLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
              ) : (
                '↑'
              )}
            </button>
          </div>
          <p className="text-[11px] text-zinc-600 text-center mt-2">
            AntWiki AI는 투자 참고용 정보를 제공하며, 투자 결과에 대한 책임을 지지 않습니다.
          </p>
        </div>
      </div>
    </div>
  )
}
