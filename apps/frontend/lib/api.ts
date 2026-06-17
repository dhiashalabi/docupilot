/**
 * Thin fetch-based API client for the DocuPilot backend.
 *
 * The base URL is read from NEXT_PUBLIC_API_URL (defaults to localhost:8000).
 * All endpoints live under /api/v1.
 */

import type {
  ChatRead,
  DocumentRead,
  GeneratedPdfRead,
  MessageRead,
  ProcessingJob,
  SearchHit,
  StreamEvent,
  SystemHealth,
} from "@/lib/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PREFIX = `${BASE}/api/v1`;

/** Typed error thrown by all API helpers — carries the HTTP status code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True for any 4xx status — used to suppress retries. */
  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PREFIX}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // --- Health ---
  llmHealth: () => request<{ status: string; llm: string }>("/health/llm"),
  systemHealth: () => request<SystemHealth>("/health/system"),

  // --- Documents ---
  listDocuments: () => request<DocumentRead[]>("/documents"),
  getDocument: (id: string) => request<DocumentRead>(`/documents/${id}`),
  reingestDocument: (id: string) =>
    request<DocumentRead>(`/documents/${id}/reingest`, { method: "POST" }),
  getDocumentJob: (id: string) =>
    request<ProcessingJob>(`/documents/${id}/job`),
  deleteDocument: (id: string) =>
    request<void>(`/documents/${id}`, { method: "DELETE" }),
  uploadDocument: async (file: File): Promise<DocumentRead> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${PREFIX}/documents`, { method: "POST", body: form });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? detail;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, detail);
    }
    return res.json();
  },

  // --- Chats ---
  listChats: () => request<ChatRead[]>("/chats"),
  getChat: (id: string) => request<ChatRead>(`/chats/${id}`),
  createChat: (body: { title?: string | null; document_ids: string[] }) =>
    request<ChatRead>("/chats", { method: "POST", body: JSON.stringify(body) }),
  updateChat: (
    id: string,
    body: { title?: string | null; document_ids?: string[] | null },
  ) => request<ChatRead>(`/chats/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteChat: (id: string) => request<void>(`/chats/${id}`, { method: "DELETE" }),
  listMessages: (chatId: string) =>
    request<MessageRead[]>(`/chats/${chatId}/messages`),

  // --- Search ---
  search: (body: { query: string; document_ids?: string[]; top_k?: number }) =>
    request<SearchHit[]>("/search", { method: "POST", body: JSON.stringify(body) }),

  // --- Generate ---
  summarize: (body: { document_ids: string[]; instruction?: string }) =>
    request<{ summary: string }>("/generate/summary", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generatePdf: (body: { title: string; markdown: string; chat_id?: string | null }) =>
    request<GeneratedPdfRead>("/generate/pdf", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listPdfs: () => request<GeneratedPdfRead[]>("/generate/pdf"),
  downloadPdfUrl: (id: string) => `${PREFIX}/generate/pdf/${id}/download`,
};

/**
 * Stream a chat answer via Server-Sent Events. Invokes `onEvent` for each
 * parsed event until the stream completes.
 */
export async function streamMessage(
  chatId: string,
  content: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${PREFIX}/chats/${chatId}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error("Failed to start message stream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        onEvent(JSON.parse(json) as StreamEvent);
      } catch {
        /* ignore malformed event */
      }
    }
  }
}
