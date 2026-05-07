"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RoomPageClient({ roomId }: { roomId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: crew, isPending, isError, error } = useQuery(trpc.crew.me.queryOptions());

  const setActiveRoom = useMutation({
    ...trpc.crew.setActiveRoom.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(trpc.crew.me.queryFilter()),
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
          <Link href="/">Back home</Link>
        </Button>
      </div>
    );
  }

  if (!membership) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Room access</CardTitle>
            <CardDescription>You’re not in this room with this browser session.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button asChild>
              <Link href="/">Join from home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { room, member } = membership;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">Room</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {room.name ?? `Code ${room.code}`}
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-lg">{room.code}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">You</CardTitle>
          <CardDescription>
            Signed in as <span className="font-medium text-foreground">{member.displayName}</span> · {member.role}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Task list and crew tools will live here next.
        </CardContent>
      </Card>
    </div>
  );
}
