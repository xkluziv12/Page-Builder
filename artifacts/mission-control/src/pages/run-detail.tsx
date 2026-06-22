import { useState } from "react";
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
  getGetRunQueryKey,
  getGetChatHistoryQueryKey,
  getGetQcResultsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const [message, setMessage] = useState("");
  const [overrideBy, setOverrideBy] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");

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
    const latestQc = qcResults?.[0];
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

  return (
    <div className="flex flex-col h-full overflow-auto">
      <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
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
        <div className="flex items-center gap-2">
          <Badge
            variant={run.status === "failed" ? "destructive" : "secondary"}
            className="uppercase"
          >
            {run.status}
          </Badge>
          <Button variant="ghost" size="icon" onClick={handleDelete} title="Delete run">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </header>

      {isReplit && (
        <div className="px-6 pt-4">
          <div className="rounded-md border border-secondary/40 bg-secondary/10 p-3 text-sm text-muted-foreground max-w-[1600px] mx-auto">
            <span className="font-medium text-foreground">Replit mode.</span>{" "}
            This run is built by the Replit Agent via the operator run-book — the
            dashboard is the review surface. Run phases from the shell with{" "}
            <code className="font-mono text-foreground">pnpm --filter @workspace/scripts run mc</code>{" "}
            (research / build / audit / schema / publish), and approve each gate
            here or by typing <span className="font-mono">next</span>. Pages pass
            the identical checker suite before they can be approved or published.
          </div>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 p-6 max-w-[1600px] mx-auto w-full">
        {/* Left column: pipeline + checkers */}
        <div className="space-y-6 xl:col-span-1">
          <Card>
            <CardHeader className="border-b border-border pb-4">
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-1">
              {PHASES.map((p) => {
                const st = phaseState(p);
                const status = st?.status ?? "locked";
                const busy =
                  (runPhase.isPending && runPhase.variables?.phase === p) ||
                  (approvePhase.isPending && approvePhase.variables?.phase === p) ||
                  status === "running";
                // The pipeline runs itself: creating a run auto-runs Research and
                // approving a phase auto-runs the next. So the only manual action
                // on the forward path is Approve; "Retry" is just the escape hatch
                // for a phase that failed.
                // Retry runs the Dashboard (Claude) auto-run path, which does not
                // apply to operator-driven Replit runs — they re-run a phase by
                // re-submitting the artifact via the run-book CLI.
                const canRetry = status === "failed" && !isReplit;
                const canApprove = status === "review";
                return (
                  <div
                    key={p}
                    className="flex items-center gap-3 rounded-md border border-border p-3"
                  >
                    <div className="shrink-0">
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
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{p}</span>
                        <span className={`text-xs uppercase ${STATUS_STYLE[status]}`}>
                          {status}
                        </span>
                      </div>
                      {st?.summary && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {st.summary}
                        </p>
                      )}
                      {st?.error && (
                        <p className="text-xs text-destructive mt-1">{st.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
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
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {(() => {
            const linkAudit = report?.linkAudit;
            const override = run.linkAuditOverride ?? null;
            if (!linkAudit) return null;
            const passed = linkAudit.passed;
            return (
              <Card data-testid="card-link-audit">
                <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" /> Link Audit
                  </CardTitle>
                  <Badge variant={passed ? "default" : override ? "secondary" : "destructive"}>
                    {passed ? "PASS" : override ? "OVERRIDDEN" : "FAIL"}
                  </Badge>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Pre-publish gate: broken, placeholder/empty, insecure (http://), unknown
                    registry, and missing sacred/required links must be clean before publishing.
                  </p>

                  {passed ? (
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

                  {override ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Overridden by <span className="font-semibold">{override.by}</span> on{" "}
                        {new Date(override.at).toLocaleString()}
                        {override.reason ? ` — ${override.reason}` : ""}
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
                    !passed && (
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
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Checkers
              </CardTitle>
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
            </CardHeader>
            <CardContent className="p-4">
              {!report ? (
                <p className="text-sm text-muted-foreground">
                  No checker report yet. Build a page, then run checks.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant={report.passed ? "default" : "destructive"}>
                      {report.passed ? "PASS" : "FAIL"}
                    </Badge>
                    <span className="text-destructive">{report.errorCount ?? 0} errors</span>
                    <span className="text-amber-500">
                      {report.warningCount ?? 0} warnings
                    </span>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" /> Post-Publish QC
              </CardTitle>
              <Button size="sm" variant="outline" onClick={handleQc} disabled={runQc.isPending}>
                {runQc.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run QC"}
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Runs against the live URL: GTmetrix speed (Performance ≥ 85, LCP ≤ 2.5s) and a
                JSON-LD duplicate/integrity scan.
              </p>
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
                            {r.gtmetrix.error && (
                              <p className="text-amber-500">{r.gtmetrix.error}</p>
                            )}
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
            </CardContent>
          </Card>
        </div>

        {/* Middle: preview */}
        <Card className="xl:col-span-1 flex flex-col">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle>Live Preview</CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-[400px]">
            {run.pageHtml ? (
              <iframe
                title="Page preview"
                srcDoc={extractPreviewHtml(run.pageHtml)}
                className="w-full h-full min-h-[600px] border-0 bg-white"
                sandbox=""
              />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[400px] text-muted-foreground p-8 text-center">
                No page built yet. Run the Build phase to generate HTML.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: chat */}
        <Card className="xl:col-span-1 flex flex-col">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle>AI Edit Chat</CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex-1 flex flex-col">
            <div className="flex-1 space-y-3 overflow-auto min-h-[300px] max-h-[500px] mb-4">
              {isReplit ? (
                <p className="text-sm text-muted-foreground">
                  AI Edit Chat is a Dashboard (Claude) feature. In Replit mode,
                  edit the page with the Replit Agent and re-submit the Build or
                  Audit phase via the run-book CLI.
                </p>
              ) : !chat || chat.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ask for surgical edits to the page once it is built.
                </p>
              ) : (
                chat.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md p-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-primary/10 ml-6"
                        : "bg-muted mr-6"
                    }`}
                  >
                    <span className="text-xs uppercase text-muted-foreground">
                      {m.role}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isReplit ? "Unavailable in Replit mode" : "e.g. Add a CTA after the intro"}
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
