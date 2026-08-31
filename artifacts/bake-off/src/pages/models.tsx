import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DATASETS } from "@/data/datasets";
import type { ModelResult } from "@/types";
import { provenanceLabel } from "./dashboard";

/**
 * Flattened row: one model result from one (dataset, scenario) pair. The same
 * provider/model tag can appear many times across datasets/scenarios/efforts —
 * that's the point of this catalog, so an operator can compare every variation
 * of "Claude" (or any provider) side by side by score, cost, and effort.
 */
interface CatalogRow {
  datasetId: string;
  datasetLabel: string;
  scenarioId: string;
  scenarioLabel: string;
  model: ModelResult;
}

function flatten(): CatalogRow[] {
  const rows: CatalogRow[] = [];
  for (const dataset of DATASETS) {
    for (const scenario of dataset.results.scenarios) {
      for (const model of scenario.models) {
        rows.push({
          datasetId: dataset.id,
          datasetLabel: dataset.label,
          scenarioId: scenario.id,
          scenarioLabel: scenario.label,
          model,
        });
      }
    }
  }
  return rows;
}

/** Group rows by provider, then by base model family (the id, e.g. "claude"). */
function groupByProvider(rows: CatalogRow[]): Map<string, Map<string, CatalogRow[]>> {
  const byProvider = new Map<string, Map<string, CatalogRow[]>>();
  for (const row of rows) {
    const provider = row.model.provider || "Unknown";
    if (!byProvider.has(provider)) byProvider.set(provider, new Map());
    const byFamily = byProvider.get(provider)!;
    const family = row.model.id;
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family)!.push(row);
  }
  return byProvider;
}

export default function Models() {
  const allRows = useMemo(() => flatten(), []);
  const grouped = useMemo(() => groupByProvider(allRows), [allRows]);
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Models Catalog</h1>
        <p className="text-muted-foreground">
          Every model variation ever run, grouped by provider — drill into one to compare its
          runs across datasets, scenarios, tags, and reasoning-effort levels.
        </p>
      </header>

      <div className="grid gap-8">
        {[...grouped.entries()].map(([provider, families]) => (
          <div key={provider}>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              {provider}
              <Badge variant="secondary" className="font-mono text-[10px]">
                {families.size} model{families.size === 1 ? "" : "s"}
              </Badge>
            </h2>
            <div className="grid gap-3">
              {[...families.entries()].map(([familyId, rows]) => {
                const best = [...rows].sort(
                  (a, b) => (b.model.scores?.composite ?? -1) - (a.model.scores?.composite ?? -1),
                )[0];
                const isOpen = expandedFamily === `${provider}:${familyId}`;
                return (
                  <Card key={familyId} className="bg-card/40 backdrop-blur-sm border-border/50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedFamily(isOpen ? null : `${provider}:${familyId}`)}
                      className="w-full text-left p-4 flex items-center justify-between gap-4 hover:bg-secondary/5 transition-colors"
                      data-testid={`family-toggle-${familyId}`}
                    >
                      <div>
                        <div className="font-semibold">{best.model.label}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {familyId} • {rows.length} run{rows.length === 1 ? "" : "s"} recorded
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {best.model.scores && (
                          <span className="text-lg font-bold text-primary">{best.model.scores.composite}</span>
                        )}
                        <span className="text-muted-foreground text-sm">{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border/50">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                              <th className="text-left font-semibold px-4 py-2">Dataset</th>
                              <th className="text-left font-semibold px-4 py-2">Scenario</th>
                              <th className="text-left font-semibold px-4 py-2">Tag</th>
                              <th className="text-left font-semibold px-4 py-2">Effort</th>
                              <th className="text-left font-semibold px-4 py-2">Source</th>
                              <th className="text-right font-semibold px-4 py-2">Score</th>
                              <th className="text-right font-semibold px-4 py-2">Cost</th>
                              <th className="px-4 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {rows
                              .sort((a, b) => (b.model.scores?.composite ?? -1) - (a.model.scores?.composite ?? -1))
                              .map((row, i) => (
                                <tr key={i} className="border-t border-border/30 hover:bg-secondary/5">
                                  <td className="px-4 py-2">{row.datasetLabel}</td>
                                  <td className="px-4 py-2">{row.scenarioLabel}</td>
                                  <td className="px-4 py-2 font-mono text-xs">{row.model.model}</td>
                                  <td className="px-4 py-2 font-mono text-xs">{row.model.effort ?? "unknown"}</td>
                                  <td className="px-4 py-2 font-mono text-xs">{provenanceLabel(row.model.provenance)}</td>
                                  <td className="px-4 py-2 text-right font-medium">
                                    {row.model.status === "error" ? (
                                      <span className="text-destructive">ERROR</span>
                                    ) : (
                                      row.model.scores?.composite ?? "—"
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-xs">
                                    {row.model.costEstimate
                                      ? `${row.model.costEstimate.basis.startsWith("Measured") ? "" : "~"}$${row.model.costEstimate.totalUsd.toFixed(2)}`
                                      : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <Link
                                      href={`/model/${row.datasetId}/${row.scenarioId}/${row.model.id}`}
                                      className="text-primary hover:underline text-xs"
                                    >
                                      View →
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
