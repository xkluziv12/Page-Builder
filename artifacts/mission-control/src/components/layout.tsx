import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Rocket, BookOpen, Table2, LockKeyhole } from "lucide-react";
import { useSystemMode } from "@/hooks/use-system-mode";
import { GitHubSyncStatus } from "@/components/github-sync-status";
import { clearAdminSession } from "@/components/admin-access-gate";
import { Button } from "@/components/ui/button";

// SidebarProvider writes the open/collapsed state to the `sidebar_state` cookie
// on every toggle but never reads it back on mount. This is a client-rendered
// SPA, so we read the cookie at render time and seed `defaultOpen` from it — that
// makes the collapse preference survive a full page reload / new session.
function readSidebarPreference(): boolean {
  if (typeof document === "undefined") return true;
  const match = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
  return match ? match[1] === "true" : true;
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { mode, setMode } = useSystemMode();

  return (
    <SidebarProvider defaultOpen={readSidebarPreference()}>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar
          collapsible="icon"
          className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
        >
          <SidebarHeader className="h-16 flex flex-row items-center justify-between gap-2 px-4 border-b border-sidebar-border group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
            <div className="flex items-center gap-2 text-primary min-w-0 group-data-[collapsible=icon]:hidden">
              <Rocket className="h-5 w-5 shrink-0" />
              <span className="font-bold text-lg tracking-tight uppercase truncate">
                MISSION CONTROL
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div
                role="group"
                aria-label="Switch system"
                className="inline-flex items-center rounded-full border border-primary/50 overflow-hidden text-[11px] font-bold tracking-wide group-data-[collapsible=icon]:hidden"
              >
                <a
                  href="/"
                  className="px-3 py-1 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
                >
                  OLD
                </a>
                <span
                  aria-current="true"
                  className="px-3 py-1 bg-primary text-primary-foreground cursor-default"
                >
                  NEW
                </span>
              </div>
              <SidebarTrigger className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" />
            </div>
          </SidebarHeader>
          <SidebarContent className="p-4 group-data-[collapsible=icon]:p-2">
            <div className="mb-4 group-data-[collapsible=icon]:hidden">
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                System
              </div>
              <div
                role="group"
                aria-label="Build system"
                className="grid grid-cols-2 overflow-hidden rounded-md border border-primary/40 text-xs font-bold tracking-wide"
              >
                <button
                  type="button"
                  aria-pressed={mode === "dashboard"}
                  onClick={() => setMode("dashboard")}
                  className={
                    mode === "dashboard"
                      ? "bg-primary px-2 py-1.5 text-primary-foreground"
                      : "px-2 py-1.5 text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
                  }
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "replit"}
                  onClick={() => setMode("replit")}
                  className={
                    mode === "replit"
                      ? "bg-primary px-2 py-1.5 text-primary-foreground"
                      : "px-2 py-1.5 text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
                  }
                >
                  Replit
                </button>
              </div>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"} tooltip="Dashboard">
                  <Link href="/">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/master-grid"}
                  tooltip="Master Grid"
                >
                  <Link href="/master-grid">
                    <Table2 className="h-4 w-4 mr-2" />
                    <span>Master Grid</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/registry"} tooltip="Registry">
                  <Link href="/registry">
                    <BookOpen className="h-4 w-4 mr-2" />
                    <span>Registry</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-2 border-t border-sidebar-border gap-2">
            <GitHubSyncStatus />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearAdminSession()}
              className="w-full justify-center gap-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:px-0"
              title="Lock Mission Control"
            >
              <LockKeyhole className="h-3.5 w-3.5" />
              <span className="group-data-[collapsible=icon]:hidden">Lock</span>
            </Button>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
