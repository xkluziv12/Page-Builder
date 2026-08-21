import { useMemo, useState } from "react";
import { useListWorkLog } from "@workspace/api-client-react";
import type { WorkLogRecord } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle2,
  Circle,
  CircleDashed,
  Minus,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

type SortKey =
  | "pageName"
  | "company"
  | "city"
  | "state"
  | "pageType"
  | "tier"
  | "vaName"
  | "source"
  | "status"
  | "inSitemap"
  | "impressions"
  | "clicks"
  | "position"
  | "dateCompleted"
  | "updatedAt";

type SortDir = "asc" | "desc";

const ALL = "__all__";

function StatusCell({ status }: { status: string }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 text-green-600 font-medium">
        <CheckCircle2 className="h-4 w-4" /> Done
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600 font-medium">
        <CircleDashed className="h-4 w-4" /> In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground font-medium">
      <Circle className="h-4 w-4" /> Not started
    </span>
  );
}

function DeltaCell({
  value,
  pct,
  invert = false,
  digits = 0,
}: {
  value?: number | null;
  pct?: number | null;
  invert?: boolean;
  digits?: number;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  const change = pct ?? null;
  const isUp = change !== null && change > 0;
  const isDown = change !== null && change < 0;
  const good = invert ? isDown : isUp;
  const bad = invert ? isUp : isDown;
  const color = good ? "text-green-600" : bad ? "text-red-600" : "text-muted-foreground";
  const Icon = good ? TrendingUp : bad ? TrendingDown : Minus;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span className="font-medium">{value.toFixed(digits)}</span>
      {change !== null && (
        <span className={`inline-flex items-center gap-0.5 text-xs ${color}`}>
          <Icon className="h-3 w-3" />
          {Math.abs(change).toFixed(0)}%
        </span>
      )}
    </span>
  );
}

function sitemapBadge(v?: boolean | null) {
  if (v === true) return <Badge variant="secondary">In sitemap</Badge>;
  if (v === false) return <Badge variant="destructive">Missing</Badge>;
  return <span className="text-muted-foreground/50">—</span>;
}

function sortValue(r: WorkLogRecord, key: SortKey): string | number {
  switch (key) {
    case "impressions":
      return r.seoDelta?.latestImpressions ?? -1;
    case "clicks":
      return r.seoDelta?.latestClicks ?? -1;
    case "position":
      return r.seoDelta?.latestAvgPosition ?? Number.MAX_SAFE_INTEGER;
    case "inSitemap":
      return r.inSitemap === true ? 1 : r.inSitemap === false ? 0 : -1;
    case "tier":
      return (r.tier ?? "").toString().toLowerCase();
    case "dateCompleted":
      return r.dateCompleted ?? "";
    case "updatedAt":
      return r.updatedAt ?? "";
    case "pageName":
      return (r.pageName ?? r.newUrl ?? r.normalizedUrl ?? "").toLowerCase();
    case "vaName":
      return (r.vaName ?? "").toLowerCase();
    default:
      return (r[key] ?? "").toString().toLowerCase();
  }
}

