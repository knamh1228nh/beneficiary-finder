'use client'

import { useRouter } from 'next/navigation'

interface LoginModalProps {
  onClose: () => void
}

export default function LoginModal({ onClose }: LoginModalProps) {
  const router = useRouter()

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="text-xl font-bold mb-2">로그인이 필요합니다</h2>
          <p className="text-zinc-500 text-sm leading-relaxed">
            분석 기능을 사용하려면 로그인이 필요합니다.<br />
            아직 계정이 없으신가요? 무료로 가입하세요.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => router.push('/login')}
            className="w-full py-2.5 bg-black text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition"
          >
            로그인
          </button>
          <button
            onClick={() => router.push('/signup')}
            className="w-full py-2.5 border rounded-lg text-sm font-medium hover:bg-zinc-50 transition"
          >
            회원가입
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full text-center text-xs text-zinc-400 hover:text-zinc-600 transition"
        >
          닫기
        </button>
      </div>
    </div>
  )
}
