"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoomTasksSection } from "@/components/room-tasks-section";
import { RoomPresencePanel } from "@/components/room-presence-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { memberRoleHe } from "@/lib/ui-he";

export function RoomPageClient({ roomId }: { roomId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: crew, isPending, isError, error } = useQuery(trpc.crew.me.queryOptions());

  const setActiveRoom = useMutation({
    ...trpc.crew.setActiveRoom.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries(trpc.crew.me.queryFilter());
      void queryClient.invalidateQueries(trpc.crew.roomMembers.queryFilter({ roomId }));
    },
  });

  const membership = useMemo(
    () => crew?.memberships.find((m) => m.roomId === roomId) ?? null,
    [crew?.memberships, roomId],
  );

  useEffect(() => {
    if (!crew?.session || !membership) return;
    if (crew.session.activeRoomId === roomId) return;
    setActiveRoom.mutate({ roomId });
  }, [crew?.session, crew?.session?.activeRoomId, membership, roomId, setActiveRoom]);

  if (isPending) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="text-destructive text-sm">{error.message}</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link href="/">חזרה לדף הבית</Link>
        </Button>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>גישה לחדר</CardTitle>
            <CardDescription>אין לכם חברות בחדר הזה עם סשן הדפדפן הנוכחי.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild>
              <Link href="/">הצטרפות מהבית</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { room, member } = membership;
  const canSeePresence = member.role === "OWNER" || member.role === "CONTRIBUTOR";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">חדר</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {room.name ?? `קוד ${room.code}`}
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-lg" dir="ltr">
            {room.code}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/">בית</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={`/room/${roomId}/members`}>חברים</Link>
          </Button>
        </div>
      </div>

      <RoomTasksSection roomId={roomId} memberId={member.id} memberRole={member.role} />

      {canSeePresence ? <RoomPresencePanel roomId={roomId} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">אתם</CardTitle>
          <CardDescription>
            מחוברים כ־<span className="font-medium text-foreground">{member.displayName}</span> ·{" "}
            {memberRoleHe(member.role)}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
