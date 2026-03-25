'use client'

import { useEffect, useRef, useState } from 'react'
import { BeneficiaryCard, BeneficiaryCardData } from './BeneficiaryCard'
import { StatusIndicator } from './StatusIndicator'

export interface ToolCall {
  tool: string
  args: unknown
  result: unknown
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls?: ToolCall[]
}

interface ChatWindowProps {
  messages: ChatMessage[]
  isLoading: boolean
}

// 응답 텍스트에서 면책조항 분리
function splitDisclaimer(text: string): { body: string; disclaimer: string } {
  const sep = '\n\n---\n'
  const idx = text.lastIndexOf(sep)
  if (idx === -1) return { body: text, disclaimer: '' }
  return { body: text.slice(0, idx), disclaimer: text.slice(idx + sep.length) }
}

// find_beneficiaries 결과에서 수혜주 카드 데이터 추출
function extractBeneficiaries(toolCalls: ToolCall[]): BeneficiaryCardData[] {
  for (const tc of toolCalls) {
    if (tc.tool === 'find_beneficiaries') {
      const result = tc.result as { success?: boolean; beneficiaries?: BeneficiaryCardData[] }
      if (result?.success && Array.isArray(result.beneficiaries)) {
        return result.beneficiaries
      }
    }
  }
  return []
}

// 마크다운 굵은체 처리 (** 만 처리)
function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

// 타이핑 애니메이션 훅
function useTypewriter(text: string, active: boolean) {
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    if (!active) {
      setDisplayed(text)
      return
    }
    setDisplayed('')
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 8)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return displayed
}

function AssistantMessage({
  msg,
  isLatest,
}: {
  msg: ChatMessage
  isLatest: boolean
}) {
  const { body, disclaimer } = splitDisclaimer(msg.text)
  const displayed = useTypewriter(body, isLatest)
  const beneficiaries = msg.toolCalls ? extractBeneficiaries(msg.toolCalls) : []

  return (
    <div className="flex gap-3">
      {/* 아이콘 */}
      <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm shrink-0 mt-0.5">
        🐜
      </div>

      <div className="flex-1 space-y-3 min-w-0">
        {/* 텍스트 */}
        <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
          {displayed.split('\n').map((line, i) => (
            <p key={i} className={line === '' ? 'h-3' : ''}>
              {line !== '' && renderText(line)}
            </p>
          ))}
          {isLatest && displayed.length < body.length && (
            <span className="inline-block w-0.5 h-4 bg-amber-400 animate-pulse ml-0.5 align-middle" />
          )}
        </div>

        {/* 수혜주 카드 */}
        {beneficiaries.length > 0 && displayed === body && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {beneficiaries.map((b) => (
              <BeneficiaryCard key={b.code} b={b} />
            ))}
          </div>
        )}

        {/* 면책 조항 */}
        {disclaimer && displayed === body && (
          <p className="text-[11px] text-zinc-600 leading-relaxed">{disclaimer.replace(/^⚠️\s*/, '⚠️ ')}</p>
        )}
      </div>
    </div>
  )
}

export function ChatWindow({ messages, isLoading }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (messages.length === 0 && !isLoading) return null

  return (
    <div className="space-y-6">
      {messages.map((msg, idx) => {
        if (msg.role === 'user') {
          return (
            <div key={idx} className="flex justify-end">
              <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-zinc-700/60 text-sm text-zinc-100 leading-relaxed">
                {msg.text}
              </div>
            </div>
          )
        }
        return (
          <AssistantMessage
            key={idx}
            msg={msg}
            isLatest={idx === messages.length - 1}
          />
        )
      })}

      {isLoading && (
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm shrink-0 mt-0.5">
            🐜
          </div>
          <div className="pt-1">
            <StatusIndicator isLoading={isLoading} />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
