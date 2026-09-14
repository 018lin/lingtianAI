"use client";

import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Database,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  KeyRound,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, DocumentRecord, SourceCitation } from "@/lib/types";

const initialMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "你好，我是凌田知识库助手。你可以直接询问已上传的制度、流程、表格数据和业务资料，我会根据知识库内容回答，并标注参考来源。"
};

const suggestions = [
  "知识库里有哪些资料？",
  "帮我总结现有制度的重点",
  "这个表格里有哪些关键数据？"
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusLabel(status: DocumentRecord["status"]) {
  return {
    pending: "待处理",
    processing: "处理中",
    completed: "已入库",
    failed: "失败"
  }[status];
}

function FileIcon({ type }: { type: "docx" | "xlsx" }) {
  return type === "xlsx" ? <FileSpreadsheet size={17} /> : <FileText size={17} />;
}

function SourceList({ sources }: { sources: SourceCitation[] }) {
  if (!sources.length) return null;

  return (
    <div className="sources">
      <div className="sources-heading">
        <BookOpen size={14} />
        <span>参考来源</span>
      </div>
      <div className="source-list">
        {sources.map((source, index) => (
          <div className="source-item" key={`${source.documentId}-${index}`}>
            <div className="source-number">{String(index + 1).padStart(2, "0")}</div>
            <div className="source-copy">
              <strong>{source.documentName}</strong>
              <span>
                {source.sheetName
                  ? `${source.sheetName} · 第 ${source.rowStart || 1}-${source.rowEnd || 1} 行`
                  : source.section || "文档内容"}
              </span>
              <p>{source.excerpt}</p>
            </div>
            <span className="source-score">{Math.round(source.similarity * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KnowledgeWorkspace() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "library">("chat");
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [toast, setToast] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const completedCount = useMemo(
    () => documents.filter((document) => document.status === "completed").length,
    [documents]
  );
  const totalChunks = useMemo(
    () => documents.reduce((total, document) => total + (document.chunk_count || 0), 0),
    [documents]
  );

  const fetchDocuments = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingDocuments(true);
    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) {
        setDocuments(payload.documents || []);
      }
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void fetchDocuments();
    const timer = window.setInterval(() => {
      void fetchDocuments();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchDocuments, isAdmin]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function sendMessage(value = input) {
    const content = value.trim();
    if (!content || isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "暂时无法回答这个问题。");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: payload.answer,
          sources: payload.sources || []
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "问答服务暂时不可用。"
        }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function loginAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const payload = await response.json();
    if (!response.ok) {
      setAdminError(payload.error || "密码不正确。");
      return;
    }
    setIsAdmin(true);
    setPassword("");
    setIsAdminOpen(false);
    setActiveView("library");
    setToast("管理员模式已开启");
  }

  async function logoutAdmin() {
    await fetch("/api/admin/logout", { method: "POST" });
    setIsAdmin(false);
    setDocuments([]);
    setActiveView("chat");
    setToast("已退出管理员模式");
  }

  async function processDocument(id: string) {
    const response = await fetch(`/api/documents/${id}/process`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "文档处理失败。");
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!isAdmin || uploading) return;
    const selectedFiles = Array.from(files);
    const validFiles = selectedFiles.filter((file) => /\.(docx|xlsx)$/i.test(file.name));

    if (!validFiles.length) {
      setUploadError("请选择 .docx 或 .xlsx 文件。");
      return;
    }

    setUploading(true);
    setUploadError("");

    for (const file of validFiles) {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        setUploadError(payload.error || `${file.name} 上传失败。`);
        continue;
      }

      setToast(`${file.name} 已上传，开始解析`);
      await fetchDocuments();

      try {
        await processDocument(payload.document.id);
        setToast(`${file.name} 已完成入库`);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : `${file.name} 处理失败。`);
      }
      await fetchDocuments();
    }

    setUploading(false);
  }

  async function deleteDocument(document: DocumentRecord) {
    if (!window.confirm(`确定删除“${document.name}”吗？对应的向量也会被删除。`)) return;
    const response = await fetch(`/api/documents/${document.id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      setUploadError(payload.error || "删除失败。");
      return;
    }
    setToast("文件和对应向量已删除");
    await fetchDocuments();
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void uploadFiles(event.dataTransfer.files);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={19} strokeWidth={2.4} />
          </div>
          <div>
            <strong>凌田知识库</strong>
            <span>AI WORKSPACE</span>
          </div>
        </div>

        <div className="sidebar-section-label">工作区</div>
        <nav className="primary-nav" aria-label="主导航">
          <button
            className={activeView === "chat" ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView("chat")}
          >
            <MessageSquare size={17} />
            <span>智能问答</span>
            <span className="nav-count">01</span>
          </button>
          <button
            className={activeView === "library" ? "nav-item active" : "nav-item"}
            onClick={() => {
              if (isAdmin) setActiveView("library");
              else setIsAdminOpen(true);
            }}
          >
            <FolderOpen size={17} />
            <span>知识库文件</span>
            <span className="nav-count">{isAdmin ? documents.length : "—"}</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="status-dot" />
            <span>知识库服务在线</span>
          </div>
          <button className="admin-entry" onClick={() => setIsAdminOpen(true)}>
            <Settings2 size={16} />
            <span>{isAdmin ? "管理员控制台" : "管理员入口"}</span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" />
              凌田系统 / KNOWLEDGE AI
            </div>
            <h1>{activeView === "chat" ? "把资料问清楚" : "知识库文件"}</h1>
          </div>
          <div className="topbar-actions">
            <div className="system-pill">
              <Database size={15} />
              <span>{isAdmin ? `${completedCount} 个文件已就绪` : "知识库已连接"}</span>
            </div>
            <button
              className="icon-button"
              title="打开管理员入口"
              onClick={() => setIsAdminOpen(true)}
            >
              <KeyRound size={17} />
            </button>
          </div>
        </header>

        {activeView === "chat" ? (
          <div className="chat-layout">
            <div className="chat-column">
              <div className="conversation">
                <div className="conversation-meta">
                  <span>当前知识库</span>
                  <span className="meta-divider" />
                  <span>默认知识库</span>
                  <span className="conversation-live">
                    <span className="status-dot" />
                    实时检索
                  </span>
                </div>

                <div className="message-list">
                  {messages.map((message) => (
                    <article
                      className={message.role === "assistant" ? "message assistant" : "message user"}
                      key={message.id}
                    >
                      <div className="message-avatar">
                        {message.role === "assistant" ? <Sparkles size={16} /> : "你"}
                      </div>
                      <div className="message-body">
                        <div className="message-author">
                          {message.role === "assistant" ? "凌田助手" : "你"}
                          <span>{message.role === "assistant" ? "AI" : "QUESTION"}</span>
                        </div>
                        <div className="message-content">{message.content}</div>
                        {message.sources ? <SourceList sources={message.sources} /> : null}
                      </div>
                    </article>
                  ))}
                  {isSending ? (
                    <article className="message assistant">
                      <div className="message-avatar">
                        <Sparkles size={16} />
                      </div>
                      <div className="message-body">
                        <div className="message-author">
                          凌田助手 <span>AI</span>
                        </div>
                        <div className="typing-indicator">
                          <LoaderCircle size={15} className="spin" />
                          正在检索知识库并组织答案
                        </div>
                      </div>
                    </article>
                  ) : null}
                  <div ref={endOfMessagesRef} />
                </div>
              </div>

              <div className="composer-wrap">
                <div className="suggestion-row">
                  <span>试试这样问</span>
                  {suggestions.map((suggestion) => (
                    <button key={suggestion} onClick={() => void sendMessage(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
                <div className="composer">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder="输入问题，向你的知识库提问..."
                    rows={1}
                    disabled={isSending}
                  />
                  <button
                    className="send-button"
                    title="发送问题"
                    onClick={() => void sendMessage()}
                    disabled={!input.trim() || isSending}
                  >
                    <ArrowUp size={19} />
                  </button>
                </div>
                <div className="composer-note">
                  <span>Enter 发送 · Shift + Enter 换行</span>
                  <span>回答仅基于已入库资料</span>
                </div>
              </div>
            </div>

            <aside className="insight-column">
              <div className="side-card intro-card">
                <div className="card-kicker">
                  <span className="mini-icon green">
                    <ShieldCheck size={15} />
                  </span>
                  知识库状态
                </div>
                <h2>让信息<br />更接近答案</h2>
                <p>上传团队资料，建立可检索的内容索引。每个回答都会回到原始文件寻找依据。</p>
                <button className="text-action" onClick={() => setIsAdminOpen(true)}>
                  管理知识库 <ArrowUp size={15} className="action-arrow" />
                </button>
              </div>
              <div className="side-card metrics-card">
                <div className="card-kicker">
                  <span className="mini-icon yellow">
                    <Database size={15} />
                  </span>
                  工作区概览
                </div>
                <div className="metric-row">
                  <div>
                    <strong>{isAdmin ? completedCount : "—"}</strong>
                    <span>已就绪文件</span>
                  </div>
                  <div>
                    <strong>{isAdmin ? totalChunks : "—"}</strong>
                    <span>可检索片段</span>
                  </div>
                </div>
                <div className="metric-foot">
                  <span className="status-dot" />
                  <span>支持 Word / Excel</span>
                </div>
              </div>
              <div className="side-card note-card">
                <div className="note-icon">
                  <Search size={16} />
                </div>
                <div>
                  <strong>问得越具体，找得越准</strong>
                  <p>可以在问题中写出文件名、工作表或业务关键词。</p>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <section className="library-view">
            <div className="library-toolbar">
              <div>
                <div className="view-label">文件管理</div>
                <h2>默认知识库</h2>
              </div>
              <div className="toolbar-actions">
                <button className="secondary-button" onClick={() => void fetchDocuments()}>
                  <RefreshCw size={16} className={isLoadingDocuments ? "spin" : ""} />
                  刷新状态
                </button>
                <button className="primary-button" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} />
                  上传文件
                </button>
              </div>
            </div>

            <div
              className={isDragging ? "dropzone dragging" : "dropzone"}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="dropzone-icon">
                <Upload size={19} />
              </div>
              <div>
                <strong>拖拽文件到这里，或点击上传</strong>
                <span>支持 .docx、.xlsx，单个文件不超过 25 MB</span>
              </div>
              <Plus size={20} className="dropzone-plus" />
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.xlsx"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files) void uploadFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>

            {uploadError ? (
              <div className="inline-error">
                <CircleAlert size={16} />
                {uploadError}
                <button title="关闭提示" onClick={() => setUploadError("")}>
                  <X size={15} />
                </button>
              </div>
            ) : null}

            <div className="library-summary">
              <span>{documents.length} 个文件</span>
              <span className="summary-divider" />
              <span>{completedCount} 个可检索</span>
              {uploading ? (
                <span className="processing-label">
                  <LoaderCircle size={14} className="spin" />
                  文件处理中...
                </span>
              ) : null}
            </div>

            <div className="document-table">
              <div className="table-head">
                <span>文件</span>
                <span>状态</span>
                <span>片段</span>
                <span>更新时间</span>
                <span />
              </div>
              {isLoadingDocuments && !documents.length ? (
                <div className="table-empty">
                  <LoaderCircle size={19} className="spin" />
                  正在读取文件列表
                </div>
              ) : documents.length ? (
                documents.map((document) => (
                  <div className="document-row" key={document.id}>
                    <div className="document-name">
                      <div className={document.file_type === "xlsx" ? "file-icon excel" : "file-icon word"}>
                        <FileIcon type={document.file_type} />
                      </div>
                      <div>
                        <strong>{document.name}</strong>
                        <span>{formatFileSize(document.size_bytes)}</span>
                      </div>
                    </div>
                    <div className={`document-status ${document.status}`}>
                      {document.status === "processing" ? <LoaderCircle size={14} className="spin" /> : null}
                      {document.status === "completed" ? <Check size={14} /> : null}
                      {document.status === "failed" ? <CircleAlert size={14} /> : null}
                      {statusLabel(document.status)}
                    </div>
                    <span className="chunk-count">{document.chunk_count || "—"}</span>
                    <span className="updated-at">{formatDate(document.updated_at)}</span>
                    <button
                      className="row-menu"
                      title="删除文件"
                      onClick={() => void deleteDocument(document)}
                    >
                      <Trash2 size={16} />
                    </button>
                    {document.error_message ? (
                      <div className="document-error">{document.error_message}</div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="table-empty">
                  <FileText size={19} />
                  还没有文件，上传第一份资料开始建立知识库
                </div>
              )}
            </div>
          </section>
        )}
      </section>

      {isAdminOpen ? (
        <div className="modal-backdrop" onMouseDown={() => setIsAdminOpen(false)}>
          <section className="admin-modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" title="关闭" onClick={() => setIsAdminOpen(false)}>
              <X size={17} />
            </button>
            {isAdmin ? (
              <>
                <div className="modal-symbol">
                  <ShieldCheck size={21} />
                </div>
                <div className="modal-heading">
                  <span className="eyebrow">ADMIN CONSOLE</span>
                  <h2>管理员控制台</h2>
                  <p>上传和管理默认知识库中的 Word、Excel 文件。</p>
                </div>
                <div className="admin-modal-actions">
                  <button
                    className="primary-button wide"
                    onClick={() => {
                      setIsAdminOpen(false);
                      setActiveView("library");
                    }}
                  >
                    <FolderOpen size={16} />
                    打开文件管理
                  </button>
                  <button className="secondary-button wide" onClick={() => void logoutAdmin()}>
                    <LogOut size={16} />
                    退出管理员模式
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-symbol">
                  <KeyRound size={21} />
                </div>
                <div className="modal-heading">
                  <span className="eyebrow">ADMIN ACCESS</span>
                  <h2>进入管理入口</h2>
                  <p>输入管理员密码后，可以上传和删除知识库文件。</p>
                </div>
                <form onSubmit={loginAdmin} className="admin-form">
                  <label htmlFor="admin-password">管理员密码</label>
                  <div className="password-field">
                    <KeyRound size={16} />
                    <input
                      id="admin-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="输入密码"
                      autoFocus
                    />
                  </div>
                  {adminError ? (
                    <div className="form-error">
                      <CircleAlert size={15} />
                      {adminError}
                    </div>
                  ) : null}
                  <button className="primary-button wide" type="submit">
                    <ShieldCheck size={16} />
                    验证并继续
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      ) : null}

      {toast ? (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      ) : null}
    </main>
  );
}
