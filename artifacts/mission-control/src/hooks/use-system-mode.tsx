import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

/**
 * The active build "system" for NEW Mission Control.
 * - `dashboard`: the app drives the pipeline itself with an API model engine.
 * - `replit`: the run is queued for a Replit operator/Agent to build (CLI handoff).
 *
 * This is a UI-level selector that seeds the New Build form's engine. It does not
 * change either backend system — both already exist — it only chooses which one a
 * new build launches with. Default is `dashboard`.
 */
export type SystemMode = "dashboard" | "replit";

const STORAGE_KEY = "mc_system_mode";

function readInitialMode(): SystemMode {
  if (typeof localStorage === "undefined") return "dashboard";
  return localStorage.getItem(STORAGE_KEY) === "replit" ? "replit" : "dashboard";
}

interface SystemModeContextValue {
  mode: SystemMode;
  setMode: (mode: SystemMode) => void;
}

const SystemModeContext = createContext<SystemModeContextValue | null>(null);

export function SystemModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SystemMode>(readInitialMode);

  const setMode = useCallback((next: SystemMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; ignore storage being unavailable.
    }
  }, []);

  return (
    <SystemModeContext.Provider value={{ mode, setMode }}>
      {children}
    </SystemModeContext.Provider>
  );
}

export function useSystemMode(): SystemModeContextValue {
  const ctx = useContext(SystemModeContext);
  if (!ctx) {
    throw new Error("useSystemMode must be used within a SystemModeProvider");
  }
  return ctx;
}
