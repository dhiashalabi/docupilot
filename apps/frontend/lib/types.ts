/**
 * Shared API types mirroring the FastAPI Pydantic schemas.
 */

export type DocumentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export interface DocumentRead {
  id: string;
  filename: string;
  size_bytes: number;
  page_count: number | null;
  language: string | null;
  status: DocumentStatus;
  error: string | null;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  document_id: string;
  status: string;
  progress: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ChatRead {
  id: string;
  title: string | null;
  document_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface Citation {
  document_id: string;
  chunk_id: string | null;
  page_from: number | null;
  page_to: number | null;
  score: number | null;
}

export interface MessageRead {
  id: string;
  role: "user" | "assistant";
  content: string;
  language: string | null;
  citations: Citation[];
  created_at: string;
}

export interface SearchHit {
  chunk_id: string;
  document_id: string;
  filename: string;
  content: string;
  page_from: number | null;
  page_to: number | null;
  score: number;
}

export interface GeneratedPdfRead {
  id: string;
  chat_id: string | null;
  title: string;
  status: DocumentStatus;
  error: string | null;
  created_at: string;
}

/** System health for the top-bar widget. */
export type ComponentStatus = "up" | "down";
export type OverallStatus = "operational" | "degraded" | "down";

export interface SystemComponent {
  key: string;
  name: string;
  status: ComponentStatus;
}

export interface SystemHealth {
  status: OverallStatus;
  components: SystemComponent[];
}

/** Streaming SSE event emitted by the chat endpoint. */
export type StreamEvent =
  | { type: "token"; text: string }
  | {
      type: "done";
      message_id: string;
      citations: Array<{
        n: number;
        document_id: string;
        filename: string;
        page_from: number | null;
        page_to: number | null;
        score: number;
      }>;
    }
  | { type: "error"; detail: string };
