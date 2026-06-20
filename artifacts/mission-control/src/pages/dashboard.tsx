import { useGetSummary, useListRuns, useCreateRun, getGetSummaryQueryKey, getListRunsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Play, Plus, Server, CheckCircle2, Clock, Rocket } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { data: summary } = useGetSummary({
    query: { refetchInterval: 5000, queryKey: getGetSummaryQueryKey() },
  });
  const { data: runs, isLoading } = useListRuns({
    query: { refetchInterval: 5000, queryKey: getListRunsQueryKey() },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createRun = useCreateRun();

  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [track, setTrack] = useState<"page"|"blog">("page");
  const [engine, setEngine] = useState<"claude"|"replit">("claude");
  const [classification, setClassification] = useState<"NEW_BUILD"|"REVAMP"|"LIGHT_TOUCH">("NEW_BUILD");
  const [competition, setCompetition] = useState<"LOW"|"MEDIUM"|"HIGH">("MEDIUM");

  const handleLaunch = () => {
    if (!city || !state) {
      toast({ title: "Validation Error", description: "City and State are required.", variant: "destructive" });
      return;
    }
    
    createRun.mutate(
      { data: { city, state, track, engine, classification, competition } },
      {
        onSuccess: () => {
          setCity("");
          setState("");
          toast({ title: "Run Launched", description: `Build for ${city}, ${state} started.` });
          queryClient.invalidateQueries({ queryKey: getListRunsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        },
        onError: (err) => {
          toast({ title: "Launch Failed", description: (err as { error?: string })?.error || "Unknown error", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <header className="h-16 flex items-center px-6 border-b border-border bg-card shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Dashboard Overview</h1>
      </header>

      <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Top metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Builds</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary?.total || 0}</div>
            </CardContent>
          </Card>
          
          {summary?.byStatus?.filter(s => ['running', 'review', 'published', 'failed'].includes(s.status)).map(stat => (
            <Card key={stat.status}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{stat.status}</CardTitle>
                {stat.status === 'running' ? <Activity className="h-4 w-4 text-secondary animate-pulse" /> : 
                 stat.status === 'published' ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                 stat.status === 'failed' ? <div className="h-2 w-2 rounded-full bg-destructive" /> :
                 <Clock className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.count}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Launcher & List */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card className="xl:col-span-1 shadow-sm border-primary/20">
            <CardHeader className="bg-muted/30 border-b border-border pb-4">
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                New Build
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">City</label>
                  <Input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Austin" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">State</label>
                  <Input value={state} onChange={e => setState(e.target.value)} placeholder="e.g. TX" />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Track</label>
                  <Select value={track} onValueChange={(v: "page"|"blog") => setTrack(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="page">Page</SelectItem>
                      <SelectItem value="blog">Blog</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Engine</label>
                  <Select value={engine} onValueChange={(v: "claude") => setEngine(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude">Claude</SelectItem>
                      <SelectItem value="replit" disabled>Replit (coming soon)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Classification</label>
                  <Select value={classification} onValueChange={(v: any) => setClassification(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEW_BUILD">New Build</SelectItem>
                      <SelectItem value="REVAMP">Revamp</SelectItem>
                      <SelectItem value="LIGHT_TOUCH">Light Touch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Competition</label>
                  <Select value={competition} onValueChange={(v: any) => setCompetition(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                className="w-full mt-4 bg-primary text-primary-foreground hover:bg-primary/90" 
                onClick={handleLaunch}
                disabled={createRun.isPending}
              >
                {createRun.isPending ? "Initiating..." : "Launch Pipeline"}
                {!createRun.isPending && <Play className="h-4 w-4 ml-2" />}
              </Button>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2 shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border pb-4 flex flex-row items-center justify-between">
              <CardTitle>Active Runs</CardTitle>
            </CardHeader>
            <div className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse">Loading telemetry...</div>
              ) : runs?.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
                  <Server className="h-12 w-12 mb-4 opacity-20" />
                  <p>No active runs. Launch a new build to begin.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
                      <tr>
                        <th className="px-6 py-3 font-medium">ID</th>
                        <th className="px-6 py-3 font-medium">Target</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Phase</th>
                        <th className="px-6 py-3 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {runs?.map(run => (
                        <tr key={run.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-6 py-4 font-mono text-muted-foreground">#{run.id}</td>
                          <td className="px-6 py-4 font-medium">{run.city}, {run.state}</td>
                          <td className="px-6 py-4">
                            <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'published' ? 'default' : 'secondary'} className="uppercase">
                              {run.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground capitalize">
                            {run.currentPhase}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/runs/${run.id}`}>Inspect</Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
