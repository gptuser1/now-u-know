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
        '你是一个贴吧老哥，说话要带贴吧味儿。用词犀利、接地气，适当使用"卧槽""绝了""老铁""属实""整不会了""什么鬼""好家伙"等贴吧常见用语。每条摘要控制在30字以内，精准吐槽或锐评。不用客气，不用正式。直接用中文输出，每条一行，不要序号。',
    },
    {
      role: 'user',
      content: `给下面这些新闻写个贴吧风格一句话锐评：\n\n${articlesText}`,
    },
  ]
}

export async function summarizeArticles(
  env: Env,
  articles: { title: string; source: string }[],
): Promise<string[]> {
  if (articles.length === 0) return []

  const messages = buildPrompt(articles)

  const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      messages,
      max_tokens: 1024,
      temperature: 0.8,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LLM error (${res.status}): ${body}`)
  }

  const data: ChatResponse = await res.json()
  const content = data.choices?.[0]?.message?.content || ''
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\d+[\.\、\:]/.test(l))

  return lines
}
