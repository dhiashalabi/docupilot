"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { FileTextIcon } from "lucide-react"

import type { DocumentRead } from "@/lib/types"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"

interface Props {
  documents: DocumentRead[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export function DocumentPicker({ documents, selected, onChange }: Props) {
  const t = useTranslations("documentPicker")
  const tc = useTranslations("common")
  const ready = documents.filter((d) => d.status === "READY")

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    )
  }

  const allSelected = ready.length > 0 && selected.length >= ready.length

  const selectAll = () => onChange(ready.map((d) => d.id))
  const clear = () => onChange([])

  if (!ready.length) {
    return <p className="text-xs text-muted-foreground">{t("empty")}</p>
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {tc("documentCount", { count: ready.length })}
          </span>
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
              {tc("selectedCount", { count: selected.length })}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={selectAll}
            disabled={allSelected}
          >
            {t("selectAll")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={clear}
            disabled={selected.length === 0}
          >
            {tc("clear")}
          </Button>
        </div>
      </div>
      <ScrollArea className="max-h-44">
        <ul className="flex flex-col gap-1 p-1">
          {ready.map((doc) => {
            const active = selected.includes(doc.id)
            return (
              <li key={doc.id}>
                <Attachment
                  size="xs"
                  state="done"
                  className="w-full max-w-none border-transparent"
                >
                  <AttachmentTrigger
                    type="button"
                    onClick={() => toggle(doc.id)}
                    aria-pressed={active}
                    aria-label={doc.filename}
                  />
                  <AttachmentMedia>
                    <FileTextIcon />
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle className="text-xs font-normal">
                      {doc.filename}
                    </AttachmentTitle>
                  </AttachmentContent>
                  <AttachmentActions className="pe-1.5">
                    <Checkbox
                      checked={active}
                      onCheckedChange={() => toggle(doc.id)}
                      aria-label={doc.filename}
                    />
                  </AttachmentActions>
                </Attachment>
              </li>
            )
          })}
        </ul>
      </ScrollArea>
    </div>
  )
}
