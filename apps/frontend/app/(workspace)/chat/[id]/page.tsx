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
  PencilIcon,
  PaperclipIcon,
  UploadCloudIcon,
  XIcon,
  GlobeIcon,
} from "lucide-react"

import { streamMessage } from "@/lib/api"
import { displayChatTitle } from "@/lib/chat-title"
import {
  useChat,
  useMessages,
  useSystemHealth,
  useDocuments,
  useDocumentJob,
  useUpdateChat,
  useUploadChatDocument,
  qk,
} from "@/lib/queries"
import type { DocumentRead, MessageRead, StreamEvent } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { RenameChatDialog } from "@/components/rename-chat-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { DocumentPicker } from "@/components/document-picker"
import { Markdown } from "@/components/markdown"
import { cn } from "@/lib/utils"
import { resolveTextDirection } from "@/lib/text-direction"

/* ------------------------------------------------------------------ */
/*  Processing chip – polls job status for a single doc                */
/* ------------------------------------------------------------------ */

function ProcessingChip({
  doc,
  onDetach,
}: {
  doc: DocumentRead
  onDetach: () => void
}) {
  const t = useTranslations("chat")
  const isProcessing = doc.status === "PENDING" || doc.status === "PROCESSING"
  const isFailed = doc.status === "FAILED"

  // Poll the job while the doc is still being ingested
  useDocumentJob(doc.id, isProcessing)

  return (
    <Badge
      variant="outline"
      className={cn(
        "group flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-normal",
        isFailed && "border-destructive/50 text-destructive",
        isProcessing && "border-amber-400/50 text-amber-600 dark:text-amber-400"
      )}
    >
      <FileTextIcon className="size-2.5 shrink-0" />
      <span className="max-w-[120px] truncate">{doc.filename}</span>
      {isProcessing && (
        <Loader2Icon className="size-2.5 shrink-0 animate-spin" />
      )}
      <button
        onClick={onDetach}
        className="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={t("detachDocument")}
      >
        <XIcon className="size-2.5" />
      </button>
    </Badge>
  )
}

/* ------------------------------------------------------------------ */
/*  Citation list                                                       */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Chat bubble                                                         */
/* ------------------------------------------------------------------ */

