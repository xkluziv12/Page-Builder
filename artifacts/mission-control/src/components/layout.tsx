import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarProvider } from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Rocket, BookOpen, Table2 } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <SidebarHeader className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
            <div className="flex items-center gap-2 text-primary">
              <Rocket className="h-5 w-5" />
              <span className="font-bold text-lg tracking-tight uppercase">MISSION CONTROL</span>
            </div>
            <div
              role="group"
              aria-label="Switch system"
              className="inline-flex items-center rounded-full border border-primary/50 overflow-hidden text-[11px] font-bold tracking-wide"
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
          </SidebarHeader>
          <SidebarContent className="p-4">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"}>
                  <Link href="/">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/master-grid"}>
                  <Link href="/master-grid">
                    <Table2 className="h-4 w-4 mr-2" />
                    <span>Master Grid</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/registry"}>
                  <Link href="/registry">
                    <BookOpen className="h-4 w-4 mr-2" />
                    <span>Registry</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
