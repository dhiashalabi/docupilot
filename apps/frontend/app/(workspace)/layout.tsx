import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getLocale } from "next-intl/server"

import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { SiteHeader } from "@/components/site-header"

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const isRTL = locale === "ar"

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <WorkspaceSidebar variant="inset" side={isRTL ? "right" : "left"} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
