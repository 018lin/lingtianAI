import { NextResponse } from "next/server";
import { createEmbedding } from "@/lib/embeddings";
import { generateAnswer } from "@/lib/deepseek";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ChatMessage, SourceCitation } from "@/lib/types";

type ChatRequest = {
  messages?: ChatMessage[];
};

type SearchResult = {
  id: string;
  document_id: string;
  content: string;
  metadata: Record<string, unknown>;
  document_name: string;
  similarity: number;
};

function formatContext(results: SearchResult[]) {
  return results
    .map((result, index) => {
      const metadata = Object.entries(result.metadata || {})
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => `${key}: ${value}`)
        .join(" | ");

      return `[资料 ${index + 1}] ${result.document_name} | ${metadata}\n${result.content}`;
    })
    .join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const messages = (body.messages || []).filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim()
    );
    const question = messages.at(-1)?.content?.trim();

    if (!question || messages.at(-1)?.role !== "user") {
      return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
    }

    const embedding = await createEmbedding(question);
    const { data: matches, error: searchError } = await getSupabaseAdmin().rpc(
      "match_document_chunks",
      {
        query_embedding: embedding,
        match_count: 6
      }
    );

    if (searchError) {
      return NextResponse.json({ error: searchError.message }, { status: 500 });
    }

    const results = ((matches || []) as SearchResult[]).filter(
      (result) => Number(result.similarity) >= 0.2
    );
    const answer = await generateAnswer(messages, formatContext(results));
    const sources: SourceCitation[] = results.map((result) => ({
      documentId: result.document_id,
      documentName: result.document_name,
      similarity: Number(result.similarity),
      section: typeof result.metadata?.section === "string" ? result.metadata.section : undefined,
      sheetName:
        typeof result.metadata?.sheetName === "string" ? result.metadata.sheetName : undefined,
      rowStart: typeof result.metadata?.rowStart === "number" ? result.metadata.rowStart : undefined,
      rowEnd: typeof result.metadata?.rowEnd === "number" ? result.metadata.rowEnd : undefined,
      excerpt: result.content.slice(0, 180)
    }));

    return NextResponse.json({
      answer,
      sources,
      retrievedCount: results.length
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "问答服务暂时不可用。" },
      { status: 500 }
    );
  }
}
