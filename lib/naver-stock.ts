import https from 'https'

interface NaverStockItem {
  name: string   // 종목명
  code: string   // 종목코드 (6자리)
  stockUrl: string // Naver Pay Securities 상세 URL (/domestic/stock/{code}/total)
}

// 네이버 Pay증권 자동완성 API — 브라우저 자동완성 엔드포인트 활용
function naverFinanceSearch(query: string): Promise<NaverStockItem[]> {
  return new Promise((resolve) => {
    const encoded = encodeURIComponent(query)
    const options = {
      hostname: 'ac.stock.naver.com',
      path: `/ac?q=${encoded}&target=stock`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, */*',
        'Referer': 'https://finance.naver.com/',
      },
    }

    const req = https.get(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8')
          // 응답 형식: { items: [{ code, name, url, ... }, ...] }
          const json = JSON.parse(text)
          const items: NaverStockItem[] = (json?.items ?? []).map((item: { code: string; name: string; url: string }) => ({
            code: item.code ?? '',
            name: item.name ?? '',
            stockUrl: item.url ?? '',
          }))
          resolve(items)
        } catch {
          resolve([])
        }
      })
      res.on('error', () => resolve([]))
    })

    req.on('error', () => resolve([]))
    req.setTimeout(3000, () => {
      req.destroy()
      resolve([])
    })
  })
}

export interface ValidatedStock {
  name: string
  code: string
  verified: boolean   // 네이버에서 확인된 종목인지
  corrected: boolean  // AI가 준 코드를 수정했는지
}

/**
 * Gemini가 반환한 종목명과 코드를 네이버 Pay증권에서 검증합니다.
 * - 종목명으로 검색 후 완전 일치하는 코드가 있으면 그 코드를 사용
 * - AI 코드가 정확한 경우 그대로 유지
 * - 검색 결과가 없거나 API 오류 시 AI 결과를 그대로 유지 (verified=false)
 */
export async function verifyStockCode(
  aiName: string,
  aiCode: string
): Promise<ValidatedStock> {
  try {
    const items = await naverFinanceSearch(aiName)

    // 1순위: 종목명 완전 일치
    const exact = items.find(
      (item) => item.name.replace(/\s/g, '') === aiName.replace(/\s/g, '')
    )
    if (exact) {
      return {
        name: exact.name,
        code: exact.code,
        verified: true,
        corrected: exact.code !== aiCode,
      }
    }

    // 2순위: AI 코드가 검색 결과에 존재 (코드 정확)
    const byCode = items.find((item) => item.code === aiCode)
    if (byCode) {
      return {
        name: byCode.name,
        code: byCode.code,
        verified: true,
        corrected: false,
      }
    }

    // 검색 결과 없거나 일치 없음 — AI 결과 유지, verified=false
    // (부분 일치는 오히려 틀릴 위험이 있으므로 사용 안 함)
    return { name: aiName, code: aiCode, verified: false, corrected: false }
  } catch {
    return { name: aiName, code: aiCode, verified: false, corrected: false }
  }
}
