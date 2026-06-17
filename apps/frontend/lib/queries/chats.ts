"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { qk } from "@/lib/queries/keys";

/** List all chats. */
export function useChats() {
  return useQuery({
    queryKey: qk.chats,
    queryFn: () => api.listChats(),
  });
}

/** Single chat detail. */
export function useChat(id: string) {
  return useQuery({
    queryKey: qk.chat(id),
    queryFn: () => api.getChat(id),
    enabled: !!id,
  });
}

/** All messages for a chat. */
export function useMessages(chatId: string) {
  return useQuery({
    queryKey: qk.messages(chatId),
    queryFn: () => api.listMessages(chatId),
    enabled: !!chatId,
  });
}
