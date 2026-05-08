import type { MemberRole, TaskUrgency } from "@/app/generated/prisma/browser";

export function memberRoleHe(role: MemberRole): string {
  switch (role) {
    case "OWNER":
      return "בעלים";
    case "CONTRIBUTOR":
      return "משתתף מוביל";
    case "MEMBER":
      return "חבר";
    default:
      return role;
  }
}

export function taskUrgencyHe(u: TaskUrgency): string {
  switch (u) {
    case "URGENT":
      return "דחוף";
    case "HIGH":
      return "גבוה";
    case "MEDIUM":
      return "בינוני";
    case "LOW":
      return "נמוך";
    default:
      return u;
  }
}

export function taskUrgencyHintHe(u: TaskUrgency): string {
  switch (u) {
    case "URGENT":
      return "עוצרים הכול";
    case "HIGH":
      return "באותו היום אם אפשר";
    case "MEDIUM":
      return "עדיפות רגילה";
    case "LOW":
      return "כשיש זמן";
    default:
      return "";
  }
}

export function taskStatusHe(status: string): string {
  switch (status) {
    case "OPEN":
      return "פתוח";
    case "IN_PROGRESS":
      return "בתהליך";
    case "DONE":
      return "הושלם";
    default:
      return status;
  }
}

export function formatDurationMsHe(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} שנ׳`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} דק׳ ${s % 60} שנ׳`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} שע׳ ${m % 60} דק׳`;
  const d = Math.floor(h / 24);
  return `${d} ימים ${h % 24} שע׳`;
}

export function durationBasisHe(b: "in_progress" | "claimed" | "created"): string {
  switch (b) {
    case "in_progress":
      return "מתחילת ביצוע";
    case "claimed":
      return "מתחילת השארה";
    default:
      return "מתחילת יצירה";
  }
}
