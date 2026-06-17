"use client";

import * as React from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Trash2Icon,
  UploadCloudIcon,
  FileTextIcon,
  Loader2Icon,
  FileIcon,
  HardDriveIcon,
  MoreVerticalIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
} from "lucide-react";

import {
  useDocuments,
  useDocumentJob,
  useUploadDocument,
  useReingestDocument,
  useDeleteDocument,
} from "@/lib/queries";
import type { DocumentRead } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { StatusDot } from "@/components/status-dot";
import { PageHeader } from "@/components/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_DOT: Record<DocumentRead["status"], "up" | "degraded" | "down"> = {
  READY: "up",
  PROCESSING: "degraded",
  PENDING: "degraded",
  FAILED: "down",
};

function StatusBadge({ status }: { status: DocumentRead["status"] }) {
  const t = useTranslations("documents");
  const labels: Record<DocumentRead["status"], string> = {
    READY: t("statusReady"),
    PROCESSING: t("statusProcessing"),
    PENDING: t("statusPending"),
    FAILED: t("statusFailed"),
  };

  return (
    <Badge variant="outline" className="gap-1.5 font-medium">
      <StatusDot status={STATUS_DOT[status]} className="size-2" />
      {labels[status]}
    </Badge>
  );
}

function JobProgress({ documentId }: { documentId: string }) {
  const { data: job } = useDocumentJob(documentId);
  const progress = job?.progress ?? 0;
  return (
    <div className="mt-2 flex items-center gap-2">
      <Progress value={progress} className="h-1.5" />
      <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
        {progress}%
      </span>
    </div>
  );
}

function DocumentCard({
  doc,
  onReingest,
  onDelete,
}: {
  doc: DocumentRead;
  onReingest: (doc: DocumentRead) => void;
  onDelete: (doc: DocumentRead) => void;
}) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");

  return (
    <Card className="flex-row items-center gap-3.5 px-4 py-3 transition-shadow hover:shadow-sm">
      <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        <FileTextIcon className="text-muted-foreground size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{doc.filename}</p>
        <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span>{formatSize(doc.size_bytes)}</span>
          {doc.page_count && (
            <>
              <span className="text-border">·</span>
              <span>{tc("pagesCount", { count: doc.page_count })}</span>
            </>
          )}
          {doc.language && (
            <>
              <span className="text-border">·</span>
              <span>{doc.language.toUpperCase()}</span>
            </>
          )}
          <span className="text-border">·</span>
          <span>{formatDate(doc.created_at)}</span>
        </div>
        {doc.status === "FAILED" && doc.error && (
          <p className="text-destructive mt-1 truncate text-xs">{doc.error}</p>
        )}
        {(doc.status === "PROCESSING" || doc.status === "PENDING") && (
          <JobProgress documentId={doc.id} />
        )}
      </div>

      <StatusBadge status={doc.status} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 shrink-0"
            aria-label={t("documentActions")}
          >
            <MoreVerticalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => onReingest(doc)}
            disabled={doc.status === "PROCESSING" || doc.status === "PENDING"}
          >
            <RefreshCwIcon className="size-4" />
            {t("reingest")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(doc)}>
            <Trash2Icon className="size-4" />
            {tc("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}

export default function DocumentsPage() {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const tt = useTranslations("toasts");

  const { data, isPending, isError, error, refetch } = useDocuments({ poll: true });
  const uploadMutation = useUploadDocument();
  const reingestMutation = useReingestDocument();
  const deleteMutation = useDeleteDocument();

  const [dragOver, setDragOver] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<DocumentRead | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const uploading = uploadMutation.isPending;

  const upload = React.useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      for (const file of Array.from(files)) {
        if (file.type !== "application/pdf") {
          toast.error(te("notPdf", { filename: file.name }));
          continue;
        }
        try {
          await uploadMutation.mutateAsync(file);
          toast.success(tt("uploaded", { filename: file.name }));
        } catch (e) {
          toast.error(e instanceof Error ? e.message : te("uploadFailed"));
        }
      }
    },
    [uploadMutation, te, tt],
  );

  const reingest = async (doc: DocumentRead) => {
    try {
      await reingestMutation.mutateAsync(doc.id);
      toast.success(tt("reingesting", { filename: doc.filename }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("reingestFailed"));
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const doc = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteMutation.mutateAsync(doc.id);
      toast.success(tt("deletedDocument", { filename: doc.filename }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : te("deleteFailed"));
    }
  };

  const readyCount = data?.filter((d) => d.status === "READY").length ?? 0;
  const totalCount = data?.length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 lg:px-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          totalCount > 0 ? (
            <>
              <Badge variant="secondary" className="gap-1.5">
                <FileIcon className="size-3.5" />
                {t("totalBadge", { count: totalCount })}
              </Badge>
              <Badge variant="secondary" className="gap-1.5">
                <CheckCircle2Icon className="size-3.5 text-emerald-500" />
                {t("readyBadge", { count: readyCount })}
              </Badge>
            </>
          ) : undefined
        }
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={cn(
          "relative overflow-hidden rounded-xl border-2 border-dashed transition-all duration-300",
          dragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-muted-foreground/30",
        )}
      >
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-10">
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-2xl transition-colors duration-300",
              dragOver ? "bg-primary/15" : "bg-muted",
            )}
          >
            <UploadCloudIcon
              className={cn(
                "size-7 transition-colors duration-300",
                dragOver ? "text-primary" : "text-muted-foreground",
              )}
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">
              {dragOver ? t("dropHere") : t("dragDrop")}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">{t("browseHint")}</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => void upload(e.target.files)}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            variant="outline"
            className="gap-2"
          >
            {uploading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UploadCloudIcon className="size-4" />
            )}
            {t("browseFiles")}
          </Button>
        </div>
      </div>

      {isPending && !data ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="flex-row items-center gap-3.5 px-4 py-3">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircleIcon className="text-destructive" />
            </EmptyMedia>
            <EmptyTitle>{t("loadErrorTitle")}</EmptyTitle>
            <EmptyDescription>{error?.message}</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCwIcon className="size-4" />
            {tc("retry")}
          </Button>
        </Empty>
      ) : !data?.length ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HardDriveIcon />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-2">
          {data.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onReingest={reingest}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", {
                filename: pendingDelete?.filename ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
