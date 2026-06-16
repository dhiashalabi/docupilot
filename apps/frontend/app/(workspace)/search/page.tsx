"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  SearchIcon,
  Loader2Icon,
  FileTextIcon,
  SparklesIcon,
  FilterIcon,
  XIcon,
} from "lucide-react";

import { api } from "@/lib/api";
import { useDocuments } from "@/lib/hooks";
import { DocumentPicker } from "@/components/document-picker";
import type { SearchHit } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Kbd } from "@/components/ui/kbd";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Key findings and conclusions",
  "Financial data and metrics",
  "Project timeline and milestones",
];

export default function SearchPage() {
  const docs = useDocuments();
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [hits, setHits] = React.useState<SearchHit[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const results = await api.search({
        query: query.trim(),
        document_ids: selected,
      });
      setHits(results);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-4 py-5 lg:px-6">
      <PageHeader
        className="mb-5"
        title="Search"
        description="Find relevant content across all your documents with semantic search."
      />

      {/* ── Search bar ── */}
      <div className="mb-4 space-y-3">
        <InputGroup className="h-12 rounded-xl shadow-sm">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            placeholder="Search across your documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void run()}
          />
          <InputGroupAddon align="inline-end">
            {!query && <Kbd>↵</Kbd>}
            <InputGroupButton
              size="icon-sm"
              variant={showFilters ? "secondary" : "ghost"}
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Toggle filters"
            >
              <FilterIcon />
            </InputGroupButton>
            <InputGroupButton
              variant="default"
              size="sm"
              className="h-8 px-4"
              onClick={() => void run()}
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SearchIcon className="size-3.5" />
              )}
              Search
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        {/* Filter panel */}
        {showFilters && (
          <Card className="animate-in fade-in slide-in-from-top-1 gap-3 p-3.5 duration-200">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-medium">
                Filter by document
              </p>
              {selected.length > 0 && (
                <button
                  onClick={() => setSelected([])}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                >
                  <XIcon className="size-3" />
                  Clear
                </button>
              )}
            </div>
            <DocumentPicker
              documents={docs.data ?? []}
              selected={selected}
              onChange={setSelected}
            />
          </Card>
        )}

        {/* Active filters */}
        {selected.length > 0 && !showFilters && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Filtering:</span>
            <Badge variant="secondary" className="gap-1 text-xs">
              <FilterIcon className="size-3" />
              {selected.length} document{selected.length !== 1 ? "s" : ""}
            </Badge>
            <button
              onClick={() => setSelected([])}
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="gap-2 p-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-7 rounded-md" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </Card>
            ))}
          </div>
        ) : hits === null ? (
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SparklesIcon />
              </EmptyMedia>
              <EmptyTitle>Semantic search</EmptyTitle>
              <EmptyDescription>
                Type a question or description above. The AI will find the most
                relevant passages in your documents.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Badge
                    key={suggestion}
                    variant="outline"
                    className="hover:bg-accent hover:text-foreground cursor-pointer px-3 py-1 font-normal"
                    onClick={() => {
                      setQuery(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </Badge>
                ))}
              </div>
            </EmptyContent>
          </Empty>
        ) : !hits.length ? (
          <Empty className="py-20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>No matches found</EmptyTitle>
              <EmptyDescription>
                Try rephrasing your query or adjusting the filters.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2">
            <div className="mb-3">
              <Badge variant="secondary" className="text-xs">
                {hits.length} result{hits.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            {hits.map((hit) => (
              <Card
                key={hit.chunk_id}
                className="gap-2 p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <div className="bg-muted flex size-7 items-center justify-center rounded-md">
                    <FileTextIcon className="text-muted-foreground size-3.5" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {hit.filename}
                  </span>
                  {hit.page_from && (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[11px] font-normal"
                    >
                      Page {hit.page_from}
                    </Badge>
                  )}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Progress
                      value={Math.round(hit.score * 100)}
                      className={cn("h-1.5 w-12")}
                    />
                    <span className="text-muted-foreground text-[11px] font-medium tabular-nums">
                      {(hit.score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed">
                  {hit.content}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
