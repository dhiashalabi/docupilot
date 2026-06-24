"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  MessageSquareTextIcon,
  FilesIcon,
  SearchIcon,
  FileOutputIcon,
  CheckCircle2Icon,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TABS = [
  { value: "chat", icon: MessageSquareTextIcon },
  { value: "documents", icon: FilesIcon },
  { value: "search", icon: SearchIcon },
  { value: "generate", icon: FileOutputIcon },
] as const

export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const t = useTranslations("help")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="chat" className="mt-1">
          <TabsList className="grid w-full grid-cols-4">
            {TABS.map(({ value, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-1.5">
                <Icon className="size-3.5 shrink-0" />
                <span>{t(`${value}.label`)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map(({ value }) => (
            <TabsContent key={value} value={value} className="mt-4 space-y-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t(`${value}.description`)}
              </p>
              <ul className="space-y-2">
                {(["tip1", "tip2", "tip3", "tip4"] as const).map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-sm">
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{t(`${value}.${tip}`)}</span>
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
