"use client"

import * as React from "react"
import { toast } from "sonner"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  FilesIcon,
  MessageSquareTextIcon,
  FileOutputIcon,
  SearchIcon,
  BotIcon,
  SquarePenIcon,
  Trash2Icon,
  MoreHorizontalIcon,
  CircleHelpIcon,
  Settings2Icon,
} from "lucide-react"

import { useChats, useCreateChat, useDeleteChat } from "@/lib/queries"
import type { ChatRead } from "@/lib/types"
import { useDirection } from "@/components/ui/direction"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"

export function WorkspaceSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const direction = useDirection()
  const isRtl = direction === "rtl"
  const t = useTranslations()

  const { data: chatsData, isPending } = useChats()
  const createChatMutation = useCreateChat()
  const deleteChatMutation = useDeleteChat()

  const [pendingDelete, setPendingDelete] = React.useState<ChatRead | null>(
    null
  )

  const mainNav = [
    { title: t("nav.chats"), url: "/", icon: MessageSquareTextIcon },
    { title: t("nav.documents"), url: "/documents", icon: FilesIcon },
    { title: t("nav.search"), url: "/search", icon: SearchIcon },
    { title: t("nav.generate"), url: "/generate", icon: FileOutputIcon },
  ]

  const secondaryNav = [
    { title: t("nav.help"), url: "#", icon: CircleHelpIcon },
    { title: t("nav.settings"), url: "#", icon: Settings2Icon },
  ]

  const createChat = async () => {
    try {
      const chat = await createChatMutation.mutateAsync({
        title: null,
        document_ids: [],
      })
      router.push(`/chat/${chat.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.createChatFailed"))
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    try {
      await deleteChatMutation.mutateAsync(id)
      if (pathname === `/chat/${id}`) {
        router.push("/")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.deleteFailed"))
    }
  }

  const loading = isPending && !chatsData
  const recentChats = (chatsData ?? []).slice(0, 8)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/">
                <BotIcon className="!size-5" />
                <span className="text-base font-semibold">
                  {t("common.appName")}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem className="flex items-center gap-2">
                <SidebarMenuButton
                  tooltip={t("nav.newChat")}
                  onClick={() => void createChat()}
                  className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                >
                  <SquarePenIcon />
                  <span>{t("nav.newChat")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
              {mainNav.map((item) => {
                const active =
                  item.url === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.url)
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {loading && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>{t("nav.recentChats")}</SidebarGroupLabel>
            <SidebarMenu>
              {[0, 1, 2, 3].map((i) => (
                <SidebarMenuItem key={i} className="px-2 py-1.5">
                  <Skeleton className="h-4 w-full" />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
        {!loading && recentChats.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>{t("nav.recentChats")}</SidebarGroupLabel>
            <SidebarMenu>
              {recentChats.map((chat: ChatRead) => {
                const active = pathname === `/chat/${chat.id}`
                return (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={`/chat/${chat.id}`}>
                        <MessageSquareTextIcon />
                        <span className="truncate">
                          {chat.title || t("common.untitledChat")}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction
                          showOnHover
                          className="rounded-sm data-[state=open]:bg-accent"
                        >
                          <MoreHorizontalIcon />
                          <span className="sr-only">{t("common.more")}</span>
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-32 rounded-lg"
                        side={isRtl ? "left" : "right"}
                        align="start"
                      >
                        <DropdownMenuItem asChild>
                          <Link href={`/chat/${chat.id}`}>
                            <MessageSquareTextIcon />
                            <span>{t("common.open")}</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setPendingDelete(chat)}
                        >
                          <Trash2Icon />
                          <span>{t("common.delete")}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                )
              })}
              {(chatsData?.length ?? 0) > 8 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="text-sidebar-foreground/70"
                  >
                    <Link href="/">
                      <MoreHorizontalIcon className="text-sidebar-foreground/70" />
                      <span>{t("nav.viewAll")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
        )}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("home.deleteChatTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("home.deleteChatDescription", {
                title: pendingDelete?.title || t("common.thisConversation"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  )
}
