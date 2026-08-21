import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAccessGate } from "@/components/admin-access-gate";
import { AppLayout } from "@/components/layout";
import { SystemModeProvider } from "@/hooks/use-system-mode";
import Dashboard from "@/pages/dashboard";
import RunDetail from "@/pages/run-detail";
import Registry from "@/pages/registry";
import MasterGrid from "@/pages/master-grid";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/runs/:id" component={RunDetail} />
      <Route path="/registry" component={Registry} />
      <Route path="/master-grid" component={MasterGrid} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AdminAccessGate>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SystemModeProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppLayout>
                <Router />
              </AppLayout>
            </WouterRouter>
          </SystemModeProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AdminAccessGate>
  );
}

export default App;
