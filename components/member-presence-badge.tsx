import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type MemberPresenceKind = "ACTIVE_HERE" | "OTHER_ROOM" | "NO_ACTIVE_ROOM" | "UNKNOWN";

export function memberPresenceLabel(
  presence: MemberPresenceKind,
  focusRoomCode: string | null,
  focusRoomName: string | null,
): string {
  switch (presence) {
    case "ACTIVE_HERE":
      return "צופה בחדר הזה";
    case "OTHER_ROOM": {
      const roomLabel =
        focusRoomName?.trim() ||
        (focusRoomCode ? `חדר ${focusRoomCode}` : null) ||
        "חדר אחר";
      return `מוקד במקום אחר · ${roomLabel}`;
    }
    case "NO_ACTIVE_ROOM":
      return "אין חדר במיקוד";
    case "UNKNOWN":
      return "אין סשן מקושר";
  }
}

export function MemberPresenceBadge({
  presence,
  focusRoomCode,
  focusRoomName,
  className,
}: {
  presence: MemberPresenceKind;
  focusRoomCode: string | null;
  focusRoomName: string | null;
  className?: string;
}) {
  const label = memberPresenceLabel(presence, focusRoomCode, focusRoomName);

  const tone =
    presence === "ACTIVE_HERE"
      ? "border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-200"
      : presence === "OTHER_ROOM"
        ? "border-amber-600/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
        : presence === "NO_ACTIVE_ROOM"
          ? "text-muted-foreground"
          : "text-muted-foreground border-dashed";

  return (
    <Badge variant="outline" className={cn("max-w-full whitespace-normal text-start font-normal", tone, className)} title={label}>
      {label}
    </Badge>
  );
}
