// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse') as { PDFParse: new (options: { data: Uint8Array; verbosity?: number }) => { load: () => Promise<void>; getText: () => Promise<{ text: string; numpages: number }> } }

import { extractPdfTitle } from './gemini'

export interface PdfResult {
  title: string
  content: string
  pageCount: number
}

export async function parsePdf(buffer: Buffer, filename?: string): Promise<PdfResult> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  await parser.load()
  const data = await parser.getText()

  const lines = data.text.split('\n').map((l: string) => l.trim()).filter(Boolean)

  // ── STEP 1: AI로 원문 텍스트에서 제목 탐색 (첫 1,500자 기준) ──
  const firstPageText = data.text.slice(0, 1500)
  let title = await extractPdfTitle(firstPageText)

  // ── STEP 2: 파일명 fallback ──
  if (!title && filename) {
    const base = filename
      .replace(/\.[^.]+$/, '')       // 확장자 제거
      .replace(/[_\-]+/g, ' ')       // _나 -를 공백으로
      .replace(/^\d+\s*/, '')        // 앞에 붙은 타임스탬프 숫자 제거
      .trim()
    if (base.length >= 2) title = base.slice(0, 200)
  }

  // ── STEP 3: 기존 휴리스틱 fallback ──
  if (!title) {
    const isNoiseLine = (s: string) =>
      s.length < 5 ||
      /https?:\/\//i.test(s) ||
      /^www\./i.test(s) ||
      /\.com|\.co\.kr|\.kr$/i.test(s) ||
      /@/.test(s) ||
      /^\d+$/.test(s) ||
      /^\d{2,4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}$/.test(s) ||
      /\d{1,3}(,\d{3})*원/.test(s) ||
      /^\d+\.?\d*%$/.test(s) ||
      /^\[.+\]$/.test(s) ||
      /\(\d{6}\)/.test(s) ||
      /^(매수|매도|보유|BUY|SELL|HOLD|유지|상향|하향)$/i.test(s) ||
      /[|ㅣ]/.test(s) ||
      /^Fig\./.test(s) ||
      /^[A-Za-z\s]+$/.test(s)

    const isTitleLike = (s: string) =>
      !isNoiseLine(s) &&
      /[가-힣]/.test(s) &&
      /\s/.test(s) &&
      s.length >= 6 && s.length <= 60

    const titleLine =
      lines.find(isTitleLike) ??
      lines.find((l) => !isNoiseLine(l))

    title = (titleLine ?? lines[0] ?? '제목 없음').slice(0, 200)
  }

  const content = data.text.replace(/\s+/g, ' ').trim()

  return {
    title,
    content,
    pageCount: data.numpages,
  }
}
