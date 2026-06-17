"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function ModeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const t = useTranslations("theme")

  // next-themes doesn't know the theme during SSR, so `theme` is undefined on
  // the server. We always compute the label — the button carries
  // suppressHydrationWarning so React accepts the server/client mismatch on
  // aria-label without throwing, and the correct label wins on the client.
  let label = t("toggle")
  if (theme === "system") {
    if (resolvedTheme === "dark") label = t("systemDark")
    else if (resolvedTheme === "light") label = t("systemLight")
    else label = t("system")
  } else if (theme === "light") {
    label = t("light")
  } else if (theme === "dark") {
    label = t("dark")
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={label}
          suppressHydrationWarning
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          onDoubleClick={() => setTheme("system")}
        >
          <SunIcon className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <MoonIcon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </TooltipTrigger>
      <TooltipContent suppressHydrationWarning>{label}</TooltipContent>
    </Tooltip>
  )
}
