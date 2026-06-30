import type { Env, NewsItem } from './types'
import { sql } from './d1'
import { crawlAll } from './news'
import { summarizeArticles } from './llm'
import { renderPage } from './template'

const KEEP_BATCHES = 9

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const result = await handleCron(env)
    if (!result.success) {
      console.error('Scheduled cron failed:', result.error)
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/trigger') {
      return handleTrigger(request, env)
    }

    return handleGet(env)
  },
}

interface CronResult {
  success: boolean
  articles_count: number
  error?: string
}

async function handleCron(env: Env): Promise<CronResult> {
  try {
    await ensureTable(env)

    const now = new Date().toISOString()
    const articles = await crawlAll()

    if (articles.length === 0) {
      return { success: true, articles_count: 0, error: 'No articles crawled' }
    }

    const summaries = await summarizeArticles(
      env,
      articles.map((a) => ({ title: a.title, source: a.source })),
    )

    const placeholders = articles.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
    const values: string[] = []
    for (let i = 0; i < articles.length; i++) {
      const a = articles[i]
      values.push(now, a.source, a.title, a.url, summaries[i] || '', a.category)
    }
    await sql(
      env.D1_TOKEN,
      `INSERT INTO newsfeed (crawled_at, source, title, url, summary, category) VALUES ${placeholders}`,
      values,
    )

    await cleanup(env)
    return { success: true, articles_count: articles.length }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('handleCron failed:', msg)
    return { success: false, articles_count: 0, error: msg }
  }
}

async function ensureTable(env: Env) {
  await sql(env.D1_TOKEN, `
    CREATE TABLE IF NOT EXISTS newsfeed (
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
    `DELETE FROM newsfeed WHERE id NOT IN (
      SELECT id FROM newsfeed ORDER BY id DESC LIMIT ?
    )`,
    [keep],
  )
}

async function handleGet(env: Env): Promise<Response> {
  await ensureTable(env)

  const r = await sql(
    env.D1_TOKEN,
    `SELECT * FROM newsfeed ORDER BY id DESC LIMIT 30`,
  )
  const items = (r.results as NewsItem[]) || []

  const html = renderPage(items)
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  })
}

function extractToken(request: Request): string | null {
  const auth = request.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)

  const url = new URL(request.url)
  return url.searchParams.get('token')
}

async function handleTrigger(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const token = extractToken(request)
  if (!token || token !== env.TRIGGER_TOKEN) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await handleCron(env)

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
}
