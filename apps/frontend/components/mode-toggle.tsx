"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function getThemeLabel(
  theme: string | undefined,
  resolvedTheme: string | undefined
) {
  if (theme === "system") {
    if (resolvedTheme === "dark") return "System (dark)";
    if (resolvedTheme === "light") return "System (light)";
    return "System";
  }
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "Toggle theme";
}

export function ModeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const label = getThemeLabel(theme, resolvedTheme);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={label}
          onClick={() =>
            setTheme(resolvedTheme === "dark" ? "light" : "dark")
          }
          onDoubleClick={() => setTheme("system")}
        >
          <SunIcon className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
