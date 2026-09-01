import { Link, useLocation } from "wouter";
import { Info, Home, FileText, MapPin, Layers } from "lucide-react";
import { useDataset } from "@/contexts/use-dataset";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { dataset, activeId: datasetId } = useDataset();
  const results = dataset.results;

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary selection:text-primary-foreground">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-4 rounded-sm bg-primary border border-primary-foreground/20" />
            <span className="font-bold text-lg tracking-tight uppercase">M.A.R.K.</span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">Bake-Off Pipeline</p>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6">
          <nav className="flex flex-col gap-1">
            <Link href="/" aria-current={location === '/' ? 'page' : undefined} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${location === '/' ? 'bg-secondary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary/5 hover:text-foreground'}`}>
              <Home className="w-4 h-4" />
              Leaderboard
            </Link>
            <Link href="/portland-review" aria-current={location === '/portland-review' ? 'page' : undefined} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${location === '/portland-review' ? 'bg-secondary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary/5 hover:text-foreground'}`}>
              <MapPin className="w-4 h-4" />
              Portland GMB + Schema
            </Link>
            <Link href="/models" aria-current={location === '/models' ? 'page' : undefined} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${location === '/models' ? 'bg-secondary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary/5 hover:text-foreground'}`}>
              <Layers className="w-4 h-4" />
              Models
            </Link>
          </nav>

          {results.scenarios.map((scenario) => (
            <div className="px-3" key={scenario.id}>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">{scenario.label}</h4>
              <nav className="flex flex-col gap-1">
                {scenario.models.map((model) => {
                  const href = `/model/${datasetId}/${scenario.id}/${model.id}`;
                  return (
                    <Link key={model.id} href={href} aria-current={location === href ? 'page' : undefined} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${location === href ? 'bg-secondary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-secondary/5 hover:text-foreground'}`}>
                      <FileText className="w-4 h-4" />
                      <span className="truncate">{model.label}</span>
                      {model.status === 'error' && (
                        <span className="ml-auto w-2 h-2 rounded-full bg-destructive shrink-0" role="img" aria-label="Run failed" />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}

          <div className="px-3 mt-auto mb-4">
            <div className="bg-secondary/5 border border-secondary/10 rounded-lg p-3 text-xs">
              <div className="flex items-center gap-1.5 text-primary font-semibold mb-2">
                <Info className="w-3.5 h-3.5" />
                <span>Target Run</span>
              </div>
              <ul className="space-y-1 text-muted-foreground mb-3 font-mono text-[10px]">
                <li><span className="text-foreground/60">Location:</span> {results.target.city}, {results.target.state}</li>
                <li><span className="text-foreground/60">Niche:</span> {results.target.niche}</li>
                <li><span className="text-foreground/60">Type:</span> {results.target.pageType}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
