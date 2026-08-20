export const MARK_BLOG_LOG_WEBHOOK =
  "https://stsrecycling.app.n8n.cloud/webhook/mark-blog-log";

export interface BlogLogEntry {
  city: string;
  state: string;
  blogTopic?: string | null;
  title?: string | null;
  url?: string | null;
  status: string;
  engine: string;
}

/**
 * Log an STS blog publish/build event to the existing n8n `mark-blog-log`
 * webhook. Throws on a non-OK response so a logging failure is surfaced to the
 * caller (the orchestrator records it without rolling back an already-atomic
 * Joomla publish).
 */
export async function logBlogEntry(entry: BlogLogEntry): Promise<void> {
  const res = await fetch(MARK_BLOG_LOG_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: "STS Electronic Recycling",
      ...entry,
      loggedAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Blog log webhook failed (${res.status} ${res.statusText}): ${body.slice(0, 300)}`,
    );
  }
}
