"use client"

import { useMutation } from "@tanstack/react-query"

import { api } from "@/lib/api"

/**
 * Semantic search – treated as a mutation because it is action-driven
 * (submit button) rather than a data subscription.
 */
export function useSearch() {
  return useMutation({
    mutationFn: (body: {
      query: string
      document_ids?: string[]
      top_k?: number
    }) => api.search(body),
  })
}
