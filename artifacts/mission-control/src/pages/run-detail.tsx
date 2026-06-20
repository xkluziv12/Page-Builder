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
  getGetRunQueryKey,
  getGetChatHistoryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Phase = "research" | "build" | "audit" | "schema" | "publish";
const PHASES: Phase[] = ["research", "build", "audit", "schema", "publish"];

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

  const runPhase = useRunPhase();
  const approvePhase = useApprovePhase();
  const runCheckers = useRunCheckers();
  const chatEdit = useChatEdit();
  const deleteRun = useDeleteRun();

  const [message, setMessage] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetRunQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(id) });
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
                const canRetry = status === "failed";
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
                srcDoc={run.pageHtml}
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
              {!chat || chat.length === 0 ? (
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
                placeholder="e.g. Add a CTA after the intro"
                disabled={!run.pageHtml || chatEdit.isPending}
                onKeyDown={(e) => e.key === "Enter" && handleChat()}
              />
              <Button
                onClick={handleChat}
                disabled={!run.pageHtml || chatEdit.isPending || !message.trim()}
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
