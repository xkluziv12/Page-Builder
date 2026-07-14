import { useQueryClient } from "@tanstack/react-query";
import {
  useGetGithubSyncStatus,
  useRunGithubSyncNow,
  getGetGithubSyncStatusQueryKey,
} from "@workspace/api-client-react";
import { GitBranch, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/**
 * Compact GitHub backup health widget for the sidebar footer.
 * Green dot = last mirror pass clean (shows relative time + short commit SHA);
 * red dot = the mirror is failing (shows the last error). "Sync now" hits the
 * existing manual trigger and refreshes the status.
 */
export function GitHubSyncStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: status, isLoading } = useGetGithubSyncStatus({
    query: {
      queryKey: getGetGithubSyncStatusQueryKey(),
      refetchInterval: 60_000,
    },
  });
  const syncNow = useRunGithubSyncNow({
    mutation: {
      onSettled: async (data, error) => {
        await queryClient.invalidateQueries({
          queryKey: getGetGithubSyncStatusQueryKey(),
        });
        const summary = data ?? (error as { data?: typeof data } | null)?.data;
        if (summary?.ok) {
          toast({
            title: "GitHub backup synced",
            description: summary.skipped
              ? "Already up to date."
              : `Pushed ${summary.commitSha?.slice(0, 7) ?? "commit"} (${summary.added} added, ${summary.modified} modified, ${summary.deleted} deleted).`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "GitHub sync failed",
            description: summary?.detail ?? "The sync request failed.",
          });
        }
      },
    },
  });

  if (isLoading || !status) {
    return (
      <div className="px-2 py-1.5 text-[11px] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" /> GitHub backup: checking…
        </span>
      </div>
    );
  }

  const healthy = !status.lastError;
  const busy = status.syncing || syncNow.isPending;

  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2.5 py-2 text-[11px] leading-tight group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-sidebar-foreground/80">
          <span
            aria-label={healthy ? "GitHub backup healthy" : "GitHub backup failing"}
            className={`h-2 w-2 shrink-0 rounded-full ${healthy ? "bg-emerald-500" : "bg-red-500 animate-pulse"}`}
          />
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">GitHub backup</span>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => syncNow.mutate()}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-primary/40 px-1.5 py-0.5 font-bold text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground disabled:opacity-50"
          title="Run a mirror pass now"
        >
          <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Syncing" : "Sync now"}
        </button>
      </div>
      {healthy ? (
        <div className="mt-1 text-sidebar-foreground/60">
          Synced {relativeTime(status.lastSyncAt)}
          {status.lastCommitSha ? (
            <>
              {" · "}
              <span className="font-mono">{status.lastCommitSha.slice(0, 7)}</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 break-words text-red-400" title={status.lastError ?? undefined}>
          {status.lastError}
        </div>
      )}
    </div>
  );
}
