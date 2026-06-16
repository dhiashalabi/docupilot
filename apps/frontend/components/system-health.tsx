"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  RefreshCwIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ServerIcon,
  DatabaseIcon,
  ListChecksIcon,
  CpuIcon,
  BrainCircuitIcon,
  ActivityIcon,
  type LucideIcon,
} from "lucide-react";

import { useSystemHealth } from "@/lib/hooks";
import type {
  ComponentStatus,
  OverallStatus,
  SystemComponent,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/status-dot";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

const COMPONENT_ICON: Record<string, LucideIcon> = {
  api: ServerIcon,
  database: DatabaseIcon,
  redis: ListChecksIcon,
  worker: CpuIcon,
  model: BrainCircuitIcon,
};

const OVERALL_TEXT: Record<OverallStatus, string> = {
  operational: "text-emerald-600 dark:text-emerald-400",
  degraded: "text-amber-600 dark:text-amber-400",
  down: "text-red-600 dark:text-red-400",
};

const STATUS_TEXT: Record<ComponentStatus, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-600 dark:text-red-400",
};

export function SystemHealth() {
  const t = useTranslations("health");
  const { data, loading, refresh } = useSystemHealth();
  const overall: OverallStatus = data?.status ?? "down";
  const initialLoading = loading && !data;

  const OVERALL_LABEL: Record<OverallStatus, string> = {
    operational: t("operational"),
    degraded: t("degraded"),
    down: t("down"),
  };

  const KNOWN_COMPONENTS: { key: string; name: string }[] = [
    { key: "api", name: t("api") },
    { key: "database", name: t("database") },
    { key: "redis", name: t("redis") },
    { key: "worker", name: t("worker") },
    { key: "model", name: t("model") },
  ];

  const components: SystemComponent[] = KNOWN_COMPONENTS.map((known) => {
    const live = data?.components.find((c) => c.key === known.key);
    return {
      key: known.key,
      name: live?.name ?? known.name,
      status: live?.status ?? "down",
    };
  });

  return (
    <HoverCard openDelay={80} closeDelay={120}>
      <HoverCardTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2.5 font-medium"
          aria-label={t("ariaLabel")}
        >
          {initialLoading ? (
            <Skeleton className="size-2.5 rounded-full" />
          ) : (
            <StatusDot status={overall} />
          )}
          <span className={cn("hidden text-xs sm:inline", OVERALL_TEXT[overall])}>
            {initialLoading ? t("checking") : OVERALL_LABEL[overall]}
          </span>
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="flex items-center gap-2">
            <ActivityIcon className={cn("size-4", OVERALL_TEXT[overall])} />
            <span className={cn("text-sm font-semibold", OVERALL_TEXT[overall])}>
              {initialLoading ? t("checking") : OVERALL_LABEL[overall]}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-6"
            onClick={() => void refresh()}
            aria-label={t("refresh")}
          >
            <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="bg-border h-px" />
        {initialLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          <ul className="p-1.5">
            {components.map((c) => {
              const Icon = COMPONENT_ICON[c.key] ?? ServerIcon;
              const StatusIcon = c.status === "up" ? CheckCircle2Icon : XCircleIcon;
              return (
                <li
                  key={c.key}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                >
                  <span className="flex items-center gap-2">
                    <Icon className={cn("size-4", STATUS_TEXT[c.status])} />
                    <span className="text-sm">{c.name}</span>
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium",
                      STATUS_TEXT[c.status]
                    )}
                  >
                    <StatusIcon className="size-3.5" />
                    {c.status === "up" ? t("componentOperational") : t("componentDown")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
