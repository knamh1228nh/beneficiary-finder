import * as cheerio from 'cheerio'
import https from 'https'
import http from 'http'

export interface CrawlResult {
  title: string
  content: string
}

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://www.google.com/',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
}

// Node.js 내장 http/https 모듈 사용 — undici ByteString 제한 우회
function httpGet(url: string, maxRedirects = 5): Promise<{ status: number; html: string }> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return reject(new Error(`잘못된 URL: ${url}`))
    }

    const client = parsedUrl.protocol === 'https:' ? https : http
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || undefined,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: FETCH_HEADERS,
    }

    const req = client.get(options, (res) => {
      const status = res.statusCode ?? 0

      if (status >= 300 && status < 400) {
        const location = res.headers['location']
        res.resume()
        if (!location || maxRedirects <= 0) {
          return reject(new Error('리다이렉트 한도 초과'))
        }
        let nextUrl: string
        try {
          nextUrl = new URL(location, url).href
        } catch {
          nextUrl = location
        }
        return httpGet(nextUrl, maxRedirects - 1).then(resolve).catch(reject)
      }

      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({ status, html: Buffer.concat(chunks).toString('utf-8') }))
      res.on('error', reject)
    })

    req.on('error', reject)
  })
}

export async function crawlUrl(url: string): Promise<CrawlResult> {
  const { status, html } = await httpGet(url)

  if (status >= 400) {
    if (status === 403) {
      throw new Error(
        `URL 요청 실패: 403 (접근 차단)\n이 사이트는 봇 차단 정책(Cloudflare 등)을 사용합니다. investing.com 등 일부 사이트는 URL 크롤링이 불가합니다. 해당 기사를 PDF로 저장 후 업로드해 주세요.`
      )
    }
    throw new Error(`URL 요청 실패: ${status}`)
  }

  // JSON-LD에서 제목/본문 추출 (조선일보 등 CSR 사이트 대응)
  let ldTitle = ''
  let ldContent = ''
  const ldJsonBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const block of ldJsonBlocks) {
    try {
      const json = JSON.parse(block[1])
      if (json['@type'] === 'NewsArticle') {
        ldTitle = json.headline || ''
        ldContent = json.articleBody || json.description || ''
        break
      }
    } catch { /* ignore */ }
  }

  const $ = cheerio.load(html)

  $('script, style, nav, footer, header, aside, iframe').remove()

  const title =
    ldTitle ||
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="og:title"]').attr('content') ||
    $('h1').first().text() ||
    $('title').text()

  const contentSelectors = [
    '#articleBodyContents', // 네이버 뉴스
    '#articeBody',          // 다음 뉴스
    '.article-body',
    '.article_body',
    '.news_body',
    'article',
    'main',
  ]

  let content = ''
  for (const selector of contentSelectors) {
    const text = $(selector).text().trim()
    if (text.length > 200) {
      content = text
      break
    }
  }

  // cheerio로 본문 추출 실패 시 JSON-LD fallback → body 순으로 사용
  if (!content) {
    content = ldContent || $('body').text().trim()
  }

  const finalContent = content.replace(/\s+/g, ' ').trim()

  if (finalContent.length < 200) {
    throw new Error(
      `본문 추출 실패: 이 사이트는 JavaScript 렌더링 후 본문이 로드됩니다(조선일보 등).\n해당 기사를 PDF로 저장 후 업로드해 주세요.`
    )
  }

  return {
    title: title.trim().slice(0, 500),
    content: finalContent,
  }
}
