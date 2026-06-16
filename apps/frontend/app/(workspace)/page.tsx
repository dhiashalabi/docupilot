"use client";

import * as React from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function ChatsHomePage() {
  const router = useRouter();
  const t = useTranslations();
  const chats = useChats();
  const [creating, setCreating] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<ChatRead | null>(
    null
  );

  const features = [
    {
      icon: MessageSquareTextIcon,
      label: t("home.featureChatLabel"),
      desc: t("home.featureChatDesc"),
    },
    {
      icon: SearchIcon,
      label: t("home.featureSearchLabel"),
      desc: t("home.featureSearchDesc"),
    },
    {
      icon: SparklesIcon,
      label: t("home.featureGenerateLabel"),
      desc: t("home.featureGenerateDesc"),
    },
  ];

  const createChat = async () => {
    setCreating(true);
    try {
      const chat = await api.createChat({ title: null, document_ids: [] });
      router.push(`/chat/${chat.id}`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("errors.createChatFailed")
      );
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
      toast.error(e instanceof Error ? e.message : t("errors.deleteFailed"));
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
              <EmptyTitle className="text-2xl">
                {t("home.welcomeTitle")}
              </EmptyTitle>
              <EmptyDescription className="max-w-md">
                {t("home.welcomeDescription")}
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
                  {t("home.startNewChat")}
                </Button>
                <Button variant="outline" size="lg" className="gap-2" asChild>
                  <Link href="/documents">
                    <FileTextIcon className="size-4" />
                    {t("home.uploadDocuments")}
                  </Link>
                </Button>
              </div>
              <div className="mt-4 grid w-full grid-cols-3 gap-3">
                {features.map((card) => (
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

      {hasChats && (
        <div className="flex flex-1 flex-col overflow-hidden px-4 py-4 lg:px-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                {t("nav.chats")}
              </h1>
              <p className="text-muted-foreground text-xs">
                {t("common.conversationCount", {
                  count: recentChats.length,
                })}
              </p>
            </div>
            <Button
              onClick={() => void createChat()}
              disabled={creating}
              size="sm"
              className="gap-1.5"
            >
              <SquarePenIcon className="size-3.5" />
              {t("nav.newChat")}
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
                      {chat.title || t("common.untitledChat")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t("common.documentCount", {
                        count: chat.document_ids.length,
                      })}{" "}
                      · {relativeTime(chat.updated_at)}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => setPendingDelete(chat)}
                    aria-label={t("home.deleteChatAria")}
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
            <AlertDialogTitle>{t("home.deleteChatTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("home.deleteChatDescription", {
                title:
                  pendingDelete?.title || t("common.thisConversation"),
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
    </div>
  );
}
