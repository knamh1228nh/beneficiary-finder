'use client'

import { useState } from 'react'
import type { ScoredBeneficiary } from '@/lib/gemini'
import { SHORT_WEIGHTS, LONG_WEIGHTS, SCORE_LABELS } from '@/lib/gemini'

function stockUrl(code: string) {
  return `https://www.ant.wiki/wiki/${code}`
}

type HoverState = { code: string; type: 'short' | 'long' } | null

// 각 지표의 핵심 평가 질문 (말풍선 표시용)
const SCORE_QUESTIONS: Record<string, string> = {
  directness:          '뉴스 내용이 해당 기업의 실적(매출·비용)에 얼마나 즉각적으로 연결되는가?',
  profit_contribution: "단순 매출 증가를 넘어 '마진율' 개선까지 이어지는가?",
  penetration_speed:   '호재가 시장에 확산되어 수혜가 현실화되는 속도는 얼마나 빠른가?',
  sustainability:      '일회성 이슈인가, 아니면 구조적·장기적 변화인가?',
  psychology_scarcity: '투자자들이 열광할 독점 키워드나 테마를 형성하는가?',
  financial_readiness: '해당 기업이 호재를 실현할 자금력과 생산 설비를 갖추고 있는가?',
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-red-500'
  if (score >= 60) return 'text-orange-500'
  return 'text-yellow-500'
}
function scoreBarColor(score: number) {
  if (score >= 80) return 'bg-red-400'
  if (score >= 60) return 'bg-orange-400'
  return 'bg-yellow-400'
}
function gradeBadge(score: number) {
  if (score >= 80) return { label: '매우 강함', cls: 'bg-red-100 text-red-600' }
  if (score >= 60) return { label: '강함',    cls: 'bg-orange-100 text-orange-600' }
  if (score >= 40) return { label: '보통',    cls: 'bg-yellow-100 text-yellow-700' }
  return              { label: '약함',    cls: 'bg-zinc-100 text-zinc-500' }
}

// 내러티브 → 세로 스텝 렌더링
function NarrativeSteps({ text }: { text: string }) {
  const steps = text.split(/\s*→\s*/).filter(Boolean)
  return (
    <div className="flex flex-col gap-1">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="w-full border border-zinc-200 rounded-lg bg-zinc-50 px-3 py-1.5">
            <span className="text-xs text-zinc-600 leading-snug">{step}</span>
          </div>
          {i < steps.length - 1 && (
            <span className="text-base font-bold text-zinc-500 leading-none">↓</span>
          )}
        </div>
      ))}
    </div>
  )
}

// 지표 라벨 + 말풍선 툴팁
function IndicatorLabel({ keyName }: { keyName: string }) {
  return (
    <div className="relative group inline-block">
      <span className="text-xs text-zinc-700 font-medium cursor-help underline decoration-dotted underline-offset-2 select-none">
        {SCORE_LABELS[keyName]}
      </span>
      {/* 말풍선 팝업 */}
      <div className="pointer-events-none absolute left-0 top-full mt-2 z-50 hidden group-hover:block w-56 bg-zinc-900 text-white text-[11px] leading-relaxed rounded-xl px-3.5 py-2.5 shadow-2xl border border-zinc-700">
        {/* 위쪽 화살표 */}
        <div className="absolute -top-[7px] left-4 w-3.5 h-3.5 bg-zinc-900 border-l border-t border-zinc-700 rotate-45" />
        {SCORE_QUESTIONS[keyName]}
      </div>
    </div>
  )
}

