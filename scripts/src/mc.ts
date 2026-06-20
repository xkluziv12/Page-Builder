/**
 * Mission Control — Replit-mode operator CLI.
 *
 * This is the helper the Replit Agent + operator use to drive a "Replit mode"
 * run end to end. It is a thin client over the shared api-server: every command
 * hits the same routes the Dashboard uses, so a Replit-built page flows through
 * the identical orchestrator, checkers, and parity gates as a Claude page.
 *
 * Usage (from the repo root):
 *   pnpm --filter @workspace/scripts run mc <command> [args]
 *
 * Commands:
 *   queue                       List Replit runs waiting for operator action.
 *   show <id>                   Print a run's phase ladder + checker summary.
 *   research <id>               Run Research (reuses the shared n8n fetch).
 *   build <id> <file.html>      Submit Agent-built HTML for the Build phase.
 *   audit <id> <file.html>      Submit Agent-audited HTML for the Audit phase.
 *   schema <id> <file.json>     Submit Agent-built JSON-LD for the Schema phase.
 *   check <id>                  Run the checker suite against the current HTML.
 *   next <id>                   Approve the phase currently in review ("next").
 *   publish <id>                Run the Publish phase (shared publisher).
 *
 * The API base defaults to the shared dev proxy; override with MC_API_BASE.
 */
import { readFile } from "node:fs/promises";

const API_BASE = (process.env.MC_API_BASE ?? "http://localhost:80/api").replace(/\/$/, "");

const PHASE_ORDER = ["research", "build", "audit", "schema", "publish"] as const;

interface PhaseEntry {
  phase: string;
  status: string;
  summary: string | null;
  error: string | null;
}
interface CheckerReport {
  passed: boolean;
  errorCount?: number;
  warningCount?: number;
  wordCount?: number;
  checks?: { label: string; severity: string; passed: boolean; message: string }[];
}
interface Run {
  id: number;
  city: string;
  state: string;
  engine: string;
  status: string;
  currentPhase: string;
  phases: PhaseEntry[];
  checkerReport: CheckerReport | null;
}

function die(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return die(
      `Cannot reach the API at ${API_BASE}. Is the API Server workflow running? (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    die((json as { error?: string }).error ?? `${method} ${path} failed (${res.status})`);
  }
  return json as T;
}

function printReport(report: CheckerReport | null): void {
  if (!report) {
    console.log("  Checkers: (none yet)");
    return;
  }
  console.log(
    `  Checkers: ${report.passed ? "PASS" : "FAIL"} — ${report.errorCount ?? 0} error(s), ${
      report.warningCount ?? 0
    } warning(s), ${report.wordCount ?? 0} words`,
  );
  for (const c of report.checks ?? []) {
    if (!c.passed && c.severity === "error") {
      console.log(`    ✗ ${c.label}: ${c.message}`);
    }
  }
}

function printRun(run: Run): void {
  console.log(`\nRun #${run.id} — ${run.city}, ${run.state}  [${run.engine}]  status=${run.status}`);
  for (const phase of PHASE_ORDER) {
    const entry = run.phases?.find((p) => p.phase === phase);
    const status = entry?.status ?? "locked";
    const marker = status === "review" ? "→" : status === "approved" ? "✓" : status === "failed" ? "✗" : " ";
    let line = `  ${marker} ${phase.padEnd(9)} ${status}`;
    if (entry?.summary) line += `  — ${entry.summary}`;
    if (entry?.error) line += `  — ERROR: ${entry.error}`;
    console.log(line);
  }
  printReport(run.checkerReport);
}

function inReview(run: Run): string | null {
  return run.phases?.find((p) => p.status === "review")?.phase ?? null;
}

async function readArg(file: string | undefined, label: string): Promise<string> {
  if (!file) die(`Missing ${label} file argument.`);
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    return die(`Cannot read ${label} file "${file}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const id = Number(rest[0]);

  switch (command) {
    case "queue": {
      const runs = await api<Run[]>("GET", "/mc/runs");
      const replit = runs.filter((r) => r.engine === "replit");
      if (replit.length === 0) {
        console.log("No Replit runs. Create one in the dashboard with engine = Replit.");
        return;
      }
      console.log("Replit queue:");
      for (const r of replit) {
        const active = inReview(r) ?? r.phases?.find((p) => p.status === "ready" || p.status === "failed")?.phase;
        console.log(
          `  #${r.id}  ${r.city}, ${r.state}  status=${r.status}  ${
            active ? `→ ${active} (${r.phases.find((p) => p.phase === active)?.status})` : "(done)"
          }`,
        );
      }
      return;
    }
    case "show": {
      if (!id) die("Usage: mc show <id>");
      printRun(await api<Run>("GET", `/mc/runs/${id}`));
      return;
    }
    case "research": {
      if (!id) die("Usage: mc research <id>");
      printRun(await api<Run>("POST", `/mc/runs/${id}/phases/research/replit`, {}));
      return;
    }
    case "build":
    case "audit": {
      if (!id) die(`Usage: mc ${command} <id> <file.html>`);
      const html = await readArg(rest[1], "HTML");
      printRun(await api<Run>("POST", `/mc/runs/${id}/phases/${command}/replit`, { html }));
      return;
    }
    case "schema": {
      if (!id) die("Usage: mc schema <id> <file.json>");
      const schema = await readArg(rest[1], "schema");
      printRun(await api<Run>("POST", `/mc/runs/${id}/phases/schema/replit`, { schema }));
      return;
    }
    case "publish": {
      if (!id) die("Usage: mc publish <id>");
      printRun(await api<Run>("POST", `/mc/runs/${id}/phases/publish/replit`, {}));
      return;
    }
    case "check": {
      if (!id) die("Usage: mc check <id>");
      printReport(await api<CheckerReport>("POST", `/mc/runs/${id}/check`, {}));
      return;
    }
    case "next": {
      if (!id) die("Usage: mc next <id>");
      const run = await api<Run>("GET", `/mc/runs/${id}`);
      const phase = inReview(run);
      if (!phase) die(`Run #${id} has no phase in review to approve. Run the current phase first.`);
      printRun(await api<Run>("POST", `/mc/runs/${id}/phases/${phase}/approve`, {}));
      return;
    }
    default:
      console.log(
        [
          "Mission Control — Replit-mode operator CLI",
          "",
          "Commands:",
          "  mc queue                    List Replit runs awaiting action",
          "  mc show <id>                Print a run's phase ladder + checkers",
          "  mc research <id>            Run Research (shared n8n fetch)",
          "  mc build <id> <file.html>   Submit Agent-built HTML",
          "  mc audit <id> <file.html>   Submit Agent-audited HTML",
          "  mc schema <id> <file.json>  Submit Agent-built JSON-LD",
          "  mc check <id>               Run the checker suite",
          "  mc next <id>                Approve the phase in review",
          "  mc publish <id>             Run the Publish phase",
          "",
          `API base: ${API_BASE} (override with MC_API_BASE)`,
        ].join("\n"),
      );
      if (command && command !== "help") process.exit(1);
  }
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
