"use client"

import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { qk } from "@/lib/queries/keys"

/**
 * List all documents.
 *
 * Pass `poll: true` to enable automatic refetching. The interval is adaptive:
 * it polls every 3 s while any document is still PENDING or PROCESSING, and
 * stops automatically once all are settled — so there is no unnecessary
 * network traffic when everything is READY.
 */
export function useDocuments(options?: { poll?: boolean }) {
  return useQuery({
    queryKey: qk.documents,
    queryFn: () => api.listDocuments(),
    refetchInterval: (query) => {
      if (!options?.poll) return false
      const data = query.state.data
      // Keep polling while loading or while any doc is still being processed.
      if (!data) return 3_000
      return data.some(
        (d) => d.status === "PENDING" || d.status === "PROCESSING"
      )
        ? 3_000
        : false
    },
  })
}

/** Single document detail. */
export function useDocument(id: string) {
  return useQuery({
    queryKey: qk.document(id),
    queryFn: () => api.getDocument(id),
    enabled: !!id,
  })
}

/**
 * Processing-job status for a single document.
 * Set `enabled` to false when the document is no longer processing to stop polling.
 */
export function useDocumentJob(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.documentJob(id),
    queryFn: () => api.getDocumentJob(id),
    enabled: !!id && enabled,
    refetchInterval: enabled ? 2_000 : false,
  })
}
