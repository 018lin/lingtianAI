import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabase-admin";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const allowedExtensions = new Set(["docx", "xlsx"]);

function getExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() || "";
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^\w.\-\u4e00-\u9fff ]/g, "_").trim() || "未命名文件";
}

export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await getSupabaseAdmin()
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ documents: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法读取文件列表。" },
      { status: 401 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择一个文件。" }, { status: 400 });
    }

    const extension = getExtension(file.name);

    if (!allowedExtensions.has(extension)) {
      return NextResponse.json({ error: "只支持 .docx 和 .xlsx 文件。" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "单个文件不能超过 25 MB。" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const documentId = crypto.randomUUID();
    const storagePath = `${documentId}/${safeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(getStorageBucket())
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: document, error: insertError } = await supabase
      .from("documents")
      .insert({
        id: documentId,
        name: file.name,
        file_type: extension,
        storage_path: storagePath,
        size_bytes: file.size,
        status: "pending"
      })
      .select("*")
      .single();

    if (insertError) {
      await supabase.storage.from(getStorageBucket()).remove([storagePath]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文件上传失败。" },
      { status: 401 }
    );
  }
}
