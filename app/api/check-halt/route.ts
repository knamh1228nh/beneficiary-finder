import { NextRequest, NextResponse } from 'next/server'

/**
 * KRX 데이터포털에서 현재 거래정지 종목 목록을 가져옵니다.
 * 실패 시 빈 Set 반환 (거래정지 없음으로 처리)
 */
async function fetchKrxHaltedCodes(): Promise<Set<string>> {
  try {
    const body = new URLSearchParams({
      bld:           'dbms/MDC/STAT/standard/MDCSTAT15001',
      locale:        'ko_KR',
      mktId:         'ALL',
      trdSuspTpCd:   '1',
      share:         '1',
      money:         '1',
      csvxls_isNo:   'false',
    })

    const res = await fetch('https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer':       'https://data.krx.co.kr/',
        'Origin':        'https://data.krx.co.kr',
        'Accept':        'application/json, text/javascript, */*',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) return new Set()

    const json = await res.json()
    const items: Array<{ ISU_SRT_CD?: string }> = json?.OutBlock_1 ?? []
    return new Set(items.map((item) => item.ISU_SRT_CD ?? '').filter(Boolean))
  } catch {
    return new Set()
  }
}

/** GET /api/check-halt?codes=000660,005930,... */
export async function GET(req: NextRequest) {
  const codesParam = req.nextUrl.searchParams.get('codes') ?? ''
  const codes = codesParam.split(',').map((c) => c.trim()).filter(Boolean)

  if (codes.length === 0) {
    return NextResponse.json({})
  }

  const haltedCodes = await fetchKrxHaltedCodes()

  const result: Record<string, boolean> = {}
  for (const code of codes) {
    result[code] = haltedCodes.has(code)
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
  })
}
