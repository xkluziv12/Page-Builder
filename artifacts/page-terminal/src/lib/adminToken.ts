const KEY = "mark_admin_token";

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* ignore storage errors */
  }
}

export function clearAdminToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore storage errors */
  }
}
