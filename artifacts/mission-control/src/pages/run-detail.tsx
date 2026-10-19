import { useState, useRef } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRun,
  useRunPhase,
  useApprovePhase,
  useRunCheckers,
  useChatEdit,
  useGetChatHistory,
  useDeleteRun,
  useOverrideLinkAudit,
  useRevokeLinkAuditOverride,
  useGetQcResults,
  useRunQc,
  useSaveRunHtml,
  useGetPhasePrompt,
  useRunReplitPhase,
  getGetRunQueryKey,
  getGetChatHistoryQueryKey,
  getGetQcResultsQueryKey,
  getGetPhasePromptQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Play,
  Check,
  Loader2,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  ShieldCheck,
  Link2,
  ShieldAlert,
  Gauge,
  History,
  Copy,
  Monitor,
  Tablet,
  Smartphone,
  ChevronDown,
  ExternalLink,
  Rocket,
  MessageSquare,
  Pencil,
  Save,
  X,
  Upload,
  ClipboardPaste,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PreviewMode = "desktop" | "tablet" | "mobile";
const PREVIEW_WIDTH: Record<PreviewMode, string> = {
  desktop: "100%",
  tablet: "820px",
  mobile: "390px",
};

type Phase = "research" | "build" | "audit" | "schema" | "publish";
const PHASES: Phase[] = ["research", "build", "audit", "schema", "publish"];

/**
 * Display-time safeguard for the Live Preview. Mirrors the server's engine
 * extractor: pages built before the engine fix have the model's full report
 * (gate checklist, deltas, Joomla META) stored in front of the actual HTML, so
 * the raw value would render that text on top of the page. Prefer a fenced code
 * block, else slice from <!doctype>/<html>, else fall back to the raw value.
 */
function extractPreviewHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  const fence = raw.match(/```[a-z]*[ \t]*\r?\n?([\s\S]*?)```/i);
  if (fence && fence[1] && fence[1].trim()) return fence[1].trim();
  const docStart = raw.search(/<!doctype html|<html[\s>]/i);
  if (docStart !== -1) {
    const closeIdx = raw.toLowerCase().lastIndexOf("</html>");
    const end = closeIdx !== -1 ? closeIdx + "</html>".length : raw.length;
    return raw.slice(docStart, end).trim();
  }
  return raw.trim();
}

/**
 * Local shape of PhaseState.provenance / .attempts. Declared locally rather
 * than imported from the generated client, which reflects openapi.yaml as of
 * the last `pnpm run codegen` run in lib/api-spec and may lag this schema
 * addition until that's re-run.
 */
interface PhaseProvenance {
  sourceKind?: string | null;
  provider?: string | null;
  model?: string | null;
  candidate?: string;
  attempt?: number | null;
  fallback?: boolean;
  fallbackReason?: string | null;
}
interface PhaseAttempt {
  model: string;
  candidate: string;
  attempt: number;
  status: string;
}
interface JoomlaTemplateStyleOutcome {
  status: "applied" | "unsupported" | "not-configured";
  label?: string;
  message: string;
}

function phaseProvenance(st: unknown): PhaseProvenance | null {
  return (st as { provenance?: PhaseProvenance })?.provenance ?? null;
}
function phaseAttempts(st: unknown): PhaseAttempt[] {
  return (st as { attempts?: PhaseAttempt[] })?.attempts ?? [];
}
function phaseTemplateStyle(st: unknown): JoomlaTemplateStyleOutcome | null {
  return (st as { templateStyle?: JoomlaTemplateStyleOutcome | null })?.templateStyle ?? null;
}

const STATUS_STYLE: Record<string, string> = {
  locked: "text-muted-foreground",
  ready: "text-secondary",
  running: "text-secondary animate-pulse",
  review: "text-amber-500",
  approved: "text-green-500",
  failed: "text-destructive",
};

type PromptPhase = "build" | "audit" | "schema";
const PROMPT_STEP: Record<PromptPhase, { step: number; label: string }> = {
  build: { step: 1, label: "Build" },
  audit: { step: 2, label: "Audit" },
  schema: { step: 3, label: "Schema" },
};

/**
 * Operator-confirmed "how was this actually produced" choices for a Replit
 * submission. Mirrors the server allowlist (PROVENANCE_SOURCE_KINDS in
 * @workspace/mc-core) — kept as a local literal list rather than importing it,
 * since this artifact does not depend on mc-core directly. "unset" means the
 * operator didn't confirm anything; the server then records
 * replit-agent/operator-input rather than inventing a value.
 */
