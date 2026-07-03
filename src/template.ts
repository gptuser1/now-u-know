import type { NewsItem } from './types'
import { decodeHTMLEntities } from './news'

export function renderPage(items: NewsItem[]): string {
  const cards = items
    .map(
      (item) => `
    <div class="card">
      <div class="meta">
        <span class="source">${esc(item.source)}</span>
        <span class="cat">${esc(item.category)}</span>
        <span class="time">${formatTime(item.crawled_at)}</span>
      </div>
      <a href="${esc(item.url)}" target="_blank" rel="noopener" class="title">${esc(decodeHTMLEntities(item.title))}</a>
      ${item.summary ? `<p class="summary">${esc(item.summary)}</p>` : ''}
    </div>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Now U Know - 信息流</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:20px;max-width:800px;margin:0 auto}
h1{font-size:1.5rem;margin-bottom:4px;display:flex;align-items:center;gap:8px}
h1 small{font-size:0.8rem;color:#8b949e;font-weight:400}
.sub{color:#8b949e;font-size:0.85rem;margin-bottom:24px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:12px;transition:border-color .15s}
.card:hover{border-color:#58a6ff}
.meta{display:flex;gap:8px;font-size:0.75rem;margin-bottom:6px;flex-wrap:wrap}
.source{color:#58a6ff;font-weight:600}
.cat{color:#8b949e;background:#21262d;padding:0 6px;border-radius:4px}
.time{color:#8b949e;margin-left:auto}
.title{display:block;color:#e6edf3;font-size:0.95rem;font-weight:500;text-decoration:none;line-height:1.4;margin-bottom:4px}
.title:hover{color:#58a6ff}
.summary{color:#8b949e;font-size:0.82rem;line-height:1.5;margin-top:4px}
.empty{text-align:center;padding:60px 0;color:#8b949e}
.footer{text-align:center;padding:20px 0;color:#484f58;font-size:0.75rem}
</style>
</head>
<body>
<h1>Now U Know <small>信息流</small></h1>
<p class="sub">最近更新 · 每次抓取 AI 锐评</p>
${items.length > 0 ? cards : '<div class="empty">暂无内容，等待下次抓取...</div>'}
<div class="footer">Powered by Cloudflare</div>
</body>
</html>`
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    // Convert UTC to CST (UTC+8)
    const cst = new Date(d.getTime() + 8 * 60 * 60 * 1000)
    return `${cst.getUTCMonth() + 1}/${pad(cst.getUTCDate())} ${pad(cst.getUTCHours())}:${pad(cst.getUTCMinutes())}`
  } catch {
    return iso
  }
}
