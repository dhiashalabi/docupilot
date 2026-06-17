"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { qk } from "@/lib/queries/keys";

/** Create a new chat and invalidate the chats list. */
export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string | null; document_ids: string[] }) =>
      api.createChat(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.chats });
    },
  });
}

/** Delete a chat by id. */
export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteChat(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: qk.chat(id) });
      qc.removeQueries({ queryKey: qk.messages(id) });
      void qc.invalidateQueries({ queryKey: qk.chats });
    },
  });
}

/** Patch a chat's title or document list. */
export function useUpdateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { title?: string | null; document_ids?: string[] | null };
    }) => api.updateChat(id, body),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: qk.chat(id) });
      void qc.invalidateQueries({ queryKey: qk.chats });
    },
  });
}
