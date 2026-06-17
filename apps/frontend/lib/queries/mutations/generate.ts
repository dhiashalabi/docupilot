"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { qk } from "@/lib/queries/keys";

/** Generate a summary for a set of documents. */
export function useSummarize() {
  return useMutation({
    mutationFn: (body: { document_ids: string[]; instruction?: string }) =>
      api.summarize(body),
  });
}

/** Generate and store a PDF from markdown, then invalidate the PDFs list. */
export function useGeneratePdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      markdown: string;
      chat_id?: string | null;
    }) => api.generatePdf(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.pdfs });
    },
  });
}
