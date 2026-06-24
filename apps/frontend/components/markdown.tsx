"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

import { cn } from "@/lib/utils"

/**
 * Safe, styled markdown renderer for AI-generated content.
 *
 * - No rehype-raw so raw HTML from the LLM is never executed.
 * - Styled with @tailwindcss/typography `prose` adjusted to match the
 *   shadcn design tokens (CSS variables, dark mode, RTL).
 * - Links open in a new tab with rel="noreferrer noopener".
 * - Code blocks use the monospace font variable.
 */

/** Allow only safe URL schemes. Strips anything else to block javascript: XSS. */
function sanitizeHref(href: string | undefined): string | undefined {
  if (!href) return href
  const lower = href.trimStart().toLowerCase()
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("/") ||
    lower.startsWith("#")
  ) {
    return href
  }
  return undefined
}

const components: Components = {
  // Links: sanitize href then open externally with safe rel.
  a({ href, children, ...props }) {
    const safeHref = sanitizeHref(href)
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline underline-offset-2 hover:opacity-80"
        {...props}
      >
        {children}
      </a>
    )
  },
  // Inline code
  code({ children, className, ...props }) {
    const isBlock = className?.includes("language-")
    if (isBlock) {
      return (
        <code
          className={cn(
            "block w-full overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.8em] text-foreground",
            className
          )}
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        {...props}
      >
        {children}
      </code>
    )
  },
  // Code block wrapper — strip the extra <pre> padding prose adds
  pre({ children, ...props }) {
    return (
      <pre
        className="not-prose my-2 overflow-hidden rounded-md bg-muted"
        {...props}
      >
        {children}
      </pre>
    )
  },
  // Tables: make them scroll horizontally on small screens
  table({ children, ...props }) {
    return (
      <div className="my-2 w-full overflow-x-auto rounded-md border">
        <table className="w-full text-sm" {...props}>
          {children}
        </table>
      </div>
    )
  },
  th({ children, ...props }) {
    return (
      <th
        className="border-b bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
        {...props}
      >
        {children}
      </th>
    )
  },
  td({ children, ...props }) {
    return (
      <td
        className="border-b px-3 py-2 align-top text-sm last:border-b-0"
        {...props}
      >
        {children}
      </td>
    )
  },
  // Blockquote
  blockquote({ children, ...props }) {
    return (
      <blockquote
        className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
        {...props}
      >
        {children}
      </blockquote>
    )
  },
}

interface MarkdownProps {
  children: string
  className?: string
  /** Optional dir attribute for RTL content */
  dir?: "ltr" | "rtl" | "auto"
}

export function Markdown({ children, className, dir }: MarkdownProps) {
  return (
    <div
      dir={dir}
      className={cn(
        // Base prose — no max-width so it fills the bubble
        "prose prose-sm max-w-none dark:prose-invert",
        // Align with shadcn tokens
        "prose-headings:font-semibold prose-headings:text-foreground",
        "prose-p:leading-relaxed prose-p:text-foreground",
        "prose-li:text-foreground",
        "prose-strong:font-semibold prose-strong:text-foreground",
        "prose-em:text-foreground",
        "prose-hr:border-border",
        // Tighter spacing inside chat bubbles
        "prose-headings:my-1 prose-p:my-1 prose-ol:my-1 prose-ul:my-1 prose-li:my-0",
        // Prevent prose from adding unwanted backgrounds on code that we style manually
        "prose-code:before:content-none prose-code:after:content-none",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
