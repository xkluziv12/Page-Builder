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
  getGetRunQueryKey,
  getGetChatHistoryQueryKey,
  getGetQcResultsQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const STATUS_STYLE: Record<string, string> = {
  locked: "text-muted-foreground",
  ready: "text-secondary",
  running: "text-secondary animate-pulse",
  review: "text-amber-500",
  approved: "text-green-500",
  failed: "text-destructive",
};

export default function RunDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: run, isLoading } = useGetRun(id, {
    query: { refetchInterval: 4000, queryKey: getGetRunQueryKey(id) },
  });
  const { data: chat } = useGetChatHistory(id, {
    query: { refetchInterval: 4000, queryKey: getGetChatHistoryQueryKey(id) },
  });
  const { data: qcResults } = useGetQcResults(id, {
    query: { refetchInterval: 4000, queryKey: getGetQcResultsQueryKey(id) },
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
          <Button variant="ghost" size="icon" asChild>
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
                <span className="font-medium text-foreground">Replit mode.</span> Built by
                the Replit Agent via the run-book CLI — this dashboard is the review surface.
                The AI edit chat is disabled here; approve each gate below.
              </div>
            )}

            {/* Pipeline as conversational steps */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Rocket className="h-3.5 w-3.5 text-primary" /> Build pipeline
              </div>
              {PHASES.map((p) => {
                const st = phaseState(p);
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
                    {st?.error && (
                      <p className="text-xs text-destructive mt-1.5 pl-[26px]">{st.error}</p>
                    )}
                    {(canRun || canRetry || canApprove) && (
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
