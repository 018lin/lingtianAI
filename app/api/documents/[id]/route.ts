import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();
    const { data: document, error: findError } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("id", id)
      .single();

    if (findError || !document) {
      return NextResponse.json({ error: "文件不存在。" }, { status: 404 });
    }

    const { error: removeError } = await supabase.storage
      .from(getStorageBucket())
      .remove([document.storage_path]);

    if (removeError) {
      return NextResponse.json({ error: removeError.message }, { status: 500 });
    }

    const { error: deleteError } = await supabase.from("documents").delete().eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文件删除失败。" },
      { status: 401 }
    );
  }
}
