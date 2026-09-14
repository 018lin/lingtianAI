type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[];
  }>;
  error?: {
    message?: string;
  };
  message?: string;
};

export async function createEmbedding(input: string) {
  const apiKey = process.env.GLM_API_KEY;

  if (!apiKey) {
    throw new Error("GLM_API_KEY 尚未配置。");
  }

  const baseUrl = process.env.GLM_API_BASE_URL || "https://open.bigmodel.cn/api/paas/v4";
  const model = process.env.GLM_EMBEDDING_MODEL || "embedding-3";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input
    }),
    cache: "no-store"
  });

  const payload = (await response.json()) as EmbeddingResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || "GLM Embedding 请求失败。");
  }

  const embedding = payload.data?.[0]?.embedding;

  if (!embedding?.length) {
    throw new Error("GLM Embedding 返回结果为空。");
  }

  return embedding;
}
