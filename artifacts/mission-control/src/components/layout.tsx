import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Rocket, BookOpen, Table2 } from "lucide-react";

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
          <SidebarRail />
        </Sidebar>
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
