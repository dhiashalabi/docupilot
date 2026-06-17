"use client"

import * as React from "react"
import { use } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { useQueryClient } from "@tanstack/react-query"
import {
  SendIcon,
  Loader2Icon,
  FileTextIcon,
  BotIcon,
  UserIcon,
} from "lucide-react"

import { streamMessage } from "@/lib/api"
import { useChat, useMessages, useSystemHealth, qk } from "@/lib/queries"
import type { MessageRead, StreamEvent } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

interface StreamingState {
  text: string
  citations: Array<{ n: number; filename: string; page_from: number | null }>
}

function CitationList({
  citations,
}: {
  citations: MessageRead["citations"] | StreamingState["citations"]
}) {
  const t = useTranslations("common")

  if (!citations.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {citations.map((c, i) => {
        const page = "page_from" in c ? c.page_from : null
        const label =
          "filename" in c && c.filename
            ? c.filename
            : t("sourceN", { n: i + 1 })
        return (
          <Badge
            key={i}
            variant="outline"
            className="gap-1 rounded-md border-border/60 bg-background/50 px-2 py-0.5 text-[11px] font-normal text-muted-foreground backdrop-blur"
          >
            <FileTextIcon className="size-2.5" />
            {label}
            {page ? ` · p.${page}` : ""}
          </Badge>
        )
      })}
    </div>
  )
}

function Bubble({
  role,
  children,
  citations,
}: {
  role: "user" | "assistant"
  children: React.ReactNode
  citations?: MessageRead["citations"] | StreamingState["citations"]
}) {
  const isUser = role === "user"
  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <Avatar className="mt-0.5 size-7 shrink-0">
        <AvatarFallback
          className={cn(
            isUser ? "bg-primary text-primary-foreground" : "border bg-card"
          )}
        >
          {isUser ? (
            <UserIcon className="size-3.5" />
          ) : (
            <BotIcon className="size-3.5" />
          )}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "max-w-[75%] space-y-1",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm leading-normal",
            isUser
              ? "rounded-tr-md bg-primary text-primary-foreground"
              : "rounded-tl-md bg-muted"
          )}
        >
          <div className="wrap-break-word whitespace-pre-wrap">{children}</div>
        </div>
        {citations ? <CitationList citations={citations} /> : null}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const t = useTranslations("chat")
  const te = useTranslations("errors")

  const queryClient = useQueryClient()
  const { data: chatData } = useChat(id)
  const { data: messagesData, isPending: messagesLoading } = useMessages(id)
  const { data: healthData } = useSystemHealth()

  const [input, setInput] = React.useState("")
  const [streaming, setStreaming] = React.useState<StreamingState | null>(null)
  const [busy, setBusy] = React.useState(false)
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const modelComponent = healthData?.components.find((c) => c.key === "model")
  const llmReady = modelComponent ? modelComponent.status === "up" : true

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      viewportRef.current?.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      })
    })
  }, [])

  React.useEffect(() => {
    scrollToBottom()
  }, [messagesData, streaming, scrollToBottom])

  const adjustTextarea = React.useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  React.useEffect(() => {
    adjustTextarea()
  }, [input, adjustTextarea])

  const send = async () => {
    const content = input.trim()
    if (!content || busy) return
    setInput("")
    setBusy(true)
    setStreaming({ text: "", citations: [] })

    // Optimistically insert the user's message into the cache
    const optimisticMessage: MessageRead = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content,
      language: null,
      citations: [],
      created_at: new Date().toISOString(),
    }
    queryClient.setQueryData<MessageRead[]>(qk.messages(id), (prev) => [
      ...(prev ?? []),
      optimisticMessage,
    ])

    try {
      await streamMessage(id, content, (event: StreamEvent) => {
        if (event.type === "token") {
          setStreaming((s) => (s ? { ...s, text: s.text + event.text } : s))
        } else if (event.type === "done") {
          setStreaming((s) => (s ? { ...s, citations: event.citations } : s))
        } else if (event.type === "error") {
          toast.error(event.detail)
        }
      })
      // Replace optimistic data with the real messages from the server
      await queryClient.invalidateQueries({ queryKey: qk.messages(id) })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("sendMessageFailed"))
      // Roll back the optimistic message on error
      await queryClient.invalidateQueries({ queryKey: qk.messages(id) })
    } finally {
      setStreaming(null)
      setBusy(false)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  const initialLoading = messagesLoading && !messagesData
  const hasMessages = (messagesData?.length ?? 0) > 0 || streaming
  const docCount = chatData?.document_ids.length ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2.5 lg:px-6">
        <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
          <BotIcon className="size-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm leading-tight font-medium">
            {chatData?.title || t("newChat")}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {t("documentsInContext", { count: docCount })}
          </p>
        </div>
      </div>

      {!llmReady && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground lg:px-6">
          <Loader2Icon className="size-3 animate-spin" />
          {t("modelLoading")}
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 lg:px-6">
          {initialLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2",
                    i % 2 === 0 ? "flex-row" : "flex-row-reverse"
                  )}
                >
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <Skeleton
                    className={cn(
                      "h-16 rounded-2xl",
                      i % 2 === 0 ? "w-3/5" : "w-2/5"
                    )}
                  />
                </div>
              ))}
            </>
          ) : !hasMessages ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <BotIcon className="size-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">{t("emptyTitle")}</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  {t("emptyDescription")}
                </p>
              </div>
            </div>
          ) : (
            <>
              {messagesData?.map((m) => (
                <Bubble key={m.id} role={m.role} citations={m.citations}>
                  {m.content}
                </Bubble>
              ))}
              {streaming && (
                <Bubble role="assistant" citations={streaming.citations}>
                  {streaming.text || <TypingIndicator />}
                </Bubble>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t bg-background/80 px-4 py-3 backdrop-blur-sm lg:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
          <div className="flex flex-1 items-end rounded-xl border bg-muted/30 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={t("inputPlaceholder")}
              rows={1}
              disabled={busy}
              className="max-h-[200px] min-h-[44px] resize-none border-0 bg-transparent px-3.5 py-3 text-sm leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          <Button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            size="icon"
            className="size-[44px] shrink-0 rounded-xl"
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SendIcon className="size-4 rtl:rotate-180" />
            )}
          </Button>
        </div>
        <p className="mx-auto mt-1.5 flex max-w-2xl items-center justify-center gap-1.5 text-[10px] text-muted-foreground/60">
          <Kbd>↵</Kbd> {t("sendHint")}
          <span>·</span>
          <Kbd>⇧</Kbd>
          <Kbd>↵</Kbd> {t("newLineHint")}
        </p>
      </div>
    </div>
  )
}
