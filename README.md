# 凌田知识库 AI

一个基于 Next.js、Supabase pgvector、GLM Embedding 和 DeepSeek 的中文知识库问答网站。

## 本地启动

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

然后打开 `http://localhost:3000`。

## Supabase 配置

1. 创建一个 Supabase 项目。
2. 在 SQL Editor 中执行 [`supabase/schema.sql`](./supabase/schema.sql)。
3. 在 Supabase Project Settings > API 中获取 Project URL 和 Service Role Key。
4. 将它们填写到 `.env.local`。
5. 确认 `GLM_EMBEDDING_DIMENSIONS` 与 SQL 中的 `vector(2048)` 一致。如果改了维度，需要同步修改 SQL 和函数定义。

## 环境变量

复制 `.env.example` 为 `.env.local` 并填写：

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `GLM_API_KEY`
- `DEEPSEEK_API_KEY`

GLM Embedding 默认使用 `embedding-3`，DeepSeek 默认使用 `deepseek-chat`。模型名称和接口地址都可以通过环境变量调整。

## 工作方式

- 访客无需登录，可以直接提问。
- 管理员输入密码后才能打开上传入口。
- 上传接口只负责保存文件和创建任务记录。
- 浏览器随后调用独立的处理接口，页面轮询处理状态，因此文件入库不会阻塞网站页面。
- Word 支持 `.docx`，Excel 支持 `.xlsx`。
- 文档处理会将文本切块，调用 GLM Embedding 写入 pgvector。
- 问答时先检索相关文本，再将上下文交给 DeepSeek，并在答案下方显示来源。

## Vercel 部署

1. 将项目推送到 GitHub。
2. 在 Vercel 导入该仓库。
3. 在 Vercel Project Settings > Environment Variables 中配置 `.env.example` 中的变量。
4. 重新部署。

文件处理通过单独的 `/api/documents/[id]/process` 请求完成。当前版本适合中小文件。若后续需要处理大量或超大文件，建议将这个处理接口迁移到独立 Worker 或队列服务。
