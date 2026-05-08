"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberPresenceBadge, type MemberPresenceKind } from "@/components/member-presence-badge";

/** Owner/contributor snapshot: who has this room focused vs elsewhere (same session field as task visibility). */
export function RoomPresencePanel({ roomId }: { roomId: string }) {
  const trpc = useTRPC();
  const { data, isPending, isError, error } = useQuery(trpc.crew.roomMembers.queryOptions({ roomId }));

  const grouped = useMemo(() => {
    if (!data?.members.length) return null;

    const here: typeof data.members = [];
    const elsewhere: typeof data.members = [];
    const idle: typeof data.members = [];
    const unknown: typeof data.members = [];

    for (const m of data.members) {
      switch (m.presence as MemberPresenceKind) {
        case "ACTIVE_HERE":
          here.push(m);
          break;
        case "OTHER_ROOM":
          elsewhere.push(m);
          break;
        case "NO_ACTIVE_ROOM":
          idle.push(m);
          break;
        default:
          unknown.push(m);
      }
    }

    return { here, elsewhere, idle, unknown };
  }, [data?.members]);

  if (isPending) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }

  if (isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {error.message}
      </p>
    );
  }

  if (!grouped) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">מיקוד בחדר הזה</CardTitle>
        <CardDescription>
          אנשים רואים את משימות חדר זה רק כשזה החדר הפתוח אצלם במכשיר. כך אפשר לדעת מי כאן עכשיו לעומת מי שהצטרף אבל
          עבר לחדר אחר.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <PresenceGroup title="צופים בחדר הזה" members={grouped.here} empty="אף אחד לא ממקד כרגע את החדר הזה." />
        <PresenceGroup title="ממוקדים בחדר אחר" members={grouped.elsewhere} empty={null} />
        <PresenceGroup title="בלי חדר במיקוד" members={grouped.idle} empty={null} />
        {grouped.unknown.length > 0 ? (
          <PresenceGroup title="סשן לא ברור" members={grouped.unknown} empty={null} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function PresenceGroup({
  title,
  members,
  empty,
}: {
  title: string;
  members: Array<{
    id: string;
    displayName: string;
    presence: string;
    focusRoomCode: string | null;
    focusRoomName: string | null;
  }>;
  empty: string | null;
}) {
  if (members.length === 0) {
    if (!empty) return null;
    return (
      <div>
        <p className="text-foreground font-medium">{title}</p>
        <p className="text-muted-foreground mt-1">{empty}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-foreground font-medium">
        {title} <span className="text-muted-foreground font-normal">({members.length})</span>
      </p>
      <ul className="mt-2 space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate font-medium">{m.displayName}</span>
            {(m.presence === "OTHER_ROOM" || m.presence === "NO_ACTIVE_ROOM" || m.presence === "UNKNOWN") && (
              <MemberPresenceBadge
                presence={m.presence as MemberPresenceKind}
                focusRoomCode={m.focusRoomCode}
                focusRoomName={m.focusRoomName}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
