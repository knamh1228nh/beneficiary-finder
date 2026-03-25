'use client'

import { useState } from 'react'
import { SHORT_WEIGHTS, LONG_WEIGHTS, SCORE_LABELS } from '@/lib/gemini'

export interface BeneficiaryCardData {
  name:  string
  code:  string
  short_score: number
  long_score:  number
  score_breakdown: {
    directness:          number
    profit_contribution: number
    penetration_speed:   number
    sustainability:      number
    psychology_scarcity: number
    financial_readiness: number
  }
  narrative:  string
  verified?:  boolean
  corrected?: boolean
  stockUrl?:  string
}

function gradeInfo(score: number) {
  if (score >= 85) return { label: '매우 강함', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' }
  if (score >= 70) return { label: '강함',    color: 'text-amber-400  bg-amber-400/10  border-amber-400/30'  }
  if (score >= 55) return { label: '보통',    color: 'text-blue-400   bg-blue-400/10   border-blue-400/30'   }
  return               { label: '약함',    color: 'text-zinc-400   bg-zinc-400/10   border-zinc-400/30'   }
}

function WeightBreakdown({
  breakdown,
  type,
}: {
  breakdown: BeneficiaryCardData['score_breakdown']
  type: 'short' | 'long'
}) {
  const weights = type === 'short' ? SHORT_WEIGHTS : LONG_WEIGHTS
  const raw = breakdown as Record<string, number>

  return (
    <div className="space-y-1.5 pt-2 border-t border-zinc-700/50">
      <p className="text-[10px] text-zinc-500 mb-1">
        {type === 'short' ? '단기 투자형' : '장기 투자형'} 가중치 적용 로직
      </p>
      {Object.keys(weights).map((key) => {
        const score      = raw[key] ?? 0
        const wPct       = Math.round(weights[key] * 100)
        const contribution = Math.round(score * weights[key])
        return (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400 w-24 shrink-0">
              {SCORE_LABELS[key]}
              <span className="text-amber-400/80 ml-1">({wPct}%)</span>
            </span>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-300 w-14 text-right shrink-0">
              {score} → <span className="text-amber-400">{contribution}pt</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function BeneficiaryCard({ b }: { b: BeneficiaryCardData }) {
  const [hoveredScore, setHoveredScore] = useState<'short' | 'long' | null>(null)
  const shortGrade = gradeInfo(b.short_score)
  const longGrade  = gradeInfo(b.long_score)

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 p-4 hover:border-amber-500/50 transition-colors">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={b.stockUrl ?? `https://www.ant.wiki/wiki/${b.code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white hover:text-amber-400 transition-colors"
            >
              {b.name}
            </a>
            {b.verified && (
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 rounded-full">
                검증됨
              </span>
            )}
            {b.corrected && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-400/10 text-blue-400 border border-blue-400/30 rounded-full">
                코드 수정
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500">{b.code}</span>
        </div>

        {/* 두 점수 영역 */}
        <div className="flex gap-2 shrink-0">
          {/* Short-term */}
          <div
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border transition-colors cursor-default
              ${hoveredScore === 'short'
                ? 'border-orange-400/60 bg-orange-400/10'
                : 'border-zinc-700/60 bg-zinc-800/60'}`}
            onMouseEnter={() => setHoveredScore('short')}
            onMouseLeave={() => setHoveredScore(null)}
          >
            <span className="text-[9px] text-zinc-500 mb-0.5">Short</span>
            <span className="text-xl font-bold text-white">{b.short_score}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border mt-0.5 ${shortGrade.color}`}>
              {shortGrade.label}
            </span>
          </div>

          {/* Long-term */}
          <div
            className={`flex flex-col items-center px-2.5 py-1.5 rounded-lg border transition-colors cursor-default
              ${hoveredScore === 'long'
                ? 'border-blue-400/60 bg-blue-400/10'
                : 'border-zinc-700/60 bg-zinc-800/60'}`}
            onMouseEnter={() => setHoveredScore('long')}
            onMouseLeave={() => setHoveredScore(null)}
          >
            <span className="text-[9px] text-zinc-500 mb-0.5">Long</span>
            <span className="text-xl font-bold text-white">{b.long_score}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border mt-0.5 ${longGrade.color}`}>
              {longGrade.label}
            </span>
          </div>
        </div>
      </div>

      {/* breakdown (hover 시 가중치 표시, 아닐 때 raw 지표 표시) */}
      {hoveredScore ? (
        <WeightBreakdown breakdown={b.score_breakdown} type={hoveredScore} />
      ) : (
        <div className="space-y-1.5 mb-3">
          {(Object.keys(b.score_breakdown) as (keyof typeof b.score_breakdown)[]).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 w-20 shrink-0">{SCORE_LABELS[key]}</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-700"
                  style={{ width: `${b.score_breakdown[key]}%` }}
                />
              </div>
              <span className="text-xs text-zinc-300 w-6 text-right">{b.score_breakdown[key]}</span>
            </div>
          ))}
        </div>
      )}

      {/* 내러티브 */}
      <div className="border-t border-zinc-700/50 pt-3 mt-3 flex flex-col gap-1">
        {b.narrative.split(/\s*→\s*/).filter(Boolean).map((step, i, arr) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-full border border-zinc-700/50 rounded-lg bg-zinc-800/60 px-3 py-1.5">
              <span className="text-xs text-zinc-400 leading-snug">{step}</span>
            </div>
            {i < arr.length - 1 && (
              <span className="text-base font-bold text-zinc-400 leading-none">↓</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
