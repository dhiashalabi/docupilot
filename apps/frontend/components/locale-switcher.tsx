"use client"

import { LanguagesIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

export function LocaleSwitcher() {
  const locale = useLocale()
  const t = useTranslations("language")
  const router = useRouter()

  const toggleLocale = () => {
    const newLocale = locale === "ar" ? "en" : "ar"
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggleLocale} className="gap-2">
      <LanguagesIcon className="size-4" />
      <span className="hidden sm:inline">{t("switchTo")}</span>
    </Button>
  )
}
