export interface NewsItem {
  id?: number
  crawled_at: string
  source: string
  title: string
  url: string
  summary: string
  category: string
}

export interface Env {
  D1_TOKEN: string
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  OPENAI_MODEL: string
  TRIGGER_TOKEN: string
}
