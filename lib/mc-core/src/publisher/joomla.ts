import type { JoomlaMeta } from "../types";

export interface PublishInput {
  title: string;
  html: string;
  schema: string;
  meta: JoomlaMeta;
}

export interface PublishResult {
  published: boolean;
  url: string | null;
  articleId: string | null;
  message: string;
}

/**
 * The publishing seam. Publishing must be ATOMIC: title, HTML, and schema all
 * land together or nothing does. Implementations should treat a missing piece
 * as a hard failure.
 */
export interface JoomlaPublisher {
  readonly name: string;
  publish(input: PublishInput): Promise<PublishResult>;
}

/** Reject a publish payload that is missing any of the three atomic artifacts. */
function assertAllArtifacts(input: PublishInput): void {
  const missing: string[] = [];
  if (!input.title?.trim()) missing.push("title");
  if (!input.html?.trim()) missing.push("html");
  if (!input.schema?.trim()) missing.push("schema");
  if (missing.length > 0) {
    throw new Error(
      `Atomic publish aborted — missing required artifact(s): ${missing.join(", ")}.`,
    );
  }
}

/**
 * Stub publisher that enforces the atomic contract (all three artifacts present)
 * without making a network call. Used as an explicit fallback when no Joomla
 * helper endpoint is configured; it fails loudly when an artifact is missing so a
 * half-built page can never be "published".
 */
export class StubJoomlaPublisher implements JoomlaPublisher {
  readonly name = "joomla-stub";

  async publish(input: PublishInput): Promise<PublishResult> {
    assertAllArtifacts(input);
    return {
      published: false,
      url: input.meta.alias ? `/${input.meta.alias}` : null,
      articleId: null,
      message:
        "Validated atomic publish payload (title + HTML + schema), but no Joomla helper endpoint is configured (set JOOMLA_PUBLISH_URL). Nothing was published.",
    };
  }
}

export interface HttpJoomlaPublisherConfig {
  /** URL of the Joomla helper endpoint that performs the atomic write. */
  endpoint: string;
  /** Optional bearer token for the helper endpoint. */
  token?: string;
  /** Injectable fetch (defaults to global fetch) for testability. */
  fetchImpl?: typeof fetch;
}

/**
 * Real Joomla publisher. Posts all three fields (body HTML, JSON-LD schema for
 * the head, and SEO meta) to a helper endpoint in a SINGLE request and treats
 * the operation as ATOMIC: it only reports success when the helper confirms that
 * every field was written. Any transport error, non-OK status, non-JSON body, or
 * partial-write acknowledgement is a hard failure so a half-published page can
 * never be reported as live. New pages publish UNPUBLISHED by default; a human
 * flips them live as a reviewed step.
 */
export class HttpJoomlaPublisher implements JoomlaPublisher {
  readonly name = "joomla-http";

  constructor(private readonly config: HttpJoomlaPublisherConfig) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    assertAllArtifacts(input);
    const doFetch = this.config.fetchImpl ?? fetch;
    const res = await doFetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.token
          ? { Authorization: `Bearer ${this.config.token}` }
          : {}),
      },
      body: JSON.stringify({
        title: input.title,
        body: input.html,
        schema: input.schema,
        meta: {
          title: input.meta.title,
          description: input.meta.description,
          keywords: input.meta.keywords,
        },
        alias: input.meta.alias ?? null,
        published: false,
        atomic: true,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Joomla publish failed (${res.status} ${res.statusText}): ${text.slice(0, 500)}`,
      );
    }

    let data: Record<string, unknown>;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new Error(
        `Joomla helper returned a non-JSON response; cannot confirm an atomic write: ${text.slice(0, 200)}`,
      );
    }

    const wrote = (data.wrote ?? {}) as Record<string, unknown>;
    const confirmed =
      data.ok === true || (Boolean(wrote.body) && Boolean(wrote.schema) && Boolean(wrote.meta));
    if (!confirmed) {
      throw new Error(
        `Joomla publish did not confirm an atomic write of all three fields (body + schema + meta): ${text.slice(0, 300)}`,
      );
    }

    return {
      published: true,
      url:
        (typeof data.url === "string" ? data.url : null) ??
        (input.meta.alias ? `/${input.meta.alias}` : null),
      articleId: data.articleId != null ? String(data.articleId) : null,
      message:
        "Published atomically to Joomla (body HTML + head schema + SEO meta). Created UNPUBLISHED pending human approval.",
    };
  }
}

/**
 * Select a publisher from the environment. Returns the real HTTP publisher when a
 * helper endpoint is configured, otherwise the explicit stub fallback.
 */
export function createJoomlaPublisher(
  env: { endpoint?: string | null; token?: string | null } = {},
): JoomlaPublisher {
  if (env.endpoint && env.endpoint.trim()) {
    return new HttpJoomlaPublisher({
      endpoint: env.endpoint.trim(),
      token: env.token?.trim() || undefined,
    });
  }
  return new StubJoomlaPublisher();
}
