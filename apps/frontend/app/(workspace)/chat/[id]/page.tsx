"use client";

import * as React from "react";
import { use } from "react";
import { toast } from "sonner";
import { SendIcon, Loader2Icon, FileTextIcon, BotIcon, UserIcon } from "lucide-react";

import { streamMessage } from "@/lib/api";
import { useChat, useMessages, useSystemHealth } from "@/lib/hooks";
import type { MessageRead, StreamEvent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface StreamingState {
  text: string;
  citations: Array<{ n: number; filename: string; page_from: number | null }>;
}

/* ── Citation pills ── */
function CitationList({
  citations,
}: {
  citations: MessageRead["citations"] | StreamingState["citations"];
}) {
  if (!citations.length) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {citations.map((c, i) => {
        const page = "page_from" in c ? c.page_from : null;
        const label =
          "filename" in c && c.filename ? c.filename : `Source ${i + 1}`;
        return (
          <Badge
            key={i}
            variant="outline"
            className="border-border/60 bg-background/50 text-muted-foreground gap-1 rounded-md px-2 py-0.5 text-[11px] font-normal backdrop-blur"
          >
            <FileTextIcon className="size-2.5" />
            {label}
            {page ? ` · p.${page}` : ""}
          </Badge>
        );
      })}
    </div>
  );
}

/* ── Message bubble ── */
function Bubble({
  role,
  children,
  citations,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
  citations?: MessageRead["citations"] | StreamingState["citations"];
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <Avatar className="mt-0.5 size-7 shrink-0">
        <AvatarFallback
          className={cn(
            isUser ? "bg-primary text-primary-foreground" : "bg-card border"
          )}
        >
          {isUser ? (
            <UserIcon className="size-3.5" />
          ) : (
            <BotIcon className="size-3.5" />
          )}
        </AvatarFallback>
      </Avatar>
      <div className={cn("max-w-[75%] space-y-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-md"
              : "bg-muted rounded-tl-md"
          )}
        >
          <div className="whitespace-pre-wrap wrap-break-word">{children}</div>
        </div>
        {citations ? <CitationList citations={citations} /> : null}
      </div>
    </div>
  );
}

/* ── Typing indicator ── */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/40 size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const chat = useChat(id);
  const messages = useMessages(id);
  const health = useSystemHealth();
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState<StreamingState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const modelComponent = health.data?.components.find((c) => c.key === "model");
  const llmReady = modelComponent ? modelComponent.status === "up" : true;

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      viewportRef.current?.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [messages.data, streaming, scrollToBottom]);

  const adjustTextarea = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  React.useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    setInput("");
    setBusy(true);
    setStreaming({ text: "", citations: [] });

    messages.setData([
      ...(messages.data ?? []),
      {
        id: `tmp-${Date.now()}`,
        role: "user",
        content,
        language: null,
        citations: [],
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      await streamMessage(id, content, (event: StreamEvent) => {
        if (event.type === "token") {
          setStreaming((s) => (s ? { ...s, text: s.text + event.text } : s));
        } else if (event.type === "done") {
          setStreaming((s) => (s ? { ...s, citations: event.citations } : s));
        } else if (event.type === "error") {
          toast.error(event.detail);
        }
      });
      await messages.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setStreaming(null);
      setBusy(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const initialLoading = messages.loading && !messages.data;
  const hasMessages = (messages.data?.length ?? 0) > 0 || streaming;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Chat header ── */}
      <div className="flex items-center gap-3 border-b px-4 py-2.5 lg:px-6">
        <div className="bg-muted flex size-7 items-center justify-center rounded-lg">
          <BotIcon className="text-muted-foreground size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium leading-tight">
            {chat.data?.title || "New Chat"}
          </h1>
          <p className="text-muted-foreground text-[11px]">
            {chat.data?.document_ids.length ?? 0} document
            {(chat.data?.document_ids.length ?? 0) !== 1 ? "s" : ""} in context
          </p>
        </div>
      </div>

      {/* ── Model loading notice ── */}
      {!llmReady && (
        <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 border-b px-4 py-2 text-[11px] lg:px-6">
          <Loader2Icon className="size-3 animate-spin" />
          The local model is still loading — answers may be unavailable until it is
          ready.
        </div>
      )}

      {/* ── Messages area ── */}
      <ScrollArea className="flex-1" viewportRef={viewportRef}>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-4 lg:px-6">
          {initialLoading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3",
                    i % 2 === 0 ? "flex-row" : "flex-row-reverse"
                  )}
                >
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <Skeleton
                    className={cn("h-16 rounded-2xl", i % 2 === 0 ? "w-3/5" : "w-2/5")}
                  />
                </div>
              ))}
            </>
          ) : !hasMessages ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
              <div className="bg-primary/10 flex size-12 items-center justify-center rounded-2xl">
                <BotIcon className="text-primary size-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">How can I help you?</p>
                <p className="text-muted-foreground mt-1 max-w-sm text-xs leading-relaxed">
                  Ask questions about your documents. Answers include source
                  citations for verification.
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages.data?.map((m) => (
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

      {/* ── Input area ── */}
      <div className="bg-background/80 border-t px-4 py-3 backdrop-blur-sm lg:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
          <div className="bg-muted/30 focus-within:border-ring focus-within:ring-ring/20 flex flex-1 items-end rounded-xl border transition-colors focus-within:ring-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Ask anything about your documents…"
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
              <SendIcon className="size-4" />
            )}
          </Button>
        </div>
        <p className="text-muted-foreground/60 mx-auto mt-1.5 flex max-w-2xl items-center justify-center gap-1.5 text-[10px]">
          <Kbd>↵</Kbd> to send
          <span>·</span>
          <Kbd>⇧</Kbd>
          <Kbd>↵</Kbd> for new line
        </p>
      </div>
    </div>
  );
}
