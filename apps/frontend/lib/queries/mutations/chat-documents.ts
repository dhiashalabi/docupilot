"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { qk } from "@/lib/queries/keys"

/**
 * Upload a new PDF directly into a chat.
 * The document is created globally (also appears on the Documents page)
 * and immediately linked to the chat.  Status starts as PENDING — poll
 * useDocumentJob to track ingestion progress.
 */
export function useUploadChatDocument(chatId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.uploadChatDocument(chatId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.chat(chatId) })
      void qc.invalidateQueries({ queryKey: qk.documents })
    },
  })
}
