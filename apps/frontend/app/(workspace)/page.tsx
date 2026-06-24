"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import {
  SquarePenIcon,
  MessageSquareTextIcon,
  Trash2Icon,
  BotIcon,
  SparklesIcon,
  FileTextIcon,
  SearchIcon,
  PencilIcon,
  AlertCircleIcon,
  RefreshCwIcon,
} from "lucide-react"

import { useChats, useDeleteChat, useCreateChat } from "@/lib/queries"
import type { ChatRead } from "@/lib/types"
import { displayChatTitle } from "@/lib/chat-title"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { RenameChatDialog } from "@/components/rename-chat-dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
import { relativeTime } from "@/lib/utils"

export default function ChatsHomePage() {
  const router = useRouter()
  const t = useTranslations()

  const { data: chatsData, isPending, isError, refetch } = useChats()
  const createChatMutation = useCreateChat()
  const deleteChatMutation = useDeleteChat()

  const [pendingDelete, setPendingDelete] = React.useState<ChatRead | null>(
    null
  )
  const [pendingRename, setPendingRename] = React.useState<ChatRead | null>(
    null
  )

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
    const chat = pendingDelete
    setPendingDelete(null)
    try {
      await deleteChatMutation.mutateAsync(chat.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errors.deleteFailed"))
    }
  }

  const recentChats = chatsData ?? []
  const loading = isPending && !chatsData
  const creating = createChatMutation.isPending
  const hasChats = recentChats.length > 0

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
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <Empty className="max-w-md border-none">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircleIcon className="text-destructive" />
            </EmptyMedia>
            <EmptyTitle>{t("errors.loadFailed")}</EmptyTitle>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCwIcon className="size-4" />
            {t("common.retry")}
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!hasChats && (
        <div className="flex flex-1 items-center justify-center px-4">
          <Empty className="max-w-xl border-none">
            <EmptyHeader>
              <EmptyMedia
                variant="icon"
                className="size-16 rounded-2xl bg-primary/10"
              >
                <BotIcon className="size-8 text-primary" />
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
                    <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                      <card.icon className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs font-medium">{card.label}</p>
                    <p className="text-[11px] leading-tight text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
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
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <MessageSquareTextIcon className="size-3.5 text-muted-foreground" />
                  </div>
                  <Link href={`/chat/${chat.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {displayChatTitle(chat.title, t("common.untitledChat"))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("common.documentCount", {
                        count: chat.document_ids.length,
                      })}{" "}
                      · {relativeTime(chat.updated_at)}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => setPendingRename(chat)}
                    aria-label={t("chat.renameChat")}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
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
                title: pendingDelete?.title || t("common.thisConversation"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructiveSolid"
              onClick={() => void confirmDelete()}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pendingRename && (
        <RenameChatDialog
          open={!!pendingRename}
          onOpenChange={(open) => !open && setPendingRename(null)}
          chatId={pendingRename.id}
          currentTitle={pendingRename.title}
        />
      )}
    </div>
  )
}
