/**
 * Centralized query-key factory.
 *
 * Keeps cache invalidation calls consistent across the codebase.
 * Every array is `as const` so TypeScript narrows the tuple type.
 */

export const qk = {
  // Documents
  documents: ["documents"] as const,
  document: (id: string) => ["documents", id] as const,
  documentJob: (id: string) => ["documents", id, "job"] as const,

  // Chats
  chats: ["chats"] as const,
  chat: (id: string) => ["chats", id] as const,

  // Messages
  messages: (chatId: string) => ["chats", chatId, "messages"] as const,

  // Health
  systemHealth: ["health", "system"] as const,

  // Generated PDFs
  pdfs: ["pdfs"] as const,
} as const;
