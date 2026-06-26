import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ModelResult, ScenarioResult } from "@/types";
import { Link } from "wouter";
import { ChevronRight, Clock, AlertTriangle, CheckCircle2, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDataset } from "@/contexts/dataset-context";

export default function Dashboard() {
  const { dataset, datasets, activeId: datasetId, setActiveId: setDatasetId } = useDataset();
  const results = dataset.results;
  const [activeId, setActiveId] = useState(results.scenarios[0]?.id ?? "");
  const scenario =
    results.scenarios.find((s) => s.id === activeId) ?? results.scenarios[0];

  if (!scenario) {
    return <div className="p-8 text-muted-foreground">No scenarios recorded.</div>;
  }

  // Sort models by composite score descending, putting errors at the bottom
  const sortedModels = [...scenario.models].sort((a, b) => {
    if (a.status === "error" && b.status !== "error") return 1;
    if (b.status === "error" && a.status !== "error") return -1;
    const scoreA = a.scores?.composite ?? -1;
    const scoreB = b.scores?.composite ?? -1;
    return scoreB - scoreA;
  });

  return (
    <div className="p-8 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Model Leaderboard</h1>
        <p className="text-muted-foreground">
          Comparing LLM performance for page generation against {results.target.city}, {results.target.state}
        </p>
      </header>

      {/* Dataset switcher */}
      <div className="mb-6">
        <div className="inline-flex p-1 rounded-lg bg-card/60 border border-border/60 gap-1">
          {datasets.map((d) => (
            <button
              key={d.id}
              onClick={() => setDatasetId(d.id)}
              className={`px-4 py-2 text-sm rounded-md transition-colors font-medium ${
                d.id === datasetId
                  ? "bg-secondary/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/10"
              }`}
              data-testid={`dataset-tab-${d.id}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-3xl">{dataset.blurb}</p>
      </div>

      {/* Scenario switcher */}
      <div className="mb-6">
        <div className="inline-flex p-1 rounded-lg bg-card/60 border border-border/60 gap-1">
          {results.scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`px-4 py-2 text-sm rounded-md transition-colors font-medium ${
                s.id === scenario.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/10"
              }`}
              data-testid={`scenario-tab-${s.id}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-3xl">{scenario.description}</p>
      </div>

      <div className="grid gap-6">
        {sortedModels.map((model, index) => (
          <ModelRankCard
            key={model.id}
            model={model}
            rank={index + 1}
            scenarioId={scenario.id}
            datasetId={datasetId}
          />
        ))}
      </div>

      <ScenarioNotes scenario={scenario} />
    </div>
  );
}

function ScenarioNotes({ scenario }: { scenario: ScenarioResult }) {
  return (
    <div className="mt-12 pt-8 border-t border-border">
      <h3 className="text-lg font-semibold mb-4">Run Caveats & Notes</h3>
      <div className="grid gap-3">
        {scenario.notes.map((note, i) => (
          <div key={i} className="flex gap-3 items-start text-sm text-muted-foreground bg-card/50 p-3 rounded-md border border-border/50">
            <span className="text-primary font-mono mt-0.5 shrink-0">{i + 1}.</span>
            <p>{note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelRankCard({ model, rank, scenarioId, datasetId }: { model: ModelResult; rank: number; scenarioId: string; datasetId: string }) {
  const isError = model.status === "error";

  return (
    <Link href={`/model/${datasetId}/${scenarioId}/${model.id}`} className="block group">
      <Card className={`relative overflow-hidden transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 bg-card/40 backdrop-blur-sm border-border/50 ${isError ? 'opacity-80' : ''}`}>
        
        {/* Rank Badge */}
        <div className={`absolute top-0 left-0 w-12 h-12 flex items-center justify-center font-mono font-bold text-lg rounded-br-2xl ${
          isError ? 'bg-destructive/10 text-destructive' : 
          rank === 1 ? 'bg-primary text-primary-foreground' : 
          'bg-secondary/10 text-secondary-foreground'
        }`}>
          #{rank}
        </div>

        <div className="p-6 pl-16 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-semibold">{model.label}</h2>
              <Badge variant="outline" className="font-mono text-[10px]">{model.model}</Badge>
            </div>
            
            {isError ? (
              <div className="flex items-start gap-2 text-destructive mt-3 bg-destructive/10 p-3 rounded border border-destructive/20">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="text-sm">{model.error}</span>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>{(model.totalMs / 1000).toFixed(1)}s</span>
                </div>
                {model.costEstimate && (
                  <div className="flex items-center gap-1.5" title="Estimated cost (token usage not captured)">
                    <DollarSign className="w-4 h-4" />
                    <span>~${model.costEstimate.totalUsd.toFixed(2)} est.</span>
                  </div>
                )}
                {model.checkerReport && (
                  <div className="flex items-center gap-1.5">
                    {model.checkerReport.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                    <span>{model.checkerReport.errorCount} Errors, {model.checkerReport.warningCount} Warnings</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {!isError && model.scores && (
            <div className="flex gap-4 sm:gap-8 items-center shrink-0">
              <div className="hidden md:flex gap-4">
                <ScoreMini label="HTML Match" value={model.scores.htmlMatch} />
                <ScoreMini label="Visual" value={model.scores.visualMatch} />
                <ScoreMini label="Audit" value={model.scores.audit} />
              </div>
              <div className="flex flex-col items-center justify-center w-20 h-20 rounded-full border-4 border-primary/20 relative group-hover:border-primary/40 transition-colors">
                <span className="text-2xl font-bold text-primary">{model.scores.composite}</span>
              </div>
            </div>
          )}
          
          <div className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
            <ChevronRight className="w-6 h-6" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function ScoreMini({ label, value }: { label: string, value: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
