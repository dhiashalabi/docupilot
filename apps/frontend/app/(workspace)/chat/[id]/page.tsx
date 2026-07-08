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
  CopyIcon,
  CheckIcon,
  AlertCircleIcon,
  RefreshCwIcon,
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
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  Message,
  MessageGroup,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"

/* ------------------------------------------------------------------ */
/*  Processing chip – polls job status and refreshes doc list on done  */
/* ------------------------------------------------------------------ */

function ProcessingChip({
  doc,
  onDetach,
}: {
  doc: DocumentRead
  onDetach: () => void
}) {
  const t = useTranslations("chat")
  const queryClient = useQueryClient()
  const isProcessing = doc.status === "PENDING" || doc.status === "PROCESSING"
  const isFailed = doc.status === "FAILED"

  const { data: job } = useDocumentJob(doc.id, isProcessing)

  // When a job reaches a terminal state, refresh the documents list so the
  // chip status updates without requiring a manual reload.
  React.useEffect(() => {
    if (job?.status === "READY" || job?.status === "FAILED") {
      void queryClient.invalidateQueries({ queryKey: qk.documents })
    }
  }, [job?.status, queryClient])

  const state: "processing" | "error" | "done" = isFailed
    ? "error"
    : isProcessing
      ? "processing"
      : "done"

  return (
    <Attachment size="xs" state={state} className="group/chip">
      <AttachmentMedia>
        {isProcessing ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : (
          <FileTextIcon />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle className="max-w-[140px]">
          {doc.filename}
        </AttachmentTitle>
      </AttachmentContent>
      <AttachmentActions className="pe-1">
        <AttachmentAction
          type="button"
          onClick={onDetach}
          aria-label={t("detachDocument")}
          className="opacity-0 transition-opacity group-hover/chip:opacity-100 focus-visible:opacity-100"
        >
          <XIcon className="size-3" />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
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
            key={`${i}-${"document_id" in c ? c.document_id : i}`}
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
/*  Chat message                                                        */
/* ------------------------------------------------------------------ */

function ChatMessage({
  role,
  children,
  citations,
  language,
  isLoading,
}: {
  role: "user" | "assistant"
  children: React.ReactNode
  citations?: MessageRead["citations"] | StreamingState["citations"]
  language?: string | null
  isLoading?: boolean
}) {
  const isUser = role === "user"
  const te = useTranslations("errors")
  const [copied, setCopied] = React.useState(false)

  const handleCopy = () => {
    const text = typeof children === "string" ? children : ""
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        toast.error(te("copyFailed"))
      })
  }

  return (
    <Message align={isUser ? "end" : "start"}>
      <MessageAvatar
        className={cn(
          "mt-0.5 size-7",
          isUser ? "bg-primary text-primary-foreground" : "border bg-card"
        )}
      >
        {isUser ? (
          <UserIcon className="size-3.5" />
        ) : (
          <BotIcon className="size-3.5" />
        )}
      </MessageAvatar>
      <MessageContent>
        <Bubble
          variant={isUser ? "default" : "muted"}
          align={isUser ? "end" : "start"}
        >
          <BubbleContent
            className={cn(
              "leading-normal",
              isUser ? "rounded-tr-md" : "rounded-tl-md"
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
            ) : isLoading ? (
              <TypingIndicator />
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
          </BubbleContent>
        </Bubble>
        {citations ? <CitationList citations={citations} /> : null}
        {!isLoading && (
          <MessageFooter
            className={cn(
              "px-0",
              isUser &&
                "opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100"
            )}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              aria-label="Copy message"
            >
              {copied ? (
                <CheckIcon className="size-3" />
              ) : (
                <CopyIcon className="size-3" />
              )}
            </Button>
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  )
}

function TypingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Assistant is typing"
      className="flex items-center gap-1 px-1 py-1"
    >
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
  const { data: chatData, isError: chatError } = useChat(id)
  const {
    data: messagesData,
    isPending: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useMessages(id)
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
  // AbortController for the active stream — aborted on unmount or new send.
  const abortRef = React.useRef<AbortController | null>(null)

  // Abort any in-flight stream when the component unmounts.
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // Derive picker selection directly from server data; no effect needed.
  const derivedPickerSelected = chatData?.document_ids ?? []
  const [pickerOverride, setPickerOverride] = React.useState<string[] | null>(
    null
  )
  const pickerSelected = pickerOverride ?? derivedPickerSelected

  const modelComponent = healthData?.components.find((c) => c.key === "model")
  const llmReady = modelComponent ? modelComponent.status === "up" : true

  // Build the list of attached document objects for chips.
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

  /* ---- textarea auto-resize (cap at 5 rows, then internal scroll) ---- */
  const adjustTextarea = React.useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const cs = window.getComputedStyle(el)
    const lineHeight = parseFloat(cs.lineHeight) || 20
    const paddingY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    const borderY =
      (parseFloat(cs.borderTopWidth) || 0) +
      (parseFloat(cs.borderBottomWidth) || 0)
    const maxHeight = lineHeight * 5 + paddingY + borderY
    el.style.height = "auto"
    const next = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
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
      setPickerOverride(null)
      setAttachOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("updateFailed"))
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
      toast.error(e instanceof Error ? e.message : te("updateFailed"))
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

    // Cancel any previous in-flight stream.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

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

    let streamedText = ""
    let doneData: Extract<StreamEvent, { type: "done" }> | null = null

    try {
      await streamMessage(
        id,
        content,
        (event: StreamEvent) => {
          if (event.type === "token") {
            streamedText += event.text
            setStreaming({ text: streamedText, citations: [] })
          } else if (event.type === "done") {
            doneData = event
            setStreaming({ text: streamedText, citations: event.citations })
          } else if (event.type === "error") {
            toast.error(event.detail)
          }
        },
        controller.signal
      )

      if (doneData) {
        const d = doneData as Extract<StreamEvent, { type: "done" }>
        const assistantMsg: MessageRead = {
          id: d.message_id,
          role: "assistant",
          content: streamedText,
          language: null,
          citations: d.citations.map((c) => ({
            document_id: c.document_id,
            chunk_id: null,
            filename: c.filename,
            page_from: c.page_from,
            page_to: c.page_to,
            score: c.score,
          })),
          created_at: new Date().toISOString(),
        }
        queryClient.setQueryData<MessageRead[]>(qk.messages(id), (prev) => [
          ...(prev ?? []),
          assistantMsg,
        ])
      }
      setStreaming(null)
      void queryClient.invalidateQueries({ queryKey: qk.messages(id) })
      void queryClient.invalidateQueries({ queryKey: qk.chat(id) })
      void queryClient.invalidateQueries({ queryKey: qk.chats })
    } catch (e) {
      // Ignore abort errors — user navigated away or sent a new message.
      if ((e as Error).name === "AbortError") return
      toast.error(e instanceof Error ? e.message : te("sendMessageFailed"))
      // Roll back the optimistic user message so the UI is consistent.
      queryClient.setQueryData<MessageRead[]>(qk.messages(id), (prev) =>
        (prev ?? []).filter((m) => m.id !== optimisticMessage.id)
      )
      await queryClient.invalidateQueries({ queryKey: qk.messages(id) })
    } finally {
      if (!controller.signal.aborted) {
        abortRef.current = null
        setStreaming(null)
        setBusy(false)
        setTimeout(() => textareaRef.current?.focus(), 0)
      }
    }
  }

  const inputDisabled = busy || !llmReady
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
          {attachedDocs.length > 0 && (
            <AttachmentGroup className="max-w-full flex-1">
              {attachedDocs.map((doc) => (
                <ProcessingChip
                  key={doc.id}
                  doc={doc}
                  onDetach={() => void detachDoc(doc.id)}
                />
              ))}
            </AttachmentGroup>
          )}

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
        <Marker
          variant="border"
          className="shrink-0 bg-muted/40 px-4 py-2 text-[11px] lg:px-6"
        >
          <MarkerIcon>
            <Loader2Icon className="size-3 animate-spin" />
          </MarkerIcon>
          <MarkerContent>{t("modelLoading")}</MarkerContent>
        </Marker>
      )}

      {/* ---- Message list ---- */}
      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 lg:px-6">
          {initialLoading ? (
            <MessageGroup className="gap-3">
              {[0, 1, 2].map((i) => (
                <Message key={i} align={i % 2 === 0 ? "start" : "end"}>
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <MessageContent>
                    <Skeleton
                      className={cn(
                        "h-16 rounded-2xl",
                        i % 2 === 0 ? "w-3/5" : "w-2/5 self-end"
                      )}
                    />
                  </MessageContent>
                </Message>
              ))}
            </MessageGroup>
          ) : messagesError || chatError ? (
            <Empty className="py-20">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertCircleIcon className="text-destructive" />
                </EmptyMedia>
                <EmptyTitle>{te("loadFailed")}</EmptyTitle>
                <EmptyDescription>{te("sendMessageFailed")}</EmptyDescription>
              </EmptyHeader>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refetchMessages()}
              >
                <RefreshCwIcon className="size-4" />
                {tc("retry")}
              </Button>
            </Empty>
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
            <MessageGroup className="gap-3">
              {messagesData?.map((m) => (
                <ChatMessage
                  key={m.id}
                  role={m.role}
                  language={m.language}
                  citations={m.citations}
                >
                  {m.content}
                </ChatMessage>
              ))}
              {streaming && (
                <ChatMessage
                  role="assistant"
                  language={null}
                  citations={streaming.citations}
                  isLoading={!streaming.text}
                >
                  {streaming.text}
                </ChatMessage>
              )}
            </MessageGroup>
          )}
        </div>
      </ScrollArea>

      {/* ---- Input bar ---- */}
      <div className="shrink-0 border-t bg-background/80 px-4 py-3 backdrop-blur-sm lg:px-6">
        <div className="mx-auto w-full max-w-2xl">
          <InputGroup className="rounded-2xl bg-muted/30">
            <InputGroupTextarea
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
              disabled={inputDisabled}
              className="min-h-[44px] px-3.5 py-3 text-sm leading-relaxed [field-sizing:fixed]"
            />
            <InputGroupAddon align="block-end" className="gap-2">
              <InputGroupText className="text-[10px] text-muted-foreground/60">
                <Kbd>↵</Kbd> {t("sendHint")}
                <span aria-hidden>·</span>
                <Kbd>⇧</Kbd>
                <Kbd>↵</Kbd> {t("newLineHint")}
              </InputGroupText>
              <InputGroupButton
                type="button"
                variant="default"
                size="icon-sm"
                onClick={() => void send()}
                disabled={inputDisabled || !input.trim()}
                aria-label={t("sendHint")}
                className="ms-auto rounded-full"
              >
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SendIcon className="size-4 rtl:rotate-180" />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </div>
    </div>
  )
}