// 수혜 강도 breakdown 내용 (div 반환 — tr 중첩 방지)
function BreakdownContent({ b, type }: { b: ScoredBeneficiary; type: 'short' | 'long' }) {
  const weights   = type === 'short' ? SHORT_WEIGHTS : LONG_WEIGHTS
  const typeLabel = type === 'short' ? '단기 투자형' : '장기 투자형'
  const accentCls = type === 'short' ? 'text-orange-500' : 'text-blue-500'
  const breakdown = b.score_breakdown as unknown as Record<string, number>
  const keys      = Object.keys(weights)

  return (
    <div className="px-4 pt-4 pb-6 w-full">
        {/* 헤더 */}
        <p className={`text-xs font-semibold mb-3 ${accentCls}`}>
          {typeLabel} 가중치 적용 로직
        </p>

        {/* 3열 그리드 — 전체 너비 활용 */}
        <div className="grid grid-cols-3 gap-x-5 gap-y-4 w-full">
          {keys.map((key) => {
            const raw          = breakdown[key] ?? 0
            const wPct         = Math.round(weights[key] * 100)
            const contribution = Math.round(raw * weights[key])

            return (
              <div key={key} className="flex flex-col gap-1.5 w-full min-w-0">
                {/* 라벨 행 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <IndicatorLabel keyName={key} />
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                      ${type === 'short' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                      {wPct}%
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    <span className="font-semibold text-zinc-800">{raw}</span>
                    <span className="mx-1 text-zinc-300">→</span>
                    <span className={`font-bold ${accentCls}`}>{contribution}pt</span>
                  </span>
                </div>

                {/* 막대 */}
                <div className="h-3 bg-zinc-200 rounded-full overflow-hidden w-full">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(raw)}`}
                    style={{ width: `${raw}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
    </div>
  )
}

export default function BeneficiaryTable({ beneficiaries }: { beneficiaries: ScoredBeneficiary[] }) {
  const [hovered, setHovered] = useState<HoverState>(null)
  const sorted = [...beneficiaries].sort((a, b) => b.short_score - a.short_score)

  return (
    // overflow-visible: 말풍선 툴팁이 잘리지 않도록
    <div className="border rounded-xl overflow-visible">
      <table className="w-full text-sm">
        <colgroup>
          <col className="w-[96px]" />
          <col className="w-[96px]" />
          <col className="w-[96px]" />
          <col className="w-[39rem]" />
        </colgroup>
        <thead className="bg-zinc-50 text-zinc-500 text-xs">
          <tr>
            <th className="text-left px-4 py-3 font-medium rounded-tl-xl">종목</th>
            <th className="text-center px-2 py-3 font-medium">
              Short-term
              <span className="block text-[10px] text-zinc-400 font-normal">단기 투자형</span>
            </th>
            <th className="text-center px-2 py-3 font-medium">
              Long-term
              <span className="block text-[10px] text-zinc-400 font-normal">장기 투자형</span>
            </th>
            <th className="text-left px-4 py-3 font-medium rounded-tr-xl">내러티브</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b, i) => {
            const isHoveredRow = hovered?.code === b.code
            const shortBadge   = gradeBadge(b.short_score)
            const longBadge    = gradeBadge(b.long_score)
            const isLast       = i === sorted.length - 1
            const hasBreakdown = isHoveredRow

            return (
              <>
                <tr
                  key={b.code}
                  onClick={() => window.open(stockUrl(b.code), '_blank')}
                  className={`border-t cursor-pointer transition-colors
                    ${i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}
                    ${isHoveredRow ? 'bg-blue-50' : ''}`}
                >
                  {/* 종목명 */}
                  <td className={`px-4 py-3 whitespace-nowrap ${isLast && !hasBreakdown ? 'rounded-bl-xl' : ''}`}>
                    <p className="font-semibold text-zinc-900">{b.name}</p>
                    <p className="text-xs text-zinc-400">{b.code}</p>
                  </td>

                  {/* Short-term 점수 */}
                  <td
                    className="px-2 py-3 text-center"
                    onMouseEnter={() => setHovered({ code: b.code, type: 'short' })}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-lg font-bold ${scoreColor(b.short_score)}`}>{b.short_score}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${shortBadge.cls}`}>
                        {shortBadge.label}
                      </span>
                      <div className="w-12 h-1.5 bg-zinc-100 rounded-full overflow-hidden mt-0.5">
                        <div className={`h-full rounded-full ${scoreBarColor(b.short_score)}`} style={{ width: `${b.short_score}%` }} />
                      </div>
                    </div>
                  </td>

                  {/* Long-term 점수 */}
                  <td
                    className="px-2 py-3 text-center"
                    onMouseEnter={() => setHovered({ code: b.code, type: 'long' })}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-lg font-bold ${scoreColor(b.long_score)}`}>{b.long_score}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${longBadge.cls}`}>
                        {longBadge.label}
                      </span>
                      <div className="w-12 h-1.5 bg-zinc-100 rounded-full overflow-hidden mt-0.5">
                        <div className={`h-full rounded-full ${scoreBarColor(b.long_score)}`} style={{ width: `${b.long_score}%` }} />
                      </div>
                    </div>
                  </td>

                  {/* 내러티브 */}
                  <td className={`px-4 py-4 ${isLast && !hasBreakdown ? 'rounded-br-xl' : ''}`}>
                    <NarrativeSteps text={b.narrative} />
                  </td>
                </tr>

                {/* 호버 시 breakdown 행 */}
                {isHoveredRow && (
                  <tr
                    key={`${b.code}-breakdown`}
                    className={`bg-blue-50/60 border-t border-blue-100 ${isLast ? 'rounded-b-xl' : ''}`}
                    onMouseEnter={() => setHovered(hovered)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <td colSpan={4} className="p-0">
                      <BreakdownContent b={b} type={hovered!.type} />
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
