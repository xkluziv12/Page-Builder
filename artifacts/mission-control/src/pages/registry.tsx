import { useGetRegistry } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Link2, Image, Building2, ShieldCheck } from "lucide-react";
import type { RegistryLink } from "@workspace/api-client-react";

function LinkTable({ links }: { links: RegistryLink[] }) {
  if (!links || links.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">None configured.</p>;
  }
  return (
    <div className="divide-y divide-border">
      {links.map((l, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
          <span className="font-medium shrink-0">{l.label}</span>
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="text-secondary hover:underline font-mono text-xs truncate"
          >
            {l.url}
          </a>
        </div>
      ))}
    </div>
  );
}

export default function Registry() {
  const { data: registry, isLoading } = useGetRegistry();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading registry…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <header className="h-16 flex items-center px-6 border-b border-border bg-card shrink-0">
        <h1 className="text-xl font-bold tracking-tight">Safeguard Registry</h1>
      </header>
      <div className="flex-1 p-6 space-y-6 max-w-5xl mx-auto w-full">
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Base domain:</span>
              <span className="font-mono">{registry?.baseDomain}</span>
            </div>
            <Badge variant="secondary">
              Word floor: {registry?.wordCountFloor ?? 0}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> Sacred Equipment Links
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LinkTable links={registry?.sacredLinks ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2">
              <Image className="h-4 w-4 text-primary" /> Verified Image Library
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LinkTable links={registry?.imageLibrary ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Industry Links
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LinkTable links={registry?.industryLinks ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" /> Allowlist
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LinkTable links={registry?.allowlist ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
