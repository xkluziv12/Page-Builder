import { type FormEvent, useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SESSION_TOKEN_KEY = "mission-control-admin-token";

function loadSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
}

let activeToken = loadSessionToken();
const listeners = new Set<(token: string | null) => void>();

setAuthTokenGetter(() => activeToken);

function saveSessionToken(token: string): void {
  activeToken = token;
  window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  listeners.forEach((listener) => listener(activeToken));
}

/** Clears the admin session so AdminAccessGate re-locks. Used by the sidebar "Lock" control. */
export function clearAdminSession(): void {
  activeToken = null;
  window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  listeners.forEach((listener) => listener(activeToken));
}

export function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(() => Boolean(activeToken));

  useEffect(() => {
    const listener = (token: string | null) => setIsUnlocked(Boolean(token));
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = token.trim();
    if (!candidate) {
      setError("Enter the administrator token to continue.");
      return;
    }

    setError(null);
    setIsVerifying(true);
    try {
      const response = await fetch("/api/mc/summary", {
        headers: { Authorization: `Bearer ${candidate}` },
      });
      if (!response.ok) {
        setError("The administrator token was rejected, or admin access is not configured.");
        return;
      }

      saveSessionToken(candidate);
      setToken("");
      setIsUnlocked(true);
    } catch {
      setError("Mission Control could not verify administrator access. Try again.");
    } finally {
      setIsVerifying(false);
    }
  }

  if (isUnlocked) return <>{children}</>;

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:grid sm:place-items-center">
      <Card className="mx-auto w-full max-w-md border-primary/20 shadow-xl shadow-primary/5">
        <CardHeader className="space-y-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl">Mission Control access</CardTitle>
            <CardDescription>
              Enter the administrator token to open the build, review, and publishing controls.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="space-y-2 text-sm font-medium" htmlFor="admin-token">
              Administrator token
              <Input
                id="admin-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
                autoFocus
                disabled={isVerifying}
              />
            </label>
            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                The token is verified with the API and kept only for this browser session. It is never
                included in the deployed frontend.
              </p>
            )}
            <Button className="w-full gap-2" type="submit" disabled={isVerifying}>
              <LockKeyhole className="size-4" aria-hidden="true" />
              {isVerifying ? "Verifying access…" : "Unlock Mission Control"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}