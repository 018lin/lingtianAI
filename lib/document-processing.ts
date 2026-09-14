import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import * as XLSX from "xlsx";
import { createEmbedding } from "@/lib/embeddings";
import { chunkParagraphs, chunkSpreadsheetRows, type TextChunk } from "@/lib/chunking";
import { getStorageBucket, getSupabaseAdmin } from "@/lib/supabase-admin";

type ProcessedDocument = {
  chunks: TextChunk[];
};

function getExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop();
}

async function parseDocx(buffer: Buffer, fileName: string): Promise<ProcessedDocument> {
  const result = await mammoth.extractRawText({ buffer });
  const paragraphs = result.value.split(/\n+/);

  return {
    chunks: chunkParagraphs(paragraphs, {
      fileName,
      fileType: "docx"
    })
  };
}

async function parseDoc(buffer: Buffer, fileName: string): Promise<ProcessedDocument> {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  const paragraphs = document.getBody().split(/\n+/);

  return {
    chunks: chunkParagraphs(paragraphs, {
      fileName,
      fileType: "doc"
    })
  };
}

function formatCell(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (value && typeof value === "object") {
    const cellValue = value as {
      richText?: Array<{ text?: string }>;
      result?: unknown;
      text?: string;
    };

    if (cellValue.richText) {
      return cellValue.richText.map((part) => part.text || "").join("").trim();
    }

    if (cellValue.result !== undefined) {
      return formatCell(cellValue.result);
    }

    if (cellValue.text) {
      return cellValue.text.trim();
    }
  }

  return String(value ?? "").trim();
}

async function parseSpreadsheet(buffer: Buffer, fileName: string, fileType: "xls" | "xlsx"): Promise<ProcessedDocument> {
  const workbook = XLSX.read(buffer, {
    cellDates: true,
    type: "buffer"
  });
  const chunks: TextChunk[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      blankrows: false,
      defval: "",
      header: 1,
      raw: false
    });
    const rows: string[] = [];
    const headers = (sheetRows[0] || []).map((value, index) => {
      return formatCell(value) || `列${index + 1}`;
    });

    sheetRows.slice(1).forEach((row, rowIndex) => {
      const cells = headers
        .map((header, cellIndex) => {
          const value = formatCell(row[cellIndex]);
          return value ? `${header}: ${value}` : "";
        })
        .filter(Boolean);

      if (cells.length) {
        rows.push([`工作表: ${sheetName}`, `行号: ${rowIndex + 2}`, ...cells].join(" | "));
      }
    });

    if (!rows.length && headers.length) {
      rows.push([`工作表: ${sheetName}`, ...headers.map((header) => `列: ${header}`)].join(" | "));
    }

    chunks.push(
      ...chunkSpreadsheetRows(rows, {
        fileName,
        fileType,
        sheetName
      })
    );
  }

  return { chunks };
}

async function parseDocument(buffer: Buffer, fileName: string) {
  const extension = getExtension(fileName);

  if (extension === "doc") {
    return parseDoc(buffer, fileName);
  }

  if (extension === "docx") {
    return parseDocx(buffer, fileName);
  }

  if (extension === "xls" || extension === "xlsx") {
    return parseSpreadsheet(buffer, fileName, extension);
  }

  throw new Error("当前只支持 .doc、.docx、.xls 和 .xlsx 文件。");
}

export async function processStoredDocument(documentId: string) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (documentError || !document) {
    throw new Error(documentError?.message || "文档不存在。");
  }

  await supabase.from("documents").update({
    status: "processing",
    error_message: null
  }).eq("id", documentId);

  try {
    const { data: file, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(document.storage_path);

    if (downloadError || !file) {
      throw new Error(downloadError?.message || "无法从文件存储读取文件。");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseDocument(buffer, document.name);

    if (!parsed.chunks.length) {
      throw new Error("文件中没有解析到可用于问答的内容。");
    }

    await supabase.from("document_chunks").delete().eq("document_id", documentId);

    const rows = [];
    for (const chunk of parsed.chunks) {
      const embedding = await createEmbedding(chunk.content);
      rows.push({
        document_id: documentId,
        content: chunk.content,
        metadata: chunk.metadata,
        embedding
      });
    }

    for (let index = 0; index < rows.length; index += 25) {
      const { error: insertError } = await supabase
        .from("document_chunks")
        .insert(rows.slice(index, index + 25));

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    const { error: completeError } = await supabase
      .from("documents")
      .update({
        status: "completed",
        chunk_count: rows.length,
        error_message: null
      })
      .eq("id", documentId);

    if (completeError) {
      throw new Error(completeError.message);
    }

    return { chunkCount: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "文档处理失败。";
    await supabase.from("documents").update({
      status: "failed",
      error_message: message
    }).eq("id", documentId);
    throw error;
  }
}
