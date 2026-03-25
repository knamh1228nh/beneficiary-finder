'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function Header() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header className="border-b bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-8 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="text-lg font-bold hover:opacity-70 transition"
        >
          수혜주 찾기
        </button>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm text-zinc-400 hidden sm:block">{user.email}</span>
              <button
                onClick={() => router.push('/history')}
                className="text-sm text-zinc-600 hover:text-black transition px-2 py-1"
              >
                히스토리
              </button>
              <button
                onClick={handleLogout}
                className="text-sm px-3 py-1.5 border rounded-lg hover:bg-zinc-50 transition"
              >
                로그아웃
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => router.push('/login')}
                className="text-sm px-3 py-1.5 border rounded-lg hover:bg-zinc-50 transition"
              >
                로그인
              </button>
              <button
                onClick={() => router.push('/signup')}
                className="text-sm px-3 py-1.5 bg-black text-white rounded-lg hover:bg-zinc-800 transition"
              >
                회원가입
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
