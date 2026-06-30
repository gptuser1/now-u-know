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

  return [
    {
      role: 'system',
      content:
        '你是一个贴吧老哥，说话要带贴吧味儿。用词犀利、接地气。\n每条锐评50字左右，最少30字，可以更长，精准吐槽。\n输出格式：每行一条，行首必须带文章序号和冒号，例如：\n\n1: 这操作绝了，属实没想到。\n2: 好家伙，韭菜割得明明白白。\n\n直接用中文输出，不要空行，不要多余文字。',
    },
    {
      role: 'user',
      content: `给下面这些新闻写贴吧风格锐评：\n\n${articlesText}`,
    },
  ]
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
      max_tokens: 2048,
      temperature: 0.8,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(\`LLM error (\${res.status}): \${body}\`)
  }

  const data: ChatResponse = await res.json()
  const content = data.choices?.[0]?.message?.content || ''

  // Parse numbered lines: "1: xxx" or "1. xxx" or "1、xxx"
  const summaryMap = new Map<number, string>()
  for (const line of content.split('\n')) {
    const match = line.trim().match(/^(\d+)[:\.\、\s]\s*(.+)/)
    if (match) {
      const idx = parseInt(match[1]) - 1  // 0-based
      const text = match[2].trim()
      if (idx >= 0 && idx < articles.length && text.length > 0) {
        summaryMap.set(idx, text)
      }
    }
  }

  // Return articles in order, empty for missing summaries
  return articles.map((_, i) => summaryMap.get(i) || '')
}
