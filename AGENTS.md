# now-u-know

Cloudflare Worker — 每日 4 次定时抓取全球资讯，AI 贴吧风锐评，页面展示最近 30 条。

## 架构

- 单 Worker，`fetch` 返回页面，`scheduled` 做抓取（cron: 08/12/18/22 UTC）
- 数据存 D1，通过 REST API (`https://data.klinux.dpdns.org/query`) 操作
- LLM 摘要走 OpenAI 兼容 API，风格为贴吧老哥

## 环境变量（secrets）

- `D1_TOKEN` — D1 REST API Bearer Token
- `OPENAI_API_KEY` — API Key
- `OPENAI_BASE_URL` — API 地址
- `OPENAI_MODEL` — 模型名（默认 `deepseek-v4-flash-free`，在 `wrangler.toml` 中）

## 关键命令

- 建表：`curl -X POST https://data.klinux.dpdns.org/query -H "Authorization: Bearer \$D1_TOKEN" -H "Content-Type: application/json" -d '{"query":"CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, crawled_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT '\'''\''', title TEXT NOT NULL DEFAULT '\'''\''', url TEXT NOT NULL DEFAULT '\'''\''', summary TEXT NOT NULL DEFAULT '\'''\''', category TEXT NOT NULL DEFAULT '\''general'\'')"}'`
- 部署：`npx wrangler deploy`
- 设 secret：`npx wrangler secret put <NAME>`

## 新闻源（src/news.ts）

Hacker News、GitHub Trending、BBC、Reuters、TechCrunch、36氪、虎嗅

## 数据保留

最多保留 1800 条（9 批次 × 200），每次 cron 后自动清理最旧的。
页面只展示最近 30 条。

## 部署注意

- `OPENAI_MODEL` 在 `wrangler.toml` `[vars]` 中设为默认值，无需设 secret
- 首次部署前需先建表（curl 命令如上），但 Worker 每次启动也会自动 `CREATE TABLE IF NOT EXISTS`
- GitHub Trending 使用第三方 API `api.gitterapp.com`，如失效需替换
- 无本地测试环境，直接 `wrangler deploy` 部署到生产验证
