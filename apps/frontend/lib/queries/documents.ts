"use client"

import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { qk } from "@/lib/queries/keys"

/** List all documents. Pass `poll: true` to refetch every 3 s (used while uploads are processing). */
export function useDocuments(options?: { poll?: boolean }) {
  return useQuery({
    queryKey: qk.documents,
    queryFn: () => api.listDocuments(),
    refetchInterval: options?.poll ? 3_000 : false,
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
