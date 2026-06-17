import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { getTranslations } from "next-intl/server"

import { LocaleSwitcher } from "@/components/locale-switcher"
import { ModeToggle } from "@/components/mode-toggle"
import { SystemHealth } from "@/components/system-health"

export async function SiteHeader() {
  const t = await getTranslations("common")

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ms-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{t("appName")}</h1>
        <div className="ms-auto flex items-center gap-1">
          <SystemHealth />
          <LocaleSwitcher />
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
