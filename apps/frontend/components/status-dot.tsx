import { cn } from "@/lib/utils";
import type { OverallStatus } from "@/lib/types";

type DotStatus = OverallStatus | "up" | "down";

const DOT_COLOR: Record<DotStatus, string> = {
  operational: "bg-emerald-500",
  up: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

/** A small colored status dot, pulsing when not fully healthy. */
export function StatusDot({
  status,
  className,
  pulse,
}: {
  status: DotStatus;
  className?: string;
  pulse?: boolean;
}) {
  const animate = pulse ?? (status === "degraded" || status === "down");
  return (
    <span className={cn("relative flex size-2.5 shrink-0", className)}>
      {animate && (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-60",
            DOT_COLOR[status]
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          DOT_COLOR[status]
        )}
      />
    </span>
  );
}
