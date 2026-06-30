const D1_BASE = 'https://data.klinux.dpdns.org'

interface QueryResult {
  success: boolean
  results?: Record<string, unknown>[]
  error?: string
}

export async function sql(
  token: string,
  query: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  const res = await fetch(`${D1_BASE}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, params }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`D1 query error (${res.status}): ${body}`)
  }
  return res.json()
}
