# now-u-know

Cloudflare Worker — 每日 4 次定时抓取全球资讯，AI 贴吧风锐评，页面展示最近 30 条。

## 架构

- 单 Worker，`fetch` 返回页面，`scheduled` 做抓取（cron: 00/04/10/14 UTC = CST 08/12/18/22）
- 数据存 D1，通过 REST API (`https://ocean.klinux.dpdns.org/query`) 操作
- LLM 摘要走 OpenAI 兼容 API，风格为贴吧老哥，最多重试 3 次确保产出

## 环境变量

在 GitHub repo Settings > Secrets and variables > Actions 中配置：

**Secrets（加密）：**
- `CF_ACCOUNT_ID` — Cloudflare 账户 ID
- `CF_API_TOKEN` — Cloudflare API Token
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

- 手工触发：`POST /trigger?token=<TRIGGER_TOKEN>`
- 部署：`npx wrangler deploy`

## 新闻源（src/news.ts）

Hacker News（10条）、GitHub Trending（10条）、BBC（5条）、NPR（5条）、TechCrunch（5条）、The Verge（5条）、Wired（5条）、36氪（5条）、少数派（5条）

## 数据保留

最多保留 1800 条（9 批次 × 200），每次 cron 后自动清理最旧的。页面只展示最近 30 条。

## 关键修复记录

- batch INSERT 分 15 条一批写入，避免 D1 SQL 变量数超限
- LLM 回应要求结构化 JSON 输出，按 index 解析匹配避免错位；失败降级到行号解析
- AI 锐评字数 ~50 字左右，最少 30 字，可更长；max_tokens 4096
- LLM 调用失败或返回稀疏时自动重试最多 3 次
- RSS/Atom 解析处理 CDATA 标记，过滤无效标题
- 时间戳页面显示为 CST (UTC+8)
- HTML 实体解码 decodeHTMLEntities() 处理标题中的 &amp; &#39; &rsquo; 等实体
