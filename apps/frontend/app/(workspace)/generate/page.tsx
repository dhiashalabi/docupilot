"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  SparklesIcon,
  FileDownIcon,
  FileOutputIcon,
  Wand2Icon,
  CopyIcon,
  CheckIcon,
  EyeIcon,
  PencilIcon,
} from "lucide-react";

import { api } from "@/lib/api";
import { useDocuments } from "@/lib/hooks";
import { DocumentPicker } from "@/components/document-picker";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function GeneratePage() {
  const docs = useDocuments();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [instruction, setInstruction] = React.useState("");
  const [summarizing, setSummarizing] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [markdown, setMarkdown] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [view, setView] = React.useState<"edit" | "preview">("edit");

  const [activeTab, setActiveTab] = React.useState("summarize");

  const summarize = async () => {
    if (!selected.length) {
      toast.error("Select at least one document");
      return;
    }
    setSummarizing(true);
    try {
      const { summary } = await api.summarize({
        document_ids: selected,
        instruction: instruction.trim() || undefined,
      });
      setMarkdown(summary);
      if (!title) setTitle("Document Summary");
      toast.success("Summary generated successfully");
      setActiveTab("export");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Summary failed");
    } finally {
      setSummarizing(false);
    }
  };

  const generate = async () => {
    if (!title.trim() || !markdown.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setGenerating(true);
    try {
      const record = await api.generatePdf({ title: title.trim(), markdown });
      toast.success("PDF generated");
      window.open(api.downloadPdfUrl(record.id), "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const copyMarkdown = async () => {
    if (!markdown.trim()) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5 lg:px-6">
      <PageHeader
        className="mb-5"
        title="Generate"
        description="Extract insights from your documents or build custom PDF reports."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="summarize" className="flex items-center gap-2">
            <Wand2Icon className="size-4" />
            Summarize
          </TabsTrigger>
          <TabsTrigger value="export" className="flex items-center gap-2">
            <FileOutputIcon className="size-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summarize" className="mt-0">
          <Card className="gap-6 p-5 sm:p-6">
            <FieldGroup className="gap-6">
              <Field>
                <FieldLabel>Source documents</FieldLabel>
                <FieldDescription>
                  Select the PDFs you want to summarize.
                </FieldDescription>
                <DocumentPicker
                  documents={docs.data ?? []}
                  selected={selected}
                  onChange={setSelected}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="instruction">Instructions</FieldLabel>
                <FieldDescription>
                  Optional context on what to focus the summary on.
                </FieldDescription>
                <Input
                  id="instruction"
                  placeholder="e.g. 'Focus on financial metrics' (optional)"
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
                {summarizing ? "Generating summary…" : "Generate summary"}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="mt-0 flex flex-1 flex-col">
          <Card className="gap-5 p-5 sm:p-6">
            <Field>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                placeholder="e.g. Q3 Financial Summary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="markdown">Content (Markdown)</FieldLabel>
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
                        Copy
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy markdown to clipboard</TooltipContent>
                  </Tooltip>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={view}
                    onValueChange={(v) => v && setView(v as "edit" | "preview")}
                    variant="outline"
                  >
                    <ToggleGroupItem value="edit" aria-label="Edit" className="h-7 px-2">
                      <PencilIcon className="size-3.5" />
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="preview"
                      aria-label="Preview"
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
                  placeholder="Write your content here, or generate a summary first…"
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  className="min-h-[350px] resize-y font-mono text-sm leading-relaxed"
                />
              ) : (
                <div className="bg-muted/30 min-h-[350px] overflow-y-auto rounded-lg border p-4">
                  {markdown.trim() ? (
                    <pre className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word font-sans">
                      {markdown}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Nothing to preview yet.
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
                {generating ? "Exporting…" : "Download PDF"}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