export default function MasterGrid() {
  const { data, isLoading, isError, error } = useListWorkLog();
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [pageType, setPageType] = useState<string>(ALL);
  const [vaName, setVaName] = useState<string>(ALL);
  const [month, setMonth] = useState<string>(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("dateCompleted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const vaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of data ?? []) if (r.vaName) set.add(r.vaName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of data ?? []) if (r.dateCompleted) set.add(r.dateCompleted.slice(0, 7));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [data]);

  const rows = useMemo<WorkLogRecord[]>(() => {
    let out = (data ?? []).slice();
    if (company !== ALL) out = out.filter((r) => r.company === company);
    if (status !== ALL) out = out.filter((r) => r.status === status);
    if (pageType !== ALL) out = out.filter((r) => r.pageType === pageType);
    if (vaName !== ALL) out = out.filter((r) => (r.vaName ?? "") === vaName);
    if (month !== ALL) out = out.filter((r) => (r.dateCompleted ?? "").slice(0, 7) === month);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        [r.pageName, r.newUrl, r.oldUrl, r.normalizedUrl, r.city, r.state, r.vaName]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }
    out.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [data, company, status, pageType, vaName, month, search, sortKey, sortDir]);

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.length,
      done: all.filter((r) => r.status === "done").length,
      inProgress: all.filter((r) => r.status === "in_progress").length,
      missingSitemap: all.filter((r) => r.inSitemap === false).length,
    };
  }, [data]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function Th({ label, k, numeric }: { label: string; k: SortKey; numeric?: boolean }) {
    const active = sortKey === k;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={`px-3 py-2 font-semibold whitespace-nowrap ${numeric ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex items-center gap-1 select-none hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded ${
            numeric ? "flex-row-reverse" : ""
          }`}
        >
          {label}
          <Icon className={`h-3 w-3 ${active ? "text-foreground" : "text-muted-foreground/50"}`} />
        </button>
      </th>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading work-log…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <header className="h-16 flex items-center px-6 border-b border-border bg-card shrink-0">
          <h1 className="text-xl font-bold tracking-tight">Master Grid</h1>
        </header>
        <div className="p-6">
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">
              Failed to load the work-log: {(error as Error)?.message ?? "unknown error"}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Master Grid</h1>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline">{counts.total} pages</Badge>
          <Badge variant="secondary">{counts.done} done</Badge>
          <Badge variant="outline">{counts.inProgress} in progress</Badge>
          {counts.missingSitemap > 0 && (
            <Badge variant="destructive">{counts.missingSitemap} missing sitemap</Badge>
          )}
        </div>
      </header>

      <div className="px-6 py-3 border-b border-border bg-card/50 flex flex-wrap items-center gap-2 shrink-0">
        <Input
          placeholder="Search URL, page, city, VA…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64"
        />
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All companies</SelectItem>
            <SelectItem value="STS">STS</SelectItem>
            <SelectItem value="DCD">DCD</SelectItem>
            <SelectItem value="TechnoCycle">TechnoCycle</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="not_started">Not started</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pageType} onValueChange={setPageType}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="city">City</SelectItem>
            <SelectItem value="service">Service</SelectItem>
            <SelectItem value="hub">Hub</SelectItem>
            <SelectItem value="spoke">Spoke</SelectItem>
            <SelectItem value="blog">Blog</SelectItem>
          </SelectContent>
        </Select>
        <Select value={vaName} onValueChange={setVaName}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="VA" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All VAs</SelectItem>
            {vaOptions.map((va) => (
              <SelectItem key={va} value={va}>
                {va}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All months</SelectItem>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {rows.length} shown
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur border-b border-border text-xs">
            <tr>
              <Th label="Page" k="pageName" />
              <Th label="Company" k="company" />
              <Th label="City" k="city" />
              <Th label="State" k="state" />
              <Th label="Type" k="pageType" />
              <Th label="Tier" k="tier" />
              <Th label="VA" k="vaName" />
              <Th label="Source" k="source" />
              <Th label="Status" k="status" />
              <Th label="Sitemap" k="inSitemap" />
              <Th label="Impr." k="impressions" numeric />
              <Th label="Clicks" k="clicks" numeric />
              <Th label="Avg pos" k="position" numeric />
              <Th label="Completed" k="dateCompleted" />
              <Th label="Updated" k="updatedAt" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-10 text-center text-muted-foreground">
                  No work-log entries match the current filters.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const d = r.seoDelta;
              const url = r.newUrl ?? r.oldUrl ?? `https://${r.normalizedUrl}`;
              return (
                <tr key={r.id} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="px-3 py-2 max-w-[20rem]">
                    <div className="font-medium truncate">{r.pageName || r.normalizedUrl}</div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-secondary hover:underline font-mono truncate block"
                    >
                      {r.normalizedUrl}
                    </a>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.company}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.city || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.state || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap capitalize">{r.pageType}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.tier || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.vaName || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {r.source}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusCell status={r.status} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{sitemapBadge(r.inSitemap)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <DeltaCell
                      value={d?.latestImpressions}
                      pct={d?.impressionsPctChange}
                    />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <DeltaCell value={d?.latestClicks} />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <DeltaCell value={d?.latestAvgPosition} invert digits={1} />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {r.dateCompleted ? new Date(r.dateCompleted).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
