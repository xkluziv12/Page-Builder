import { useState } from "react";
import { useListPrompts, type Prompt, type Brand } from "@workspace/api-client-react";
import { BRAND_OPTIONS } from "../lib/brands";

function CopyButton({ prompt }: { prompt: Prompt }) {
  const [copied, setCopied] = useState(false);
  const content = prompt.publishedContent;
  const disabled = content == null || content === "";

  const copy = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className={`pm-copy-btn${copied ? " copied" : ""}`}
      onClick={copy}
      disabled={disabled}
    >
      <i className={copied ? "fas fa-check" : "fas fa-copy"} />
      {copied ? "Copied!" : `Copy ${prompt.name}`}
    </button>
  );
}

export default function PromptLibrary() {
  const [brand, setBrand] = useState<Brand>("sts");
  const { data, isLoading, isError, error } = useListPrompts({ brand });

  const prompts = data ?? [];

  return (
    <div className="pm-page">
      <div className="pm-header">
        <div>
          <h1 className="pm-title">Prompt Library</h1>
          <p className="pm-subtitle">
            Copy the latest published master prompt, then paste it into Claude.
          </p>
        </div>
      </div>

      <div className="pm-brand-tabs">
        {BRAND_OPTIONS.map((b) => (
          <button
            type="button"
            key={b.value}
            className={`pm-brand-tab${brand === b.value ? " active" : ""}`}
            onClick={() => setBrand(b.value)}
          >
            {b.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="pm-muted">Loading prompts…</p>}
      {isError && (
        <p className="pm-error">
          Could not load prompts: {error instanceof Error ? error.message : "Unknown error"}
        </p>
      )}

      {!isLoading && !isError && prompts.length === 0 && (
        <p className="pm-muted">No prompts for this brand yet.</p>
      )}

      <div className="pm-card-grid">
        {prompts.map((prompt) => (
          <div key={prompt.id} className="pm-card">
            <div className="pm-card-head">
              <div>
                <h3 className="pm-card-title">{prompt.name}</h3>
                <span className="pm-meta">
                  {prompt.publishedContent != null
                    ? `v${prompt.publishedVersion ?? prompt.version}`
                    : "Not published yet"}
                  {prompt.publishedContent != null && prompt.lastPublishedAt
                    ? ` · ${new Date(prompt.lastPublishedAt).toLocaleDateString()}`
                    : ""}
                </span>
              </div>
              <CopyButton prompt={prompt} />
            </div>
            <pre className="pm-preview">
              {prompt.publishedContent ??
                "This prompt has not been published yet."}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
