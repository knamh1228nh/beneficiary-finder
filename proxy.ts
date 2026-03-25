import { NextRequest, NextResponse } from 'next/server'

// 인증 게이트 비활성화 (로그인 없이 접근 허용)
// 추후 로그인 기능 재활성화 시 아래 주석 해제
//
// import { createClient } from '@supabase/supabase-js'
// export async function proxy(request: NextRequest) {
//   const supabase = createClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
//   )
//   const token = request.cookies.get('sb-access-token')?.value
//   if (!token) {
//     const { pathname } = request.nextUrl
//     if (pathname !== '/login') {
//       return NextResponse.redirect(new URL('/login', request.url))
//     }
//   }
//   return NextResponse.next()
// }

export async function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
