"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { qk } from "@/lib/queries/keys"

/** Upload a single PDF and invalidate the documents list on success. */
export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.uploadDocument(file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.documents })
    },
  })
}

/** Re-ingest an existing document and refresh the list. */
export function useReingestDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.reingestDocument(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: qk.documents })
      void qc.invalidateQueries({ queryKey: qk.document(id) })
    },
  })
}

/** Delete a document and remove it from the list cache. */
export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: qk.document(id) })
      void qc.invalidateQueries({ queryKey: qk.documents })
    },
  })
}
