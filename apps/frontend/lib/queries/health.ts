"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { qk } from "@/lib/queries/keys";

/** System health – refetches every 15 s automatically. */
export function useSystemHealth() {
  return useQuery({
    queryKey: qk.systemHealth,
    queryFn: () => api.systemHealth(),
    refetchInterval: 15_000,
  });
}