const EXECUTION_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "unset", label: "Replit Agent (default — not otherwise confirmed)" },
  { value: "direct-api", label: "Direct provider API call" },
  { value: "claude-cli", label: "Claude CLI" },
  { value: "claude-web", label: "Claude web chat" },
  { value: "n8n-webhook", label: "n8n webhook" },
  { value: "imported", label: "Imported from elsewhere" },
  { value: "unknown", label: "Unknown / not sure" },
];

/** Local shape of the optional operator-confirmed execution source payload. */
interface ExecutionSourceInput {
  sourceKind?: string;
  provider?: string;
  model?: string;
}

/**
 * The Replit-mode copy-paste workflow for the active phase. It renders the SAME
 * per-phase prompt the Dashboard sends to a model (fetched from the API), gives
 * the VA a one-click Copy, and a paste-or-upload box to submit the artifact the
 * Replit Agent produced. Submitting reuses the Replit phase endpoint, so the
 * result flows through the identical checkers/gates as a Dashboard build.
 */
function ReplitPhasePanel({
  runId,
  phase,
  onSubmitted,
}: {
  runId: number;
  phase: PromptPhase;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const { step, label } = PROMPT_STEP[phase];
  const isSchema = phase === "schema";
  const [result, setResult] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceKind, setSourceKind] = useState("unset");
  const [sourceProvider, setSourceProvider] = useState("");
  const [sourceModel, setSourceModel] = useState("");

  const { data: prompt, isLoading } = useGetPhasePrompt(runId, phase, {
    query: { queryKey: getGetPhasePromptQueryKey(runId, phase) },
  });
  const runReplitPhase = useRunReplitPhase();

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.combined);
      toast({ title: "Prompt copied", description: "Paste it into the Replit Agent chat." });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the text below and copy it manually.",
        variant: "destructive",
      });
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then((t) => setResult(t));
    e.target.value = "";
  };

  const handleSubmit = () => {
    const text = result.trim();
    if (!text) {
      toast({
        title: isSchema ? "Paste the JSON-LD first" : "Paste the page HTML first",
        description: `Bring back what the Replit Agent produced for ${label}.`,
        variant: "destructive",
      });
      return;
    }
    // Only send an executionSource when the operator actually confirmed
    // something — "unset" (the default) means don't send the field at all, so
    // the server records replit-agent/operator-input rather than a guess.
    const executionSource: ExecutionSourceInput | undefined =
      sourceKind !== "unset" || sourceProvider.trim() || sourceModel.trim()
        ? {
            ...(sourceKind !== "unset" ? { sourceKind } : {}),
            ...(sourceProvider.trim() ? { provider: sourceProvider.trim() } : {}),
            ...(sourceModel.trim() ? { model: sourceModel.trim() } : {}),
          }
        : undefined;
    const payload = {
      ...(isSchema ? { schema: text } : { html: text }),
      ...(executionSource ? { executionSource } : {}),
    };
    runReplitPhase.mutate(
      // Cast: executionSource isn't in the generated ReplitPhaseInput type
      // until `pnpm run codegen` (lib/api-spec) is re-run against the updated
      // openapi.yaml; the server route validates it against its own allowlist
      // regardless of what the client's stale type declares.
      { id: runId, phase, data: payload as Parameters<typeof runReplitPhase.mutate>[0]["data"] },
      {
        onSuccess: () => {
          toast({
            title: `${label} submitted`,
            description: "Running the same checks as Dashboard mode — review the result.",
          });
          setResult("");
          onSubmitted();
        },
        onError: (err) =>
          toast({
            title: "Submit failed",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div
      className="rounded-lg border border-secondary/50 bg-secondary/10 p-3 space-y-3"
      data-testid="replit-phase-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          Step {step} — {label} in Replit
        </span>
        {prompt && (
          <Badge variant="outline" className="uppercase text-[10px]">
            {prompt.gmb ? "GMB page" : "No-GMB page"}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Keep Replit open on the side. Copy this prompt into the Replit Agent chat, let it produce the{" "}
        {isSchema ? "JSON-LD schema" : "page HTML"}, then paste the result back here.
      </p>

      {/* 1 — copy the prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Copy this into Replit
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!prompt}
            data-testid="button-copy-prompt"
          >
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
        </div>
        {isLoading ? (
          <div className="flex items-center text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Loading prompt…
          </div>
        ) : prompt ? (
          <pre className="text-[11px] leading-snug bg-background border border-border rounded-md p-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono">
            {prompt.combined}
          </pre>
        ) : (
          <p className="text-xs text-destructive">Could not load the prompt for this phase.</p>
        )}
      </div>

      {/* 2 — confirm how it was actually produced (never assumed) */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          How was this actually produced? (optional — confirm if known)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Select value={sourceKind} onValueChange={setSourceKind}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXECUTION_SOURCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={sourceProvider}
            onChange={(e) => setSourceProvider(e.target.value)}
            placeholder="Provider (e.g. Gemini, DeepSeek)"
            className="h-8 text-xs"
          />
          <Input
            value={sourceModel}
            onChange={(e) => setSourceModel(e.target.value)}
            placeholder="Model (e.g. gemini-3-flash)"
            className="h-8 text-xs"
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          E.g. "Gemini Flash via direct API" or "DeepSeek via Claude CLI". Leave blank if unsure —
          it will be recorded as Replit Agent / operator input rather than guessed.
        </p>
      </div>

      {/* 3 — paste the result back */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Paste the {isSchema ? "JSON-LD" : "page"} back here
        </span>
        <Textarea
          value={result}
          onChange={(e) => setResult(e.target.value)}
          placeholder={
            isSchema
              ? "Paste the JSON-LD the Replit Agent produced…"
              : "Paste the full page HTML the Replit Agent produced…"
          }
          className="h-28 text-[11px] font-mono resize-y"
          data-testid="textarea-replit-result"
        />
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={isSchema ? ".json,.txt,application/json" : ".html,.htm,.txt,text/html"}
            className="hidden"
            onChange={handleFile}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3 w-3 mr-1" /> Upload file
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={runReplitPhase.isPending || !result.trim()}
            data-testid="button-submit-replit"
          >
            {runReplitPhase.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <ClipboardPaste className="h-3 w-3 mr-1" /> Submit {label}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function RunDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const isValidId = Number.isInteger(id) && id > 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: run, isLoading } = useGetRun(id, {
    query: { refetchInterval: 4000, queryKey: getGetRunQueryKey(id), enabled: isValidId },
  });
  const { data: chat } = useGetChatHistory(id, {
    query: { refetchInterval: 4000, queryKey: getGetChatHistoryQueryKey(id), enabled: isValidId },
  });
  const { data: qcResults } = useGetQcResults(id, {
    query: { refetchInterval: 4000, queryKey: getGetQcResultsQueryKey(id), enabled: isValidId },
  });

  const runPhase = useRunPhase();
  const approvePhase = useApprovePhase();
  const runCheckers = useRunCheckers();
  const chatEdit = useChatEdit();
  const deleteRun = useDeleteRun();
  const overrideLinkAudit = useOverrideLinkAudit();
  const revokeLinkAuditOverride = useRevokeLinkAuditOverride();
  const runQc = useRunQc();
  const saveRunHtml = useSaveRunHtml();
  const runReplitPhase = useRunReplitPhase();

  const [message, setMessage] = useState("");
  const [overrideBy, setOverrideBy] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [quickEdit, setQuickEdit] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(id) });
  };

  const handleQc = () => {
    runQc.mutate(
      { id, data: {} },
      {
        onSuccess: (res) => {
          toast({
            title: res.passed ? "QC passed" : "QC failed",
            description: res.url,
            variant: res.passed ? "default" : "destructive",
          });
          queryClient.invalidateQueries({ queryKey: getGetQcResultsQueryKey(id) });
        },
        onError: (err) =>
          toast({
            title: "QC could not run",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading run…
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Run not found.</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const phaseState = (p: Phase) => run.phases?.find((x) => x.phase === p);
  const report = run.checkerReport;
  const isReplit = run.engine === "replit";
  const linkAudit = report?.linkAudit;
  const linkOverride = run.linkAuditOverride ?? null;
  const latestQc = qcResults && qcResults.length > 0 ? qcResults[0]! : null;
  const previewWidth = PREVIEW_WIDTH[previewMode];

  const handleRun = (p: Phase) => {
    runPhase.mutate(
      { id, phase: p },
      {
        onSuccess: () => {
          toast({ title: "Phase complete", description: `${p} finished — review the result.` });
          invalidate();
        },
        onError: (err) =>
          toast({
            title: "Phase failed",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  // Replit mode: research + publish have no copy-paste prompt — they reuse the
  // shared research provider / Joomla publisher. The VA triggers them with one
  // click here (empty body), and they flow through the same Replit phase endpoint
  // and checkers as a submitted build.
  const handleReplitAuto = (p: Phase) => {
    runReplitPhase.mutate(
      { id, phase: p, data: {} },
      {
        onSuccess: () => {
          toast({ title: "Phase complete", description: `${p} finished — review the result.` });
          invalidate();
        },
        onError: (err) =>
          toast({
            title: "Phase failed",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  const handleApprove = (p: Phase) => {
    approvePhase.mutate(
      { id, phase: p },
      {
        onSuccess: () => {
          toast({
            title: "Approved",
            description:
              p === "schema"
                ? "Publishing…"
                : p === "publish"
                  ? "Run complete."
                  : "Running the next phase…",
          });
          invalidate();
        },
        onError: (err) =>
          toast({
            title: "Approve failed",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  const handleCheck = () => {
    runCheckers.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Checkers ran" });
          invalidate();
        },
      },
    );
  };

  const handleOverride = () => {
    if (!overrideBy.trim()) {
      toast({
        title: "Name required",
        description: "Enter who is approving the override.",
        variant: "destructive",
      });
      return;
    }
    overrideLinkAudit.mutate(
      { id, data: { by: overrideBy.trim(), reason: overrideReason.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Link audit overridden", description: "Publish can now proceed." });
          setOverrideReason("");
          invalidate();
        },
        onError: (err) =>
          toast({
            title: "Override failed",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  const handleRevokeOverride = () => {
    revokeLinkAuditOverride.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Override revoked" });
          invalidate();
        },
        onError: (err) =>
          toast({
            title: "Revoke failed",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  const handleChat = () => {
    if (!message.trim()) return;
    const text = message;
    setMessage("");
    chatEdit.mutate(
      { id, data: { message: text } },
      {
        onSuccess: invalidate,
        onError: (err) =>
          toast({
            title: "Edit failed",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  const handleDelete = () => {
    deleteRun.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Run deleted" });
          window.location.href = import.meta.env.BASE_URL;
        },
      },
    );
  };

  const handleExport = async () => {
    if (!run) return;
    const lines: string[] = [];
    lines.push(`Mission Control Run #${run.id} — ${run.city}, ${run.state}`);
    lines.push(
      `Engine: ${run.engine} · Track: ${run.track} · Type: ${run.pageType} · Status: ${run.status}`,
    );
    if (run.url) lines.push(`Target URL: ${run.url}`);
    lines.push("");
    lines.push("PIPELINE");
    for (const p of PHASES) {
      const st = phaseState(p);
      lines.push(
        `  - ${p}: ${(st?.status ?? "locked").toUpperCase()}` +
          (st?.summary ? ` — ${st.summary}` : "") +
          (st?.error ? ` [error: ${st.error}]` : ""),
      );
    }
    if (report) {
      lines.push("");
      lines.push(
        `CHECKERS: ${report.passed ? "PASS" : "FAIL"} — ${report.errorCount ?? 0} error(s), ${
          report.warningCount ?? 0
        } warning(s), ${report.wordCount ?? 0} words`,
      );
    }
    if (latestQc) {
      lines.push(`POST-PUBLISH QC: ${latestQc.passed ? "PASS" : "FAIL"} — ${latestQc.url}`);
    }
    lines.push("");
    lines.push("=== CURRENT PAGE HTML ===");
    lines.push(extractPreviewHtml(run.pageHtml) || "(no HTML built yet)");
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Run status + current HTML copied to clipboard." });
    } catch {
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mc-run-${run.id}-${run.city}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Exported", description: "Clipboard unavailable — saved a snapshot file." });
    }
  };

  const enterQuickEdit = () => {
    setEditSnapshot(extractPreviewHtml(run.pageHtml));
    setQuickEdit(true);
  };

  const handleSaveHtml = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) {
      toast({
        title: "Could not read edits",
        description: "Try reopening Quick edit.",
        variant: "destructive",
      });
      return;
    }
    const edited = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    saveRunHtml.mutate(
      { id, data: { html: edited } },
      {
        onSuccess: () => {
          toast({ title: "Saved", description: "Edit saved and checks re-run." });
          setQuickEdit(false);
          invalidate();
        },
        onError: (err) =>
          toast({
            title: "Save failed",
            description: (err as { error?: string })?.error ?? "Unknown error",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild aria-label="Back to dashboard">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight truncate">
              {run.city}, {run.state}{" "}
              <span className="text-muted-foreground font-mono text-sm">#{run.id}</span>
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="uppercase">
                {run.track}
              </Badge>
              <span className="uppercase">{run.engine}</span>
              <span>·</span>
              <span>{run.pageType}</span>
              {(() => {
                const summary = (run as { provenanceSummary?: PhaseProvenance | null })
                  .provenanceSummary;
                if (!summary) {
                  return (
                    <>
                      <span>·</span>
                      <span className="italic">Not recorded</span>
                    </>
                  );
                }
                const label =
                  summary.provider && summary.model
                    ? `${summary.provider}/${summary.model}`
                    : (summary.sourceKind ?? "unknown");
                return (
                  <>
                    <span>·</span>
                    <span className="font-mono">actual: {label}</span>
                    {summary.fallback && (
                      <Badge variant="destructive" className="uppercase text-[9px] py-0">
                        Fallback
                      </Badge>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={run.status === "failed" ? "destructive" : "secondary"}
            className="uppercase"
          >
            {run.status}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Copy className="h-4 w-4 mr-1.5" /> Copy / Export
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete} title="Delete run">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </header>

      {/* Split: build copilot (left) + live preview (right) */}
      <div className="flex-1 flex flex-col xl:flex-row min-h-0">
        {/* LEFT — build copilot: pipeline folded into the chat */}
        <div className="flex flex-col w-full xl:w-[460px] xl:shrink-0 border-b xl:border-b-0 xl:border-r border-border bg-card/30 min-h-0 max-h-[55vh] xl:max-h-none">
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {isReplit && (
              <div className="rounded-md border border-secondary/40 bg-secondary/10 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Replit mode.</span> Build each
                step in the Replit Agent: copy the prompt below into Replit, paste the result
                back here, and approve each gate. Research and publish run automatically.
              </div>
            )}

            {/* Pipeline as conversational steps */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Rocket className="h-3.5 w-3.5 text-primary" /> Build pipeline
              </div>
              {PHASES.map((p) => {
                const st = phaseState(p);
                const templateStyle = p === "publish" ? phaseTemplateStyle(st) : null;
                const status = st?.status ?? "locked";
                const busy =
                  (runPhase.isPending && runPhase.variables?.phase === p) ||
                  (approvePhase.isPending && approvePhase.variables?.phase === p) ||
                  status === "running";
                // The pipeline auto-advances: creating a run auto-runs Research and
                // approving a phase auto-runs the next. "Start now" covers a phase
                // sitting ready, "Retry" is the escape hatch for a failed one — both
                // only apply to the Dashboard (Claude) auto-run path, not Replit.
                const canRun = status === "ready" && !isReplit;
                const canRetry = status === "failed" && !isReplit;
                const canApprove = status === "review";
                // Replit mode: research + publish reuse the shared provider/publisher,
                // so the VA runs them with one click here. Build/audit/schema are
                // produced via the copy-paste panel below, not from the ladder.
                const replitAutoPhase = p === "research" || p === "publish";
                const canReplitAuto =
                  isReplit && replitAutoPhase && (status === "ready" || status === "failed");
                const replitBusy =
                  runReplitPhase.isPending && runReplitPhase.variables?.phase === p;
                return (
                  <div key={p} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-2.5">
                      <span className="shrink-0">
                        {status === "locked" ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : status === "approved" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : status === "failed" ? (
                          <XCircle className="h-4 w-4 text-destructive" />
                        ) : busy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-secondary" />
                        ) : (
                          <Play className="h-4 w-4 text-secondary" />
                        )}
                      </span>
                      <span className="font-medium capitalize flex-1">{p}</span>
                      <span className={`text-[10px] uppercase tracking-wide ${STATUS_STYLE[status]}`}>
                        {status}
                      </span>
                    </div>
                    {st?.summary && (
                      <p className="text-xs text-muted-foreground mt-1.5 pl-[26px]">{st.summary}</p>
                    )}
                    {p === "publish" && (
                      <div
                        className={`mt-2.5 ml-[26px] rounded-md border p-3 text-sm ${
                          templateStyle?.status === "applied"
                            ? "border-green-300 bg-green-50 text-green-950"
                            : "border-red-300 bg-red-50 text-red-950"
                        }`}
                        role="status"
                        data-testid="joomla-template-style-status"
                      >
                        <div className="font-semibold">
                          {templateStyle?.status === "applied"
                            ? "Joomla menu-item Template Style applied"
                            : templateStyle?.status === "not-configured"
                              ? "Joomla menu-item Template Style not applied"
                              : templateStyle?.status === "unsupported"
                                ? "Joomla helper cannot apply the menu-item Template Style"
                                : "Template Style requires manual confirmation"}
                        </div>
                        {templateStyle ? (
                          <p className="mt-1">{templateStyle.message}</p>
                        ) : (
                          <p className="mt-1">
                            The publish helper does not currently report a Template Style update.
                            Confirm the menu item's Details → Template Style manually before treating
                            this setting as complete.
                          </p>
                        )}
                        <div className="mt-2">
                          Requested STS style:{" "}
                          <strong className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">
                            TOP LOGO 2026 (TESTING TIME)
                          </strong>
                          . Confirm that this exact option exists in the Joomla dropdown.
                        </div>
                      </div>
                    )}
                    {st?.error && (
                      <p className="text-xs text-destructive mt-1.5 pl-[26px]">{st.error}</p>
                    )}
                    {(() => {
                      const prov = phaseProvenance(st);
                      const events = phaseAttempts(st);
                      if (!prov && events.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-[26px]">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Source:
                          </span>
                          <span className="text-[10px] font-mono">
                            {prov
                              ? prov.provider && prov.model
                                ? `${prov.provider}/${prov.model}`
                                : (prov.sourceKind ?? "unknown")
                              : "Not recorded"}
                          </span>
                          {prov?.attempt != null && (
                            <span className="text-[10px] text-muted-foreground">
                              attempt {prov.attempt}
                            </span>
                          )}
                          {prov?.fallback && (
                            <Badge variant="destructive" className="uppercase text-[9px] py-0">
                              Fallback{prov.fallbackReason ? `: ${prov.fallbackReason}` : ""}
                            </Badge>
                          )}
                          {events.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              ({events.length} attempt event{events.length === 1 ? "" : "s"})
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {(canRun || canRetry || canApprove || canReplitAuto) && (
                      <div className="flex items-center gap-2 mt-2.5 pl-[26px]">
                        {canRun && (
                          <Button size="sm" disabled={busy} onClick={() => handleRun(p)}>
                            {busy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Start now
                              </>
                            )}
                          </Button>
                        )}
                        {canReplitAuto && (
                          <Button
                            size="sm"
                            disabled={replitBusy}
                            onClick={() => handleReplitAuto(p)}
                            data-testid={`button-replit-auto-${p}`}
                          >
                            {replitBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" />
                                {status === "failed"
                                  ? "Retry"
                                  : p === "publish"
                                    ? "Publish now"
                                    : "Run research"}
                              </>
                            )}
                          </Button>
                        )}
                        {canRetry && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => handleRun(p)}
                          >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Retry"}
                          </Button>
                        )}
                        {canApprove && (
                          <Button size="sm" disabled={busy} onClick={() => handleApprove(p)}>
                            <Check className="h-3 w-3 mr-1" />
                            {p === "schema" ? "Approve & publish" : "Approve & continue"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Replit copy-paste workflow for the active build/audit/schema phase */}
            {isReplit &&
              (() => {
                const active = (["build", "audit", "schema"] as const).find((p) => {
                  const status = phaseState(p)?.status ?? "locked";
                  return status === "ready" || status === "failed";
                });
                return active ? (
                  <ReplitPhasePanel runId={id} phase={active} onSubmitted={invalidate} />
                ) : null;
              })()}

            {/* Link Audit (collapsible) */}
            {linkAudit && (
              <Collapsible
                defaultOpen={!linkAudit.passed && !linkOverride}
                className="rounded-lg border border-border bg-background"
                data-testid="card-link-audit"
              >
                <CollapsibleTrigger className="group/col w-full flex items-center justify-between gap-2 p-3 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" /> Link Audit
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={
                        linkAudit.passed ? "default" : linkOverride ? "secondary" : "destructive"
                      }
                    >
                      {linkAudit.passed ? "PASS" : linkOverride ? "OVERRIDDEN" : "FAIL"}
                    </Badge>
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/col:rotate-180" />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Pre-publish gate: broken, placeholder/empty, insecure (http://), unknown
                    registry, and missing sacred/required links must be clean before publishing.
                  </p>
                  {linkAudit.passed ? (
                    <div className="flex items-center gap-2 text-sm text-green-500">
                      <CheckCircle2 className="h-4 w-4" /> All links clean.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <ShieldAlert className="h-4 w-4" />
                        {linkAudit.errorCount} offending link
                        {linkAudit.errorCount === 1 ? "" : "s"}
                      </div>
                      <div className="space-y-1 max-h-48 overflow-auto">
                        {linkAudit.offendingLinks?.map((l, i) => (
                          <div
                            key={i}
                            className="text-xs border-b border-border/50 py-1.5"
                            data-testid={`link-audit-issue-${i}`}
                          >
                            <span className="font-medium">{l.label}</span>
                            <p className="text-muted-foreground/70 font-mono break-all">
                              {l.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {linkOverride ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Overridden by <span className="font-semibold">{linkOverride.by}</span> on{" "}
                        {new Date(linkOverride.at).toLocaleString()}
                        {linkOverride.reason ? ` — ${linkOverride.reason}` : ""}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRevokeOverride}
                        disabled={revokeLinkAuditOverride.isPending}
                        data-testid="button-revoke-override"
                      >
                        {revokeLinkAuditOverride.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Revoke override"
                        )}
                      </Button>
                    </div>
                  ) : (
                    !linkAudit.passed && (
                      <div className="rounded-md border border-border p-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Recorded human override (who/when) to let publish proceed past this
                          failing link audit. Other checker errors still block publish.
                        </p>
                        <Input
                          placeholder="Your name"
                          value={overrideBy}
                          onChange={(e) => setOverrideBy(e.target.value)}
                          data-testid="input-override-by"
                        />
                        <Input
                          placeholder="Reason (optional)"
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          data-testid="input-override-reason"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleOverride}
                          disabled={overrideLinkAudit.isPending}
                          data-testid="button-override-link-audit"
                        >
                          {overrideLinkAudit.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Override & allow publish"
                          )}
                        </Button>
                      </div>
                    )
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Checkers (collapsible) */}
            <Collapsible
              defaultOpen={!!report && !report.passed}
              className="rounded-lg border border-border bg-background"
            >
              <CollapsibleTrigger className="group/col w-full flex items-center justify-between gap-2 p-3 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Checkers
                </span>
                <span className="flex items-center gap-2">
                  {report && (
                    <Badge variant={report.passed ? "default" : "destructive"}>
                      {report.passed ? "PASS" : "FAIL"}
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/col:rotate-180" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <div className="flex justify-end mb-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCheck}
                    disabled={runCheckers.isPending || !run.pageHtml}
                  >
                    {runCheckers.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Run checks"
                    )}
                  </Button>
                </div>
                {!report ? (
                  <p className="text-sm text-muted-foreground">
                    No checker report yet. Build a page, then run checks.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-destructive">{report.errorCount ?? 0} errors</span>
                      <span className="text-amber-500">{report.warningCount ?? 0} warnings</span>
                      <span className="text-muted-foreground">{report.wordCount ?? 0} words</span>
                    </div>
                    <div className="space-y-1 max-h-72 overflow-auto">
                      {report.checks?.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-start gap-2 text-xs border-b border-border/50 py-1.5"
                        >
                          {c.passed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                          ) : c.severity === "error" ? (
                            <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                          )}
                          <div>
                            <span className="font-medium">{c.label}</span>
                            <p className="text-muted-foreground">{c.message}</p>
                            {c.details?.map((d, i) => (
                              <p key={i} className="text-muted-foreground/70 font-mono">
                                {d}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Post-Publish QC (collapsible) */}
            <Collapsible className="rounded-lg border border-border bg-background">
              <CollapsibleTrigger className="group/col w-full flex items-center justify-between gap-2 p-3 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" /> Post-Publish QC
                </span>
                <span className="flex items-center gap-2">
                  {latestQc && (
                    <Badge variant={latestQc.passed ? "default" : "destructive"}>
                      {latestQc.passed ? "PASS" : "FAIL"}
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/col:rotate-180" />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Runs against the live URL: GTmetrix speed (Performance ≥ 85, LCP ≤ 2.5s) and a
                    JSON-LD duplicate/integrity scan.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleQc}
                    disabled={runQc.isPending}
                    className="shrink-0"
                  >
                    {runQc.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run QC"}
                  </Button>
                </div>
                {!qcResults || qcResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No QC yet. Publish the page, then run QC against the live URL.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const latest = qcResults[0]!;
                      const r = latest.report;
                      return (
                        <div className="rounded-md border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant={latest.passed ? "default" : "destructive"}>
                              {latest.passed ? "PASS" : "FAIL"}
                            </Badge>
                            <span className="text-xs text-muted-foreground font-mono truncate max-w-[60%]">
                              {latest.url}
                            </span>
                          </div>
                          <div className="flex items-start gap-2 text-xs">
                            {r.gtmetrix.passed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="font-medium">GTmetrix speed</span>
                              {r.gtmetrix.metrics && (
                                <p className="text-muted-foreground">
                                  Perf {r.gtmetrix.metrics.performanceScore ?? "—"} · LCP{" "}
                                  {r.gtmetrix.metrics.lcp != null
                                    ? `${r.gtmetrix.metrics.lcp}ms`
                                    : "—"}
                                </p>
                              )}
                              {r.gtmetrix.error && <p className="text-amber-500">{r.gtmetrix.error}</p>}
                              {r.gtmetrix.failReasons?.map((fr, i) => (
                                <p key={i} className="text-destructive">
                                  {fr}
                                </p>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-start gap-2 text-xs">
                            {r.jsonLd.passed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="font-medium">
                                JSON-LD scan ({r.jsonLd.blockCount} blocks)
                              </span>
                              {r.jsonLd.error && <p className="text-amber-500">{r.jsonLd.error}</p>}
                              {r.jsonLd.issues?.map((iss, i) => (
                                <p key={i} className="text-destructive">
                                  {iss}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {qcResults.length > 1 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
                          <History className="h-3 w-3" /> History
                        </div>
                        {qcResults.slice(1).map((q) => (
                          <div
                            key={q.id}
                            className="flex items-center justify-between text-xs border-b border-border/50 py-1.5"
                          >
                            <span className="flex items-center gap-2">
                              {q.passed ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                              )}
                              <span>
                                {q.city}, {q.state}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              {q.createdAt ? new Date(q.createdAt).toLocaleString() : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* AI edit conversation */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5 text-primary" /> AI edits
              </div>
              {isReplit ? (
                <p className="text-sm text-muted-foreground">
                  AI Edit Chat is a Dashboard (Claude) feature. In Replit mode, edit the page with
                  the Replit Agent and re-submit the Build or Audit phase via the run-book CLI.
                </p>
              ) : !chat || chat.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ask for semantic edits once the page is built — e.g. “rewrite the intro to stress
                  data destruction” or “add an FAQ section”. For tiny tweaks (phone, headline) use{" "}
                  <span className="font-medium text-foreground">Quick edit</span> on the preview —
                  it’s instant and never calls the model.
                </p>
              ) : (
                chat.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md p-2.5 text-sm ${
                      m.role === "user" ? "bg-primary/10 ml-6" : "bg-muted mr-6"
                    }`}
                  >
                    <span className="text-xs uppercase text-muted-foreground">{m.role}</span>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
                    {m.role === "assistant" &&
                      (() => {
                        const prov = phaseProvenance(m);
                        return (
                          <p className="mt-1 text-[10px] font-mono text-muted-foreground">
                            source:{" "}
                            {prov
                              ? prov.provider && prov.model
                                ? `${prov.provider}/${prov.model}`
                                : (prov.sourceKind ?? "unknown")
                              : "Not recorded"}
                          </p>
                        );
                      })()}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sticky chat input */}
          <div className="border-t border-border p-3 bg-card">
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  isReplit ? "Unavailable in Replit mode" : "Ask Claude for a semantic edit…"
                }
                disabled={isReplit || !run.pageHtml || chatEdit.isPending}
                onKeyDown={(e) => e.key === "Enter" && handleChat()}
              />
              <Button
                onClick={handleChat}
                disabled={isReplit || !run.pageHtml || chatEdit.isPending || !message.trim()}
              >
                {chatEdit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT — live preview */}
        <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
          <div className="h-12 flex items-center justify-between gap-2 px-4 border-b border-border bg-card shrink-0">
            <span className="text-sm font-medium shrink-0">Live Preview</span>
            <div className="flex items-center gap-1">
              {!quickEdit &&
                (["desktop", "tablet", "mobile"] as PreviewMode[]).map((m) => {
                  const Icon = m === "desktop" ? Monitor : m === "tablet" ? Tablet : Smartphone;
                  return (
                    <Button
                      key={m}
                      size="icon"
                      variant={previewMode === m ? "default" : "ghost"}
                      className="h-8 w-8"
                      onClick={() => setPreviewMode(m)}
                      title={m}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  );
                })}
              {quickEdit ? (
                <>
                  <Button
                    size="sm"
                    onClick={handleSaveHtml}
                    disabled={saveRunHtml.isPending}
                    className="ml-1"
                  >
                    {saveRunHtml.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-1.5" /> Save edit
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setQuickEdit(false)}
                    disabled={saveRunHtml.isPending}
                  >
                    <X className="h-4 w-4 mr-1.5" /> Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-1"
                    onClick={enterQuickEdit}
                    disabled={!run.pageHtml}
                    title="Edit text directly on the page (instant, no AI)"
                  >
                    <Pencil className="h-4 w-4 mr-1.5" /> Quick edit
                  </Button>
                  {run.url && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" asChild title="Open live URL">
                      <a href={run.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 flex justify-center">
            {quickEdit ? (
              <div
                className="bg-white shadow-lg h-full ring-2 ring-primary transition-all"
                style={{ width: previewWidth, maxWidth: "100%" }}
              >
                <iframe
                  key="edit"
                  ref={iframeRef}
                  title="Quick edit"
                  srcDoc={editSnapshot}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  onLoad={(e) => {
                    const doc = (e.target as HTMLIFrameElement).contentDocument;
                    if (doc) doc.designMode = "on";
                  }}
                />
              </div>
            ) : run.pageHtml ? (
              <div
                className="bg-white shadow-lg h-full transition-all"
                style={{ width: previewWidth, maxWidth: "100%" }}
              >
                <iframe
                  key="view"
                  title="Page preview"
                  srcDoc={extractPreviewHtml(run.pageHtml)}
                  className="w-full h-full border-0"
                  sandbox=""
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground p-8 text-center">
                No page built yet. Run the Build phase to generate HTML.
              </div>
            )}
          </div>
          {quickEdit && (
            <div className="px-4 py-2 border-t border-border bg-card text-xs text-muted-foreground shrink-0">
              Click any text on the page to edit it inline. Saving re-runs the full checker suite —
              no AI involved, so it can’t drift.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
