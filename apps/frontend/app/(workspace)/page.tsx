"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SquarePenIcon,
  MessageSquareTextIcon,
  Trash2Icon,
  BotIcon,
  SparklesIcon,
  FileTextIcon,
  SearchIcon,
} from "lucide-react";

import { api } from "@/lib/api";
import { useChats } from "@/lib/hooks";
import type { ChatRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { relativeTime } from "@/lib/utils";

const FEATURES = [
  {
    icon: MessageSquareTextIcon,
    label: "Chat with PDFs",
    desc: "Ask questions about your documents",
  },
  {
    icon: SearchIcon,
    label: "Semantic Search",
    desc: "Find relevant content instantly",
  },
  {
    icon: SparklesIcon,
    label: "Generate PDFs",
    desc: "Create documents from AI content",
  },
];

export default function ChatsHomePage() {
  const router = useRouter();
  const chats = useChats();
  const [creating, setCreating] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<ChatRead | null>(
    null,
  );

  const createChat = async () => {
    setCreating(true);
    try {
      const chat = await api.createChat({ title: null, document_ids: [] });
      router.push(`/chat/${chat.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create chat");
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const chat = pendingDelete;
    setPendingDelete(null);
    try {
      await api.deleteChat(chat.id);
      await chats.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const recentChats = chats.data ?? [];
  const loading = chats.loading && !chats.data;
  const hasChats = recentChats.length > 0;

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-4 lg:px-6">
        <Skeleton className="mb-3 h-8 w-32" />
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="flex-row items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Empty state / Hero ── */}
      {!hasChats && (
        <div className="flex flex-1 items-center justify-center px-4">
          <Empty className="max-w-xl border-none">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="bg-primary/10 size-16 rounded-2xl"
              >
                <BotIcon className="text-primary size-8" />
              </EmptyMedia>
              <EmptyTitle className="text-2xl">Welcome to DocuPilot</EmptyTitle>
              <EmptyDescription className="max-w-md">
                Upload documents and start asking questions. Get AI-powered
                answers with source citations across multiple languages.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={() => void createChat()}
                  disabled={creating}
                  size="lg"
                  className="gap-2"
                >
                  <SquarePenIcon className="size-4" />
                  Start a new chat
                </Button>
                <Button variant="outline" size="lg" className="gap-2" asChild>
                  <Link href="/documents">
                    <FileTextIcon className="size-4" />
                    Upload documents
                  </Link>
                </Button>
              </div>
              <div className="mt-4 grid w-full grid-cols-3 gap-3">
                {FEATURES.map((card) => (
                  <Card
                    key={card.label}
                    className="items-center gap-2 p-4 text-center"
                  >
                    <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
                      <card.icon className="text-muted-foreground size-4" />
                    </div>
                    <p className="text-xs font-medium">{card.label}</p>
                    <p className="text-muted-foreground text-[11px] leading-tight">
                      {card.desc}
                    </p>
                  </Card>
                ))}
              </div>
            </EmptyContent>
          </Empty>
        </div>
      )}

      {/* ── Chat list ── */}
      {hasChats && (
        <div className="flex flex-1 flex-col overflow-hidden px-4 py-4 lg:px-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Chats</h1>
              <p className="text-muted-foreground text-xs">
                {recentChats.length} conversation
                {recentChats.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Button
              onClick={() => void createChat()}
              disabled={creating}
              size="sm"
              className="gap-1.5"
            >
              <SquarePenIcon className="size-3.5" />
              New Chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="grid gap-1.5">
              {recentChats.map((chat) => (
                <Card
                  key={chat.id}
                  className="group flex-row items-center gap-3 px-3 py-2.5 transition-shadow hover:shadow-sm"
                >
                  <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
                    <MessageSquareTextIcon className="text-muted-foreground size-3.5" />
                  </div>
                  <Link href={`/chat/${chat.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {chat.title || "Untitled chat"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {chat.document_ids.length} document
                      {chat.document_ids.length !== 1 ? "s" : ""} ·{" "}
                      {relativeTime(chat.updated_at)}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => setPendingDelete(chat)}
                    aria-label="Delete chat"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
