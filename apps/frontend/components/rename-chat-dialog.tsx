"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { useUpdateChat } from "@/lib/queries"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function RenameChatForm({
  chatId,
  currentTitle,
  onClose,
}: {
  chatId: string
  currentTitle: string | null | undefined
  onClose: () => void
}) {
  const t = useTranslations("chat")
  const tc = useTranslations("common")
  const te = useTranslations("errors")
  const updateChat = useUpdateChat()
  const [draft, setDraft] = React.useState(() => currentTitle?.trim() ?? "")

  const trimmed = draft.trim()
  const canSave = trimmed.length > 0 && !updateChat.isPending

  const save = async () => {
    if (!canSave) return
    try {
      await updateChat.mutateAsync({
        id: chatId,
        body: { title: trimmed },
      })
      toast.success(t("renameChatSuccess"))
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("renameChatFailed"))
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("renameChat")}</DialogTitle>
        <DialogDescription>{t("renameChatDescription")}</DialogDescription>
      </DialogHeader>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("chatTitlePlaceholder")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSave) {
            e.preventDefault()
            void save()
          }
        }}
        autoFocus
      />
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button onClick={() => void save()} disabled={!canSave}>
          {tc("save")}
        </Button>
      </DialogFooter>
    </>
  )
}

export function RenameChatDialog({
  open,
  onOpenChange,
  chatId,
  currentTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  chatId: string
  currentTitle: string | null | undefined
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open ? (
          <RenameChatForm
            key={chatId}
            chatId={chatId}
            currentTitle={currentTitle}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
