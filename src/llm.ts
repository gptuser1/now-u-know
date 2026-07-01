import type { Env } from './types'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  choices: { message: { content: string } }[]
}

function buildPrompt(articles: { title: string; source: string }[], attempt: number): ChatMessage[] {
  const articlesText = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}`)
    .join('\n')

  const articleCount = articles.length

  let systemContent =
    '你是一个贴吧老哥，说话要带贴吧味儿。用词犀利、接地气。\n'
    + '全程用中文写锐评，禁止混合英文或中英夹杂。\n'
    + `每条锐评50字左右，最少30字，可以更长，精准吐槽。\n`
    + '严格按以下JSON格式输出，不要输出任何其他内容：\n'
    + '{\n'
    + '  "summaries": [\n'
    + `    {"index": 1, "summary": "锐评内容1"},\n`
    + `    {"index": 2, "summary": "锐评内容2"}\n`
    + '  ]\n'
    + `}\n\n一共${articleCount}条，index从1到${articleCount}，必须全部覆盖，不能少。`

  if (attempt > 0) {
    systemContent += `\n\n注意：这是第${attempt + 1}次尝试。之前返回的内容无效或为空，请务必输出有效的JSON格式锐评，每条至少30字。`
  }

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: `给下面这些新闻写贴吧风格锐评：\n\n${articlesText}` },
  ]
}

/** Try JSON parse first, fall back to numbered line parsing */
function parseSummaries(raw: string, articleCount: number): Map<number, string> {
  const map = new Map<number, string>()

  // Attempt 1: JSON parse
  try {
    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\n?([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()

    const parsed = JSON.parse(jsonStr)
    if (parsed && Array.isArray(parsed.summaries)) {
      for (const item of parsed.summaries) {
        if (item && typeof item.index === 'number' && typeof item.summary === 'string') {
          const idx = item.index - 1
          if (idx >= 0 && idx < articleCount && item.summary.trim().length > 0) {
            map.set(idx, item.summary.trim())
          }
        }
      }
      return map
    }
  } catch {
    // JSON failed, try fallback parsing
  }

  // Attempt 2: numbered line parsing "1: xxx" or "1. xxx"
  for (const line of raw.split('\n')) {
    const match = line.trim().match(/^(\d+)[:.\、\s]\s*(.+)/)
    if (match) {
      const idx = parseInt(match[1]) - 1
      const text = match[2].trim()
      if (idx >= 0 && idx < articleCount && text.length > 0) {
        map.set(idx, text)
      }
    }
  }

  return map
}

/** Check if the summaries are valid (at least some coverage and reasonable length) */
function isValidSummaries(summaries: string[], articleCount: number): boolean {
  const validOnes = summaries.filter(s => s.trim().length >= 10)
  return validOnes.length >= Math.min(articleCount, 5)
}

export async function summarizeArticles(
  env: Env,
  articles: { title: string; source: string }[],
): Promise<string[]> {
  if (articles.length === 0) return []

  const MAX_RETRIES = 3
  let lastError: string | null = null
  let lastSummaries: string[] | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const messages = buildPrompt(articles, attempt)

      const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          messages,
          max_tokens: 4096,
          temperature: 0.8,
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        lastError = `LLM error (${res.status}): ${body}`
        console.error(`Attempt ${attempt + 1}/${MAX_RETRIES} failed: ${lastError}`)
        continue
      }

      const data: ChatResponse = await res.json()
      const content = data.choices?.[0]?.message?.content || ''

      if (!content.trim()) {
        lastError = 'Empty response from LLM'
        console.error(`Attempt ${attempt + 1}/${MAX_RETRIES}: ${lastError}`)
        continue
      }

      const summaryMap = parseSummaries(content, articles.length)
      const summaries = articles.map((_, i) => summaryMap.get(i) || '')

      if (isValidSummaries(summaries, articles.length)) {
        return summaries
      }

      lastError = 'Summaries too sparse or empty after parsing'
      lastSummaries = summaries
      console.error(`Attempt ${attempt + 1}/${MAX_RETRIES}: ${lastError}`)

    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      console.error(`Attempt ${attempt + 1}/${MAX_RETRIES} threw: ${lastError}`)
    }
  }

  // All retries exhausted — return last partial result if any, else empty
  console.error(`All ${MAX_RETRIES} attempts failed. Last error: ${lastError}`)
  return lastSummaries || articles.map(() => '')
}
