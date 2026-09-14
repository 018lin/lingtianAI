import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { processStoredDocument } from "@/lib/document-processing";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const result = await processStoredDocument(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "文档处理失败。";
    const status = message.includes("管理员") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
