"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
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
} from "lucide-react";

import { api } from "@/lib/api";
import { useChats } from "@/lib/hooks";
import type { ChatRead } from "@/lib/types";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

const mainNav = [
  { title: "Chats", url: "/", icon: MessageSquareTextIcon },
  { title: "Documents", url: "/documents", icon: FilesIcon },
  { title: "Search", url: "/search", icon: SearchIcon },
  { title: "Generate", url: "/generate", icon: FileOutputIcon },
];

const secondaryNav = [
  { title: "Help", url: "#", icon: CircleHelpIcon },
  { title: "Settings", url: "#", icon: Settings2Icon },
];

export function WorkspaceSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const chats = useChats();
  const [pendingDelete, setPendingDelete] = React.useState<ChatRead | null>(null);

  const createChat = async () => {
    try {
      const chat = await api.createChat({ title: null, document_ids: [] });
      router.push(`/chat/${chat.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create chat");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await api.deleteChat(id);
      await chats.refresh();
      if (pathname === `/chat/${id}`) {
        router.push("/");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const loading = chats.loading && !chats.data;
  const recentChats = (chats.data ?? []).slice(0, 8);

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      {/* ── Brand header ── */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/">
                <BotIcon className="!size-5" />
                <span className="text-base font-semibold">DocuPilot</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* ── New Chat + Main nav ── */}
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem className="flex items-center gap-2">
                <SidebarMenuButton
                  tooltip="New Chat"
                  onClick={() => void createChat()}
                  className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                >
                  <SquarePenIcon />
                  <span>New Chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
              {mainNav.map((item) => {
                const active =
                  item.url === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
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
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Recent chats ── */}
        {loading && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
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
            <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
            <SidebarMenu>
              {recentChats.map((chat: ChatRead) => {
                const active = pathname === `/chat/${chat.id}`;
                return (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={`/chat/${chat.id}`}>
                        <MessageSquareTextIcon />
                        <span className="truncate">
                          {chat.title || "Untitled chat"}
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
                          <span className="sr-only">More</span>
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-32 rounded-lg"
                        side="right"
                        align="start"
                      >
                        <DropdownMenuItem asChild>
                          <Link href={`/chat/${chat.id}`}>
                            <MessageSquareTextIcon />
                            <span>Open</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setPendingDelete(chat)}
                        >
                          <Trash2Icon />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                );
              })}
              {(chats.data?.length ?? 0) > 8 && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="text-sidebar-foreground/70">
                    <Link href="/">
                      <MoreHorizontalIcon className="text-sidebar-foreground/70" />
                      <span>View all</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {/* ── Secondary nav ── */}
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
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="font-medium">
                {pendingDelete?.title || "this conversation"}
              </span>{" "}
              and all of its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
