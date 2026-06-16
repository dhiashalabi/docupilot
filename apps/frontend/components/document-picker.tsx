"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { FileTextIcon } from "lucide-react";

import type { DocumentRead } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  documents: DocumentRead[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function DocumentPicker({ documents, selected, onChange }: Props) {
  const t = useTranslations("documentPicker");
  const tc = useTranslations("common");
  const ready = documents.filter((d) => d.status === "READY");

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    );
  };

  const allSelected = ready.length > 0 && selected.length >= ready.length;

  const selectAll = () => onChange(ready.map((d) => d.id));
  const clear = () => onChange([]);

  if (!ready.length) {
    return <p className="text-muted-foreground text-xs">{t("empty")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/40 flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">
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
        <ul className="divide-y">
          {ready.map((doc) => {
            const active = selected.includes(doc.id);
            return (
              <li key={doc.id}>
                <label className="hover:bg-accent/50 flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-start transition-colors">
                  <Checkbox
                    checked={active}
                    onCheckedChange={() => toggle(doc.id)}
                  />
                  <FileTextIcon className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="truncate text-xs">{doc.filename}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
