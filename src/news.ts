interface RawArticle {
  title: string
  url: string
}

interface Source {
  name: string
  category: string
  fetch(): Promise<RawArticle[]>
}

/** Remove CDATA markers and trim */
function stripCDATA(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[(.*)\]\]>\s*$/s, '$1').trim()
}

/** Decode HTML entities in a string */
export function decodeHTMLEntities(s: string): string {
  const map: Record<string, string> = {
    '&quot;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&hellip;': '…',
    '&laquo;': '«',
    '&raquo;': '»',
    '&bull;': '•',
    '&middot;': '·',
  }
  return s.replace(/&[#\w]+;/g, (match) => {
    if (map[match]) return map[match]
    if (match.startsWith('&#x')) {
      return String.fromCharCode(parseInt(match.slice(3, -1), 16))
    }
    if (match.startsWith('&#')) {
      return String.fromCharCode(parseInt(match.slice(2, -1), 10))
    }
    return match
  })
}

function parseRSS(xml: string): RawArticle[] {
  const items: RawArticle[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1]
    let title =
      block.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1] ||
      block.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ||
      ''
    title = decodeHTMLEntities(stripCDATA(title))
    let link =
      block.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] ||
      ''
    link = stripCDATA(link)
    if (title && link) items.push({ title, url: link })
  }

  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi
    while ((m = entryRegex.exec(xml)) !== null) {
      const block = m[1]
      let title =
        block.match(/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i)?.[1] ||
        block.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ||
        ''
      title = decodeHTMLEntities(stripCDATA(title))
      let link =
        block.match(/<link[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1] ||
        block.match(/<link[^>]*>(.*?)<\/link>/i)?.[1] ||
        ''
      link = stripCDATA(link)
      if (title && link) items.push({ title, url: link })
    }
  }

  return items
}

const HN_TOP = 'https://hacker-news.firebaseio.com/v0/topstories.json'
const HN_ITEM = 'https://hacker-news.firebaseio.com/v0/item'

async function fetchHN(): Promise<RawArticle[]> {
  const ids: number[] = await (await fetch(HN_TOP)).json()
  const top20 = ids.slice(0, 10)
  const items = await Promise.all(
    top20.map(async (id) => {
      try {
        const data: { title?: string; url?: string } = await (
          await fetch(`${HN_ITEM}/${id}.json`)
        ).json()
        return data.title
          ? { title: data.title, url: data.url || `https://news.ycombinator.com/item?id=${id}` }
          : null
      } catch {
        return null
      }
    }),
  )
  return items.filter((i): i is RawArticle => i !== null)
}

async function fetchGHTrending(): Promise<RawArticle[]> {
  const res = await fetch(
    'https://ghapi.huchen.dev/repositories?since=daily',
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  )
  const data: { author: string; name: string; description: string; url: string }[] = await res.json()
  return data.slice(0, 10).map((r) => ({
    title: `${r.author}/${r.name}: ${r.description || ''}`,
    url: r.url,
  }))
}

async function fetchRSSSource(url: string): Promise<RawArticle[]> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const xml = await res.text()
    return parseRSS(xml).slice(0, 5)
  } catch {
    return []
  }
}

const SOURCES: Source[] = [
  {
    name: 'Hacker News',
    category: 'tech',
    fetch: fetchHN,
  },
  {
    name: 'GitHub Trending',
    category: 'tech',
    fetch: fetchGHTrending,
  },
  {
    name: 'BBC News',
    category: 'world',
    fetch: () => fetchRSSSource('https://feeds.bbci.co.uk/news/rss.xml'),
  },
  {
    name: 'NPR',
    category: 'world',
    fetch: () => fetchRSSSource('https://feeds.npr.org/1001/rss.xml'),
  },
  {
    name: 'TechCrunch',
    category: 'tech',
    fetch: () => fetchRSSSource('https://techcrunch.com/feed/'),
  },
  {
    name: 'The Verge',
    category: 'tech',
    fetch: () => fetchRSSSource('https://www.theverge.com/rss/index.xml'),
  },
  {
    name: 'Wired',
    category: 'tech',
    fetch: () => fetchRSSSource('https://www.wired.com/feed/rss'),
  },
  {
    name: '36氪',
    category: 'business',
    fetch: () => fetchRSSSource('https://36kr.com/feed'),
  },
  {
    name: '少数派',
    category: 'tech',
    fetch: () => fetchRSSSource('https://sspai.com/feed'),
  },
]

/** Filter out titles that are empty or only punctuation */
function isValidTitle(s: string): boolean {
  const cleaned = s.replace(/[，。、！？：；""''《》（）【】\[\]{}!?,.:;'"()\s\-—–·…]+/g, '').trim()
  return cleaned.length > 0
}

export async function crawlAll(): Promise<
  { source: string; category: string; title: string; url: string }[]
> {
  const results = await Promise.all(
    SOURCES.map(async (s) => {
      try {
        const articles = await s.fetch()
        // Decode HTML entities then filter out invalid titles
        return articles
          .map(a => ({ ...a, title: decodeHTMLEntities(a.title) }))
          .filter(a => isValidTitle(a.title))
          .map((a) => ({
            source: s.name,
            category: s.category,
            title: a.title,
            url: a.url,
          }))
      } catch {
        return []
      }
    }),
  )
  return results.flat()
}
