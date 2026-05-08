const STORAGE_KEY = "crew_local_user_id";

/** Opaque id for this browser; created once and reused until cleared (e.g. forget device). */
export function getOrCreateLocalUserId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)?.trim();
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearLocalUserId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
