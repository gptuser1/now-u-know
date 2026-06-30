import type { Env, NewsItem } from './types'
import { sql } from './d1'
import { crawlAll } from './news'
import { summarizeArticles } from './llm'
import { renderPage } from './template'

const KEEP_BATCHES = 9

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleCron(env))
  },

  async fetch(_request: Request, env: Env): Promise<Response> {
    return handleGet(env)
  },
}

async function handleCron(env: Env) {
  await ensureTable(env)

  const now = new Date().toISOString()
  const articles = await crawlAll()

  const summaries = await summarizeArticles(
    env,
    articles.map((a) => ({ title: a.title, source: a.source })),
  )

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i]
    await sql(
      env.D1_TOKEN,
      `INSERT INTO items (crawled_at, source, title, url, summary, category) VALUES (?, ?, ?, ?, ?, ?)`,
      [now, a.source, a.title, a.url, summaries[i] || '', a.category],
    )
  }

  await cleanup(env)
}

async function ensureTable(env: Env) {
  await sql(env.D1_TOKEN, `
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawled_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general'
    )
  `)
}

async function cleanup(env: Env) {
  const keep = KEEP_BATCHES * 200
  await sql(
    env.D1_TOKEN,
    `DELETE FROM items WHERE id NOT IN (
      SELECT id FROM items ORDER BY id DESC LIMIT ?
    )`,
    [keep],
  )
}

async function handleGet(env: Env): Promise<Response> {
  await ensureTable(env)

  const r = await sql(
    env.D1_TOKEN,
    `SELECT * FROM items ORDER BY id DESC LIMIT 200`,
  )
  const items = (r.results as NewsItem[]) || []

  const html = renderPage(items)
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  })
}
