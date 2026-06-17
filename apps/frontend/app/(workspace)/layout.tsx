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
      className="h-svh overflow-hidden"
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <WorkspaceSidebar variant="inset" side={isRTL ? "right" : "left"} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <SiteHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
