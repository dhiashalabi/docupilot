"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import {
  SearchIcon,
  Loader2Icon,
  FileTextIcon,
  SparklesIcon,
  FilterIcon,
  XIcon,
} from "lucide-react"

import { useDocuments, useSearch } from "@/lib/queries"
import { DocumentPicker } from "@/components/document-picker"
import type { SearchHit } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Kbd } from "@/components/ui/kbd"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { PageHeader } from "@/components/page-header"
import { cn } from "@/lib/utils"

export default function SearchPage() {
  const t = useTranslations("search")
  const tc = useTranslations("common")
  const te = useTranslations("errors")

  const { data: documents } = useDocuments()
  const searchMutation = useSearch()

  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState<string[]>([])
  const [hits, setHits] = React.useState<SearchHit[] | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  // Monotonic counter to discard responses from superseded requests.
  const searchIdRef = React.useRef(0)

  const loading = searchMutation.isPending

  const suggestions = [t("suggestion1"), t("suggestion2"), t("suggestion3")]

  const run = async () => {
    if (!query.trim()) return
    const searchId = ++searchIdRef.current
    setHits(null) // clear stale results immediately
    try {
      const results = await searchMutation.mutateAsync({
        query: query.trim(),
        document_ids: selected,
      })
      // Ignore if a newer search has been started since.
      if (searchId === searchIdRef.current) {
        setHits(results)
      }
    } catch (e) {
      if (searchId === searchIdRef.current) {
        toast.error(e instanceof Error ? e.message : te("searchFailed"))
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-4 py-5 lg:px-6">
      <PageHeader
        className="mb-5"
        title={t("title")}
        description={t("description")}
      />

      <div className="mb-4 space-y-3">
        <InputGroup className="h-12 rounded-xl shadow-sm">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            placeholder={t("placeholder")}
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
              aria-label={t("toggleFilters")}
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
              {t("searchButton")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        {showFilters && (
          <Card className="animate-in gap-3 p-3.5 duration-200 fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {t("filterByDocument")}
              </p>
              {selected.length > 0 && (
                <button
                  onClick={() => setSelected([])}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <XIcon className="size-3" />
                  {tc("clear")}
                </button>
              )}
            </div>
            <DocumentPicker
              documents={documents ?? []}
              selected={selected}
              onChange={setSelected}
            />
          </Card>
        )}

        {selected.length > 0 && !showFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("filtering")}
            </span>
            <Badge variant="secondary" className="gap-1 text-xs">
              <FilterIcon className="size-3" />
              {tc("documentCount", { count: selected.length })}
            </Badge>
            <button
              onClick={() => setSelected([])}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {tc("clear")}
            </button>
          </div>
        )}
      </div>

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
              <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <Badge
                    key={suggestion}
                    variant="outline"
                    className="cursor-pointer px-3 py-1 font-normal hover:bg-accent hover:text-foreground"
                    onClick={() => {
                      setQuery(suggestion)
                      inputRef.current?.focus()
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
              <EmptyTitle>{t("noMatchesTitle")}</EmptyTitle>
              <EmptyDescription>{t("noMatchesDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2">
            <div className="mb-3">
              <Badge variant="secondary" className="text-xs">
                {tc("resultCount", { count: hits.length })}
              </Badge>
            </div>
            {hits.map((hit) => (
              <Card
                key={hit.chunk_id}
                className="gap-2 p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-muted">
                    <FileTextIcon className="size-3.5 text-muted-foreground" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {hit.filename}
                  </span>
                  {hit.page_from && (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[11px] font-normal"
                    >
                      {tc("page", { page: hit.page_from })}
                    </Badge>
                  )}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Progress
                      value={Math.round(hit.score * 100)}
                      className={cn("h-1.5 w-12")}
                    />
                    <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                      {(hit.score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                  {hit.content}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
