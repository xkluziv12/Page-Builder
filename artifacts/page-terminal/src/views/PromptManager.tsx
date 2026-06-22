import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPrompts,
  useUpdatePrompt,
  usePublishPrompt,
  getListPromptsQueryKey,
  type Prompt,
  type Brand,
  type PublishResult,
} from "@workspace/api-client-react";
import { BRAND_OPTIONS } from "../lib/brands";
import {
  getAdminToken,
  setAdminToken,
  clearAdminToken,
} from "../lib/adminToken";

function TokenGate({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="pm-page">
      <div className="pm-gate">
        <h1 className="pm-title">Admin access</h1>
        <p className="pm-subtitle">
          Enter the admin token to edit and publish prompts.
        </p>
        <input
          type="password"
          className="pm-input"
          placeholder="Admin token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="pm-btn pm-btn-primary"
          disabled={!value.trim()}
          onClick={() => {
            setAdminToken(value.trim());
            onSaved();
          }}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: { ok: boolean; detail: string; reference?: string | null };
}) {
  return (
    <div className={`pm-status-row${status.ok ? " ok" : " fail"}`}>
      <i className={status.ok ? "fas fa-check-circle" : "fas fa-times-circle"} />
      <strong>{label}:</strong>
      <span>{status.detail}</span>
      {status.reference && <code className="pm-ref">{status.reference}</code>}
    </div>
  );
}

export default function PromptManager() {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => Boolean(getAdminToken()));
  const [brand, setBrand] = useState<Brand>("sts");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useListPrompts();

  const prompts = useMemo(() => data ?? [], [data]);
  const brandPrompts = useMemo(
    () => prompts.filter((p) => p.brand === brand),
    [prompts, brand],
  );

  const selected: Prompt | undefined = useMemo(
    () => prompts.find((p) => p.id === selectedId),
    [prompts, selectedId],
  );

  // Keep a valid selection within the active brand.
  useEffect(() => {
    if (brandPrompts.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!brandPrompts.some((p) => p.id === selectedId)) {
      setSelectedId(brandPrompts[0].id);
    }
  }, [brandPrompts, selectedId]);

  // Load draft when selection changes (only if not editing).
  useEffect(() => {
    if (selected && !dirty) {
      setDraft(selected.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListPromptsQueryKey() });

  const updateMutation = useUpdatePrompt({
    mutation: {
      onSuccess: () => {
        setDirty(false);
        setActionError(null);
        invalidate();
      },
      onError: (e) =>
        setActionError(e instanceof Error ? e.message : "Save failed."),
    },
  });

  const publishMutation = usePublishPrompt({
    mutation: {
      onSuccess: (result) => {
        setPublishResult(result);
        setDirty(false);
        setActionError(null);
        invalidate();
      },
      onError: (e) =>
        setActionError(e instanceof Error ? e.message : "Publish failed."),
    },
  });

  const busy = updateMutation.isPending || publishMutation.isPending;

  if (!hasToken) {
    return <TokenGate onSaved={() => setHasToken(true)} />;
  }

  return (
    <div className="pm-page">
      <div className="pm-header">
        <div>
          <h1 className="pm-title">Prompt Manager</h1>
          <p className="pm-subtitle">
            Edit a master prompt and publish it to the database and Google Drive
            in one click.
          </p>
        </div>
        <button
          type="button"
          className="pm-btn pm-btn-ghost"
          onClick={() => {
            clearAdminToken();
            setHasToken(false);
          }}
        >
          <i className="fas fa-sign-out-alt" /> Lock
        </button>
      </div>

      <div className="pm-brand-tabs">
        {BRAND_OPTIONS.map((b) => (
          <button
            type="button"
            key={b.value}
            className={`pm-brand-tab${brand === b.value ? " active" : ""}`}
            onClick={() => {
              setBrand(b.value);
              setPublishResult(null);
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="pm-muted">Loading prompts…</p>}
      {isError && (
        <p className="pm-error">
          Could not load prompts:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      )}

      {!isLoading && !isError && (
        <div className="pm-editor-layout">
          <aside className="pm-sidebar">
            {brandPrompts.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`pm-sidebar-item${p.id === selectedId ? " active" : ""}`}
                onClick={() => {
                  setSelectedId(p.id);
                  setDirty(false);
                  setPublishResult(null);
                }}
              >
                <span>{p.name}</span>
                <span className="pm-meta">
                  {p.version > 0 ? `v${p.version}` : "draft"}
                </span>
              </button>
            ))}
            {brandPrompts.length === 0 && (
              <p className="pm-muted">No prompts for this brand.</p>
            )}
          </aside>

          <section className="pm-editor">
            {selected ? (
              <>
                <div className="pm-editor-head">
                  <div>
                    <h2 className="pm-card-title">{selected.name}</h2>
                    <span className="pm-meta">
                      {selected.version > 0
                        ? `Published v${selected.version}`
                        : "Not published yet"}
                      {selected.lastPublishedAt
                        ? ` · ${new Date(selected.lastPublishedAt).toLocaleString()}`
                        : ""}
                    </span>
                  </div>
                  <code className="pm-ref">{selected.gitPath}</code>
                </div>

                <textarea
                  className="pm-textarea"
                  value={draft}
                  spellCheck={false}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setDirty(true);
                  }}
                />

                <div className="pm-actions">
                  <button
                    type="button"
                    className="pm-btn pm-btn-ghost"
                    disabled={busy || !dirty}
                    onClick={() =>
                      updateMutation.mutate({
                        id: selected.id,
                        data: { content: draft },
                      })
                    }
                  >
                    {updateMutation.isPending ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    className="pm-btn pm-btn-primary"
                    disabled={busy}
                    onClick={() => {
                      setPublishResult(null);
                      publishMutation.mutate({
                        id: selected.id,
                        data: { content: draft },
                      });
                    }}
                  >
                    {publishMutation.isPending ? (
                      "Publishing…"
                    ) : (
                      <>
                        <i className="fas fa-cloud-upload-alt" /> Publish
                      </>
                    )}
                  </button>
                </div>

                {actionError && <p className="pm-error">{actionError}</p>}

                {publishResult && (
                  <div className="pm-status-panel">
                    <h4>
                      Published v{publishResult.prompt.version} — per-target
                      status
                    </h4>
                    <StatusRow label="Google Drive" status={publishResult.drive} />
                    {!publishResult.drive.ok && (
                      <p className="pm-muted">
                        The database copy is saved. Fix the failing target and
                        click Publish again to retry it.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="pm-muted">Select a prompt to edit.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