function Bubble({
  role,
  children,
  citations,
  language,
}: {
  role: "user" | "assistant"
  children: React.ReactNode
  citations?: MessageRead["citations"] | StreamingState["citations"]
  language?: string | null
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
          {isUser ? (
            <div
              dir={resolveTextDirection(language)}
              lang={language ?? undefined}
              className="text-start wrap-break-word whitespace-pre-wrap"
            >
              {children}
            </div>
          ) : (
            <Markdown
              dir={
                resolveTextDirection(language) as
                  | "ltr"
                  | "rtl"
                  | "auto"
                  | undefined
              }
            >
              {typeof children === "string" ? children : ""}
            </Markdown>
          )}
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

/* ------------------------------------------------------------------ */
/*  Chat page                                                           */
/* ------------------------------------------------------------------ */

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const t = useTranslations("chat")
  const tc = useTranslations("common")
  const te = useTranslations("errors")

  const queryClient = useQueryClient()
  const { data: chatData } = useChat(id)
  const { data: messagesData, isPending: messagesLoading } = useMessages(id)
  const { data: healthData } = useSystemHealth()
  const { data: allDocuments } = useDocuments()

  const updateChatMutation = useUpdateChat()
  const uploadChatDocMutation = useUploadChatDocument(id)

  const [input, setInput] = React.useState("")
  const [streaming, setStreaming] = React.useState<StreamingState | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [attachOpen, setAttachOpen] = React.useState(false)
  const uploadRef = React.useRef<HTMLInputElement>(null)
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Derive picker selection directly from server data; no effect needed.
  // The popover always opens with the current chat scope pre-checked.
  const derivedPickerSelected = chatData?.document_ids ?? []
  const [pickerOverride, setPickerOverride] = React.useState<string[] | null>(
    null
  )
  const pickerSelected = pickerOverride ?? derivedPickerSelected

  const modelComponent = healthData?.components.find((c) => c.key === "model")
  const llmReady = modelComponent ? modelComponent.status === "up" : true

  // Build the list of attached document objects for chips
  const attachedDocs: DocumentRead[] = React.useMemo(() => {
    if (!chatData?.document_ids.length || !allDocuments) return []
    return chatData.document_ids
      .map((docId) => allDocuments.find((d) => d.id === docId))
      .filter((d): d is DocumentRead => Boolean(d))
  }, [chatData, allDocuments])

  const isScoped = (chatData?.document_ids.length ?? 0) > 0

  /* ---- scrolling ---- */
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

  /* ---- textarea auto-resize ---- */
  const adjustTextarea = React.useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  React.useEffect(() => {
    adjustTextarea()
  }, [input, adjustTextarea])

  /* ---- attach existing documents ---- */
  const saveAttach = async () => {
    try {
      await updateChatMutation.mutateAsync({
        id,
        body: { document_ids: pickerSelected },
      })
      toast.success(t("attachSaved"))
      setPickerOverride(null) // Let server state drive again
      setAttachOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("deleteFailed"))
    }
  }

  const detachDoc = async (docId: string) => {
    const newIds = (chatData?.document_ids ?? []).filter((d) => d !== docId)
    try {
      await updateChatMutation.mutateAsync({
        id,
        body: { document_ids: newIds },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("deleteFailed"))
    }
  }

  /* ---- upload new file to this chat ---- */
  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf") {
        toast.error(te("notPdf", { filename: file.name }))
        continue
      }
      try {
        await uploadChatDocMutation.mutateAsync(file)
        toast.success(t("attachedUploaded", { filename: file.name }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : te("uploadFailed"))
      }
    }
    if (uploadRef.current) uploadRef.current.value = ""
  }

  /* ---- send chat message ---- */
  const send = async () => {
    const content = input.trim()
    if (!content || busy) return
    setInput("")
    setBusy(true)
    setStreaming({ text: "", citations: [] })

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
      await queryClient.invalidateQueries({ queryKey: qk.messages(id) })
      await queryClient.invalidateQueries({ queryKey: qk.chat(id) })
      await queryClient.invalidateQueries({ queryKey: qk.chats })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("sendMessageFailed"))
      await queryClient.invalidateQueries({ queryKey: qk.messages(id) })
    } finally {
      setStreaming(null)
      setBusy(false)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }

  const initialLoading = messagesLoading && !messagesData
  const hasMessages = (messagesData?.length ?? 0) > 0 || streaming

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ---- Header ---- */}
      <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-2.5 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
            <BotIcon className="size-3.5 text-muted-foreground" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm leading-tight font-medium">
                {displayChatTitle(chatData?.title, tc("untitledChat"))}
              </h1>
              {/* Scope indicator */}
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {isScoped ? (
                  t("scopeScoped", { count: chatData!.document_ids.length })
                ) : (
                  <>
                    <GlobeIcon className="size-2.5" />
                    {t("scopeGlobal")}
                  </>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              onClick={() => setRenameOpen(true)}
              aria-label={t("renameChat")}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* ---- Attached docs row ---- */}
        <div className="flex flex-wrap items-center gap-1.5">
          {attachedDocs.map((doc) => (
            <ProcessingChip
              key={doc.id}
              doc={doc}
              onDetach={() => void detachDoc(doc.id)}
            />
          ))}

          {/* Attach existing */}
          <Popover open={attachOpen} onOpenChange={setAttachOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 rounded-md px-2 text-[11px] font-normal"
              >
                <PaperclipIcon className="size-2.5" />
                {t("attachDocuments")}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t("attachedDocuments")}
              </p>
              <DocumentPicker
                documents={allDocuments ?? []}
                selected={pickerSelected}
                onChange={setPickerOverride}
              />
              <Button
                size="sm"
                className="mt-3 w-full"
                onClick={() => void saveAttach()}
                disabled={updateChatMutation.isPending}
              >
                {updateChatMutation.isPending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : null}
                {tc("save")}
              </Button>
            </PopoverContent>
          </Popover>

          {/* Upload new file */}
          <input
            ref={uploadRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => void handleUpload(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 rounded-md px-2 text-[11px] font-normal"
            disabled={uploadChatDocMutation.isPending}
            onClick={() => uploadRef.current?.click()}
          >
            {uploadChatDocMutation.isPending ? (
              <Loader2Icon className="size-2.5 animate-spin" />
            ) : (
              <UploadCloudIcon className="size-2.5" />
            )}
            {t("uploadToChat")}
          </Button>
        </div>
      </div>

      <RenameChatDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        chatId={id}
        currentTitle={chatData?.title}
      />

      {!llmReady && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground lg:px-6">
          <Loader2Icon className="size-3 animate-spin" />
          {t("modelLoading")}
        </div>
      )}

      {/* ---- Message list ---- */}
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
                <Bubble
                  key={m.id}
                  role={m.role}
                  language={m.language}
                  citations={m.citations}
                >
                  {m.content}
                </Bubble>
              ))}
              {streaming && (
                <Bubble
                  role="assistant"
                  language={null}
                  citations={streaming.citations}
                >
                  {streaming.text || <TypingIndicator />}
                </Bubble>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* ---- Input bar ---- */}
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
