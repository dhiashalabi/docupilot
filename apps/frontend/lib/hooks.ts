"use client";

/**
 * Lightweight data hooks over the API client.
 *
 * Kept dependency-free (no React Query) since the surface is small. Each hook
 * exposes `{ data, loading, error, refresh }` and mutations refresh on success.
 */

import * as React from "react";

import { api } from "@/lib/api";
import type {
  ChatRead,
  DocumentRead,
  MessageRead,
  SystemHealth,
} from "@/lib/types";

function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fnRef = React.useRef(fn);
  fnRef.current = fn;

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fnRef.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh, setData };
}

export function useDocuments(pollMs?: number) {
  const state = useAsync<DocumentRead[]>(() => api.listDocuments(), []);
  React.useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => void state.refresh(), pollMs);
    return () => clearInterval(t);
  }, [pollMs, state]);
  return state;
}

export function useChats() {
  return useAsync<ChatRead[]>(() => api.listChats(), []);
}

export function useSystemHealth(pollMs = 15000) {
  const state = useAsync<SystemHealth>(() => api.systemHealth(), []);
  React.useEffect(() => {
    if (!pollMs) return;
    const t = setInterval(() => void state.refresh(), pollMs);
    return () => clearInterval(t);
  }, [pollMs, state]);
  return state;
}

export function useChat(chatId: string) {
  return useAsync<ChatRead>(() => api.getChat(chatId), [chatId]);
}

export function useMessages(chatId: string) {
  return useAsync<MessageRead[]>(() => api.listMessages(chatId), [chatId]);
}
