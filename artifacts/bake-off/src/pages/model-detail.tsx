import { useEffect } from "react";
import { useParams } from "wouter";
import NotFound from "./not-found";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, Database, LayoutTemplate, Link as LinkIcon, ShieldAlert, FileText, Image as ImageIcon, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDataset } from "@/contexts/dataset-context";
import { getDataset } from "@/data/datasets";

/** Resolve a screenshot path stored in results.json against the app's base URL. */
function shotUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${import.meta.env.BASE_URL}${path}`;
}

export default function ModelDetail() {
  const { datasetId, scenarioId, id } = useParams();
  const { activeId, setActiveId } = useDataset();

  // The URL is the source of truth for which dataset this page shows; keep the
  // shared switcher (sidebar/dashboard) in sync when navigating directly here.
  useEffect(() => {
    if (datasetId && datasetId !== activeId) setActiveId(datasetId);
  }, [datasetId, activeId, setActiveId]);

  const results = getDataset(datasetId).results;
  const scenario = results.scenarios.find(s => s.id === scenarioId);
  const model = scenario?.models.find(m => m.id === id);

  if (!scenario || !model) return <NotFound />;

  if (model.status === "error") {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <header className="mb-8">
          <Badge variant="outline" className="mb-2">{scenario.label}</Badge>
          <h1 className="text-3xl font-bold mb-2">{model.label}</h1>
          <p className="text-muted-foreground font-mono text-sm">{model.model} • {model.provider}</p>
        </header>
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Run Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm">{model.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-2">{scenario.label}</Badge>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{model.label}</h1>
            <Badge variant="outline" className="font-mono">{model.model}</Badge>
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>{(model.totalMs / 1000).toFixed(2)}s total</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              <span>{model.scores?.wordCount ?? 0} words score</span>
            </div>
            {model.costEstimate && (
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                <span>~${model.costEstimate.totalUsd.toFixed(2)} est. cost</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Composite Score</div>
            <div className="text-4xl font-bold text-primary">{model.scores?.composite}</div>
          </div>
        </div>
      </header>

      {model.scores && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
          <ScoreCell label="HTML Match" value={model.scores.htmlMatch} hint="vs real page" />
          <ScoreCell label="Visual" value={model.scores.visualMatch} hint="rendered look" />
          <ScoreCell label="Audit" value={model.scores.audit} />
          <ScoreCell label="Structure" value={model.scores.structure} />
          <ScoreCell label="Schema" value={model.scores.schema} />
          <ScoreCell label="Links" value={model.scores.links} />
          <ScoreCell label="Word Count" value={model.scores.wordCount} />
          <ScoreCell label="Speed" value={model.scores.speed} />
        </div>
      )}

      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-12 bg-transparent p-0 mb-6">
          <TabsTrigger value="preview" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6 flex gap-2">
            <LayoutTemplate className="w-4 h-4" />
            Output Preview
          </TabsTrigger>
          <TabsTrigger value="visual" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6 flex gap-2">
            <ImageIcon className="w-4 h-4" />
            Visual Match
          </TabsTrigger>
          <TabsTrigger value="checker" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6 flex gap-2">
            <ShieldAlert className="w-4 h-4" />
            Checker Report
          </TabsTrigger>
          <TabsTrigger value="schema" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6 flex gap-2">
            <Database className="w-4 h-4" />
            Schema & Links
          </TabsTrigger>
          <TabsTrigger value="timing" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6 flex gap-2">
            <Clock className="w-4 h-4" />
            Timings
          </TabsTrigger>
          <TabsTrigger value="cost" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-6 flex gap-2">
            <DollarSign className="w-4 h-4" />
            Cost
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-0">
          <Card className="overflow-hidden border-border bg-white rounded-lg shadow-xl shadow-black/5 dark:shadow-none min-h-[600px] flex flex-col">
            <div className="h-10 bg-muted border-b flex items-center px-4 gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              </div>
              <div className="mx-auto bg-background/50 text-xs px-3 py-1 rounded text-muted-foreground font-mono">
                {results.target.url}
              </div>
            </div>
            <div className="flex-1 bg-white relative">
              <iframe 
                srcDoc={model.html || ""} 
                sandbox="" 
                className="absolute inset-0 w-full h-full border-0 bg-white"
                title="Model Output Preview"
              />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="visual" className="mt-0">
          {(() => {
            const modelShot = shotUrl(model.screenshot);
            const refShot = shotUrl(results.referenceScreenshot);
            if (!modelShot || !refShot) {
              return (
                <Card className="border-dashed">
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    No rendered screenshots are available for this run. Run{" "}
                    <code className="font-mono">pnpm --filter @workspace/scripts run bakeoff:rescore</code>{" "}
                    to render the pages and score the visual match.
                  </CardContent>
                </Card>
              );
            }
            return (
              <div className="space-y-6">
                {model.scores && (
                  <div className="grid grid-cols-3 gap-3">
                    <ScoreCell label="Visual (overall)" value={model.scores.visualMatch} hint="pixel + vision" />
                    <ScoreCell
                      label="Perceptual"
                      value={model.scores.visualPixel ?? 0}
                      hint={model.scores.visualPixel == null ? "n/a" : "pixel diff"}
                    />
                    <ScoreCell
                      label="Vision-LLM"
                      value={model.scores.visualLlm ?? 0}
                      hint={model.scores.visualLlm == null ? "not run" : "how close it looks"}
                    />
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Each page is rendered to a screenshot with a headless browser, then compared to the real
                  published page — a true visual judge, not just CSS token overlap.
                </p>
                <div className="grid gap-6 md:grid-cols-2">
                  <ShotPanel title="Real Published Page" subtitle={results.target.url} src={refShot} />
                  <ShotPanel title={`${model.label} — Rendered`} subtitle={model.model} src={modelShot} />
                </div>
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="checker" className="mt-0">
          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
            <div className="space-y-4">
              {model.checkerReport?.checks.map((check, i) => (
                <Card key={i} className={`border-l-4 ${check.passed ? 'border-l-emerald-500' : check.severity === 'error' ? 'border-l-destructive' : 'border-l-amber-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {check.passed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                      ) : check.severity === 'error' ? (
                        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="font-semibold">{check.label}</h4>
                        <p className="text-sm text-muted-foreground mt-1">{check.message}</p>
                        {check.details && check.details.length > 0 && (
                          <ul className="mt-2 text-xs font-mono text-muted-foreground space-y-1 list-disc list-inside ml-4">
                            {check.details.map((detail, idx) => (
                              <li key={idx}>{detail}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Research Brief</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="mb-4">{model.research?.summary}</p>
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Entities</span>
                    <div className="flex flex-wrap gap-2">
                      {model.research?.entities?.map((e: any, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">{e.name}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  JSON-LD Schema
                  {model.schemaValid ? (
                    <Badge variant="outline" className="ml-auto bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Valid</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-auto bg-destructive/10 text-destructive border-destructive/20">Invalid</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="p-4 rounded-md bg-zinc-950 text-zinc-50 overflow-x-auto text-xs font-mono">
                  {model.schema ? JSON.stringify(JSON.parse(model.schema), null, 2) : "No schema generated."}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="w-5 h-5" />
                  Link Audit
                  {model.linkAudit?.passed ? (
                    <Badge variant="outline" className="ml-auto bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Passed</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-auto bg-destructive/10 text-destructive border-destructive/20">Errors Found</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {model.linkAudit?.checks.map((check, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      {check.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-medium">{check.label}</span>
                        <p className="text-muted-foreground text-xs mt-0.5">{check.message}</p>
                      </div>
                    </div>
                  ))}

                  {model.linkAudit?.offendingLinks && model.linkAudit.offendingLinks.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <span className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2 block">Offending Links</span>
                      <ul className="space-y-2 text-sm font-mono bg-destructive/5 p-3 rounded-md border border-destructive/10">
                        {model.linkAudit.offendingLinks.map((link, i) => (
                          <li key={i} className="text-destructive break-all">• {link.detail}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="timing" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Phase Timings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {model.timings.map((timing, i) => {
                  const percentage = (timing.ms / model.totalMs) * 100;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium capitalize">{timing.phase}</span>
                        <span className="font-mono text-muted-foreground">{(timing.ms / 1000).toFixed(2)}s</span>
                      </div>
                      <div className="h-2 w-full bg-secondary/20 rounded-full overflow-hidden mb-2">
                        <div 
                          className="h-full bg-primary rounded-full" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{timing.summary}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cost" className="mt-0">
          {model.costEstimate ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ScoreCell label="Est. Total" value={`$${model.costEstimate.totalUsd.toFixed(2)}`} hint="input + output" />
                <ScoreCell label="Input Cost" value={`$${model.costEstimate.inputUsd.toFixed(2)}`} hint={`${formatTokens(model.costEstimate.inputTokens)} tok`} />
                <ScoreCell label="Output Cost" value={`$${model.costEstimate.outputUsd.toFixed(2)}`} hint={`${formatTokens(model.costEstimate.outputTokens)} tok`} />
                <ScoreCell label="List Price" value={`$${model.costEstimate.pricePerMInput}/$${model.costEstimate.pricePerMOutput}`} hint="per 1M in/out" />
              </div>
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    How this estimate was derived
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  {model.costEstimate.basis}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No cost estimate is available for this run.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ShotPanel({ title, subtitle, src }: { title: string; subtitle: string; src: string }) {
  return (
    <Card className="overflow-hidden border-border bg-white rounded-lg shadow-xl shadow-black/5 dark:shadow-none flex flex-col">
      <div className="px-4 py-2.5 border-b bg-muted flex items-center justify-between gap-3">
        <span className="text-sm font-semibold truncate">{title}</span>
        <span className="text-[11px] text-muted-foreground font-mono truncate">{subtitle}</span>
      </div>
      <div className="bg-white overflow-auto max-h-[640px]">
        <img src={src} alt={title} className="w-full block" loading="lazy" />
      </div>
    </Card>
  );
}

function ScoreCell({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card className="bg-card/40 border-border/50">
      <CardContent className="p-3 flex flex-col items-center text-center gap-0.5">
        <span className="text-2xl font-bold text-primary">{value}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        {hint && <span className="text-[9px] text-muted-foreground/70">{hint}</span>}
      </CardContent>
    </Card>
  );
}
