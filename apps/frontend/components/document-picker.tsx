"use client";

import * as React from "react";
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

/** A compact multi-select list of READY documents. */
export function DocumentPicker({ documents, selected, onChange }: Props) {
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
    return (
      <p className="text-muted-foreground text-xs">
        No processed documents yet. Upload and wait for processing to finish.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/40 flex items-center justify-between gap-2 border-b px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium">
            {ready.length} document{ready.length !== 1 ? "s" : ""}
          </span>
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
              {selected.length} selected
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
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={clear}
            disabled={selected.length === 0}
          >
            Clear
          </Button>
        </div>
      </div>
      <ScrollArea className="max-h-44">
        <ul className="divide-y">
          {ready.map((doc) => {
            const active = selected.includes(doc.id);
            return (
              <li key={doc.id}>
                <label className="hover:bg-accent/50 flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left transition-colors">
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
