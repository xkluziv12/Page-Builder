import type { JudgeResults, RankEntry } from "./run.js";

/** Build a human-readable Markdown report from the collected judge results. */
export function buildReport(results: JudgeResults): string {
  const pageLabels = results.pages.map((p) => p.label);
  const lines: string[] = [];

  lines.push("# Cross-Model SEO / AIO / GEO Judging Round\n");
  lines.push(`_Generated ${results.generatedAt}_\n`);
  lines.push(
    "Six judge models each researched the live web (Reddit / forums / Google), " +
      "then ran a full SEO + AIO + GEO audit of three **blind** pages and ranked them.\n",
  );

  lines.push("## The pages under test (blind labels)\n");
  lines.push("| Label | Actual model |");
  lines.push("| --- | --- |");
  for (const p of results.pages) lines.push(`| **Page ${p.label}** | ${p.nice} (\`${p.model}\`) |`);
  lines.push("");

  // Ranking matrix
  lines.push("## How each judge ranked the pages\n");
  lines.push(
    `| Judge | Web search | ${pageLabels.map((l) => `Page ${l}`).join(" | ")} | Winner |`,
  );
  lines.push(`| --- | :---: | ${pageLabels.map(() => ":---:").join(" | ")} | :---: |`);

  const rankOf = (r: RankEntry[] | null, label: string): string => {
    if (!r) return "—";
    const e = r.find((x) => x.page === label);
    if (!e) return "—";
    const medal = e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : "";
    const score = e.overall ? ` (${e.overall})` : "";
    return `${medal}#${e.rank}${score}`;
  };

  for (const j of Object.values(results.judges)) {
    if (j.error) {
      lines.push(`| **${j.nice}** | — | ${pageLabels.map(() => "ERROR").join(" | ")} | — |`);
      continue;
    }
    const cells = pageLabels.map((l) => rankOf(j.ranking, l));
    const winnerNice = j.winner ? results.mapping[j.winner] ?? j.winner : "—";
    lines.push(
      `| **${j.nice}** | ${j.searchUsed ? "✓" : "✗"} | ${cells.join(" | ")} | ${
        j.winner ? `Page ${j.winner} (${winnerNice})` : "—"
      } |`,
    );
  }
  lines.push("");

  // Aggregate consensus
  lines.push("## Consensus\n");
  const agg: Record<string, { sum: number; n: number; firsts: number }> = {};
  for (const l of pageLabels) agg[l] = { sum: 0, n: 0, firsts: 0 };
  for (const j of Object.values(results.judges)) {
    if (!j.ranking) continue;
    for (const e of j.ranking) {
      if (!agg[e.page]) continue;
      agg[e.page]!.sum += e.rank;
      agg[e.page]!.n += 1;
      if (e.rank === 1) agg[e.page]!.firsts += 1;
    }
  }
  lines.push("| Page | Model | Avg rank | #1 votes |");
  lines.push("| --- | --- | :---: | :---: |");
  const ordered = [...pageLabels].sort((a, b) => {
    const aa = agg[a]!.n ? agg[a]!.sum / agg[a]!.n : 99;
    const bb = agg[b]!.n ? agg[b]!.sum / agg[b]!.n : 99;
    return aa - bb;
  });
  for (const l of ordered) {
    const a = agg[l]!;
    const avg = a.n ? (a.sum / a.n).toFixed(2) : "—";
    lines.push(`| Page ${l} | ${results.mapping[l] ?? l} | ${avg} | ${a.firsts}/${a.n} |`);
  }
  lines.push("");

  // Full per-judge audits
  lines.push("## Full audits\n");
  for (const j of Object.values(results.judges)) {
    lines.push(`### ${j.nice} \`${j.id}\`\n`);
    lines.push(
      `_web search: ${j.searchUsed ? "yes" : "no"} · ${(j.ms / 1000).toFixed(0)}s_\n`,
    );
    if (j.error) {
      lines.push(`> **ERROR:** ${j.error}\n`);
      continue;
    }
    if (j.summary) lines.push(`**Summary:** ${j.summary}\n`);
    lines.push(j.text.trim());
    lines.push("\n---\n");
  }

  return lines.join("\n");
}
