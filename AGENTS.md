# now-u-know

Cloudflare Worker — 每日 4 次定时抓取全球资讯，AI 贴吧风锐评，页面展示最近 30 条。

## 架构

- 单 Worker，`fetch` 返回页面，`scheduled` 做抓取（cron: 08/12/18/22 UTC）
- 数据存 D1，通过 REST API (`https://data.klinux.dpdns.org/query`) 操作
- LLM 摘要走 OpenAI 兼容 API，风格为贴吧老哥

## 环境变量

在 GitHub repo Settings > Secrets and variables > Actions 中配置：

**Secrets（加密）：**
- `OPENAI_API_KEY` — LLM API Key
- `D1_TOKEN` — D1 REST API Bearer Token
- `TRIGGER_TOKEN` — 手工触发 webhook 的 token

**Variables（明文）：**
- `OPENAI_BASE_URL` — LLM API 地址
- `OPENAI_MODEL` — 模型名

部署流程：
- Secrets → `wrangler secret put` 写入（CF dashboard 加密不可见）
- Variables → `wrangler deploy --var` 注入（CF dashboard 明文可见）

## 关键命令

- 建表：`curl -X POST https://data.klinux.dpdns.org/query -H "Authorization: Bearer \$D1_TOKEN" -H "Content-Type: application/json" -d '{"query":"CREATE TABLE IF NOT EXISTS newsfeed (id INTEGER PRIMARY KEY AUTOINCREMENT, crawled_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT '\'''\''', title TEXT NOT NULL DEFAULT '\'''\''', url TEXT NOT NULL DEFAULT '\'''\''', summary TEXT NOT NULL DEFAULT '\'''\''', category TEXT NOT NULL DEFAULT '\''general'\'')"}'`
- 部署：`npx wrangler deploy`
- 手工触发：`POST /trigger?token=<TRIGGER_TOKEN>`

## 新闻源（src/news.ts）

Hacker News（10条）、GitHub Trending（10条）、BBC（5条）、Reuters（5条）、TechCrunch（5条）、36氪（5条）、虎嗅（5条）

## 数据保留

最多保留 1800 条（9 批次 × 200），每次 cron 后自动清理最旧的。页面只展示最近 30 条。

## 部署注意

- secrets（API Key / Token）通过 `wrangler secret put` 加密写入；plain vars（URL / Model）通过 `--var` 注入
- Worker 每次启动会自动 `CREATE TABLE IF NOT EXISTS`，建表步骤可跳过
- GitHub Trending 使用第三方 API `ghapi.huchen.dev`，如失效需替换
- 无本地测试环境，直接 `wrangler deploy` 部署到生产验证
- batch INSERT 按 15 条分块写入，避免 D1 SQL 变量数超限
