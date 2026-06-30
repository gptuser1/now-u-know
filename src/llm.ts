import type { Env } from './types'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatResponse {
  choices: { message: { content: string } }[]
}

function buildPrompt(articles: { title: string; source: string }[]): ChatMessage[] {
  const articlesText = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}`)
    .join('\n')

  const articleCount = articles.length

  return [
    {
      role: 'system',
      content:
        '你是一个贴吧老哥，说话要带贴吧味儿。用词犀利、接地气。\n'
        + `每条锐评50字左右，最少30字，可以更长，精准吐槽。\n`
        + '严格按以下JSON格式输出，不要输出任何其他内容：\n'
        + '{\n'
        + '  "summaries": [\n'
        + `    {"index": 1, "summary": "锐评内容1"},\n`
        + `    {"index": 2, "summary": "锐评内容2"}\n`
        + '  ]\n'
        + `}\n\n一共${articleCount}条，index从1到${articleCount}，必须全部覆盖，不能少。`,
    },
    {
      role: 'user',
      content: `给下面这些新闻写贴吧风格锐评：\n\n${articlesText}`,
    },
  ]
}

/** Try JSON parse first, fall back to numbered line parsing */
function parseSummaries(raw: string, articleCount: number): Map<number, string> {
  const map = new Map<number, string>()

  // Attempt 1: JSON parse
  try {
    // Try to extract JSON object from the response (handles markdown code fences too)
    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/\`\`\`(?:json)?\n?([\s\S]*?)\`\`\`/)
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
    const match = line.trim().match(/^(\d+)[:\.\、\s]\s*(.+)/)
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

export async function summarizeArticles(
  env: Env,
  articles: { title: string; source: string }[],
): Promise<string[]> {
  if (articles.length === 0) return []

  const messages = buildPrompt(articles)

  const res = await fetch(\`\${env.OPENAI_BASE_URL}/chat/completions\`, {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${env.OPENAI_API_KEY}\`,
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
    throw new Error(\`LLM error (\${res.status}): \${body}\`)
  }

  const data: ChatResponse = await res.json()
  const content = data.choices?.[0]?.message?.content || ''

  const summaryMap = parseSummaries(content, articles.length)
  return articles.map((_, i) => summaryMap.get(i) || '')
}