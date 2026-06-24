"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import {
  SparklesIcon,
  FileDownIcon,
  FileOutputIcon,
  Wand2Icon,
  CopyIcon,
  CheckIcon,
  EyeIcon,
  PencilIcon,
} from "lucide-react"

import { api } from "@/lib/api"
import { useDocuments, useSummarize, useGeneratePdf } from "@/lib/queries"
import { DocumentPicker } from "@/components/document-picker"
import { Markdown } from "@/components/markdown"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export default function GeneratePage() {
  const t = useTranslations("generate")
  const tc = useTranslations("common")
  const te = useTranslations("errors")
  const tt = useTranslations("toasts")

  const { data: documents } = useDocuments()
  const summarizeMutation = useSummarize()
  const generatePdfMutation = useGeneratePdf()

  const [selected, setSelected] = React.useState<string[]>([])
  const [instruction, setInstruction] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [markdown, setMarkdown] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [view, setView] = React.useState<"edit" | "preview">("edit")
  const [activeTab, setActiveTab] = React.useState("summarize")

  const summarizing = summarizeMutation.isPending
  const generating = generatePdfMutation.isPending

  const summarize = async () => {
    if (!selected.length) {
      toast.error(t("selectDocument"))
      return
    }
    try {
      const { summary } = await summarizeMutation.mutateAsync({
        document_ids: selected,
        instruction: instruction.trim() || undefined,
      })
      setMarkdown(summary)
      if (!title) setTitle(t("defaultSummaryTitle"))
      toast.success(tt("summaryGenerated"))
      setActiveTab("export")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("summaryFailed"))
    }
  }

  const generate = async () => {
    if (!title.trim() || !markdown.trim()) {
      toast.error(t("titleContentRequired"))
      return
    }
    try {
      const record = await generatePdfMutation.mutateAsync({
        title: title.trim(),
        markdown,
      })
      toast.success(tt("pdfGenerated"))
      window.open(api.downloadPdfUrl(record.id), "_blank")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("pdfGenerationFailed"))
    }
  }

  const copyMarkdown = async () => {
    if (!markdown.trim()) return
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(te("copyFailed"))
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5 lg:px-6">
      <PageHeader
        className="mb-5"
        title={t("title")}
        description={t("description")}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="summarize" className="flex items-center gap-2">
            <Wand2Icon className="size-4" />
            {t("summarize")}
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <FileOutputIcon className="size-4" />
            {t("export")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summarize" className="mt-0">
          <Card className="gap-6 p-5 sm:p-6">
            <FieldGroup className="gap-6">
              <Field>
                <FieldLabel>{t("sourceDocuments")}</FieldLabel>
                <FieldDescription>{t("sourceDocumentsDesc")}</FieldDescription>
                <DocumentPicker
                  documents={documents ?? []}
                  selected={selected}
                  onChange={setSelected}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="instruction">
                  {t("instructions")}
                </FieldLabel>
                <FieldDescription>{t("instructionsDesc")}</FieldDescription>
                <Input
                  id="instruction"
                  placeholder={t("instructionPlaceholder")}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
              </Field>
            </FieldGroup>

            <div>
              <Button
                onClick={() => void summarize()}
                disabled={summarizing || selected.length === 0}
                className="gap-2"
              >
                {summarizing ? (
                  <Spinner />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                {summarizing ? t("generatingSummary") : t("generateSummary")}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="mt-0 flex flex-1 flex-col">
          <Card className="gap-5 p-5 sm:p-6">
            <Field>
              <FieldLabel htmlFor="title">{t("titleLabel")}</FieldLabel>
              <Input
                id="title"
                placeholder={t("titlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="markdown">{t("contentLabel")}</FieldLabel>
                <div className="flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5"
                        disabled={!markdown.trim()}
                        onClick={() => void copyMarkdown()}
                      >
                        {copied ? (
                          <CheckIcon className="size-3.5 text-emerald-500" />
                        ) : (
                          <CopyIcon className="size-3.5" />
                        )}
                        {tc("copy")}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("copyTooltip")}</TooltipContent>
                  </Tooltip>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={view}
                    onValueChange={(v) => v && setView(v as "edit" | "preview")}
                    variant="outline"
                  >
                    <ToggleGroupItem
                      value="edit"
                      aria-label={t("edit")}
                      className="h-7 px-2"
                    >
                      <PencilIcon className="size-3.5" />
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="preview"
                      aria-label={t("preview")}
                      className="h-7 px-2"
                    >
                      <EyeIcon className="size-3.5" />
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
              {view === "edit" ? (
                <Textarea
                  id="markdown"
                  placeholder={t("contentPlaceholder")}
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  className="min-h-[350px] resize-y font-mono text-sm leading-relaxed"
                />
              ) : (
                <div className="min-h-[350px] overflow-y-auto rounded-lg border bg-muted/30 p-4">
                  {markdown.trim() ? (
                    <Markdown>{markdown}</Markdown>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("nothingToPreview")}
                    </p>
                  )}
                </div>
              )}
            </Field>

            <div className="flex justify-end">
              <Button
                onClick={() => void generate()}
                disabled={generating || !markdown.trim() || !title.trim()}
                className="gap-2"
              >
                {generating ? <Spinner /> : <FileDownIcon className="size-4" />}
                {generating ? t("exporting") : t("downloadPdf")}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
