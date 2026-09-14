export type DocumentStatus = "pending" | "processing" | "completed" | "failed";

export type DocumentRecord = {
  id: string;
  name: string;
  file_type: "doc" | "docx" | "xls" | "xlsx";
  storage_path: string;
  size_bytes: number;
  status: DocumentStatus;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type SourceCitation = {
  documentId: string;
  documentName: string;
  similarity: number;
  section?: string;
  sheetName?: string;
  rowStart?: number;
  rowEnd?: number;
  excerpt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceCitation[];
};
