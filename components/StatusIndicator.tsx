'use client'

import { useEffect, useState } from 'react'

// 단계별 상태 메시지
const STAGES = [
  { label: '요청을 분석 중...', icon: '🔍' },
  { label: '뉴스를 크롤링 중...', icon: '📰' },
  { label: 'AI가 수혜주를 식별 중...', icon: '🤖' },
  { label: 'AntWiki DB 조회 중...', icon: '🗄️' },
  { label: '종목 코드를 검증 중...', icon: '✅' },
  { label: '최종 답변을 생성 중...', icon: '✍️' },
]

// 도구 이름 → 표시 메시지 매핑
const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  find_beneficiaries: { label: '뉴스를 분석 중...', icon: '📰' },
  get_antwiki_data:   { label: 'AntWiki DB 조회 중...', icon: '🗄️' },
}

interface StatusIndicatorProps {
  isLoading: boolean
  activeTool?: string | null // 현재 실행 중인 도구 이름 (선택)
}

export function StatusIndicator({ isLoading, activeTool }: StatusIndicatorProps) {
  const [stageIdx, setStageIdx] = useState(0)

  // activeTool이 없으면 시간 기반으로 단계 순환
  useEffect(() => {
    if (!isLoading) {
      setStageIdx(0)
      return
    }
    if (activeTool) return // 도구 기반 표시 중에는 타이머 불필요

    const intervals = [1500, 3000, 2500, 2000, 2000]
    let i = 0

    function advance() {
      i++
      setStageIdx(Math.min(i, STAGES.length - 1))
      if (i < intervals.length) {
        timer = setTimeout(advance, intervals[i])
      }
    }

    let timer = setTimeout(advance, intervals[0])
    return () => clearTimeout(timer)
  }, [isLoading, activeTool])

  if (!isLoading) return null

  const current = activeTool
    ? TOOL_LABELS[activeTool] ?? { label: `${activeTool} 실행 중...`, icon: '⚙️' }
    : STAGES[stageIdx]

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-zinc-800/60 border border-zinc-700/50 w-fit">
      {/* 펄스 점 */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
      </span>

      <span className="text-lg leading-none">{current.icon}</span>
      <span className="text-sm text-zinc-300">{current.label}</span>
    </div>
  )
}
