"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberPresenceBadge } from "@/components/member-presence-badge";
import { memberRoleHe, taskStatusHe, taskUrgencyHe } from "@/lib/ui-he";

export function MembersPageClient({ roomId }: { roomId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: crew, isPending: crewPending, isError: crewError, error: crewErr } = useQuery(
    trpc.crew.me.queryOptions(),
  );

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

  const roomMembersQuery = useQuery({
    ...trpc.crew.roomMembers.queryOptions({ roomId }),
    enabled: Boolean(membership),
  });

  const invalidateMembers = () => {
    void queryClient.invalidateQueries(trpc.crew.roomMembers.queryFilter({ roomId }));
    void queryClient.invalidateQueries(trpc.crew.roomTasks.queryFilter({ roomId }));
  };

  const setAvailable = useMutation({
    ...trpc.crew.setAvailableForTasks.mutationOptions(),
    onSuccess: async () => {
      toast.success("עדכון הזמינות נשמר");
      await invalidateMembers();
    },
    onError: (e) => toast.error(e.message),
  });

  const completeTask = useMutation({
    ...trpc.crew.completeTask.mutationOptions(),
    onSuccess: async () => {
      toast.success("המשימה סומנה כהושלמה");
      await invalidateMembers();
    },
    onError: (e) => toast.error(e.message),
  });

  const startTask = useMutation({
    ...trpc.crew.startTask.mutationOptions(),
    onSuccess: async () => {
      toast.success("המשימה בתהליך");
      await invalidateMembers();
    },
    onError: (e) => toast.error(e.message),
  });

  const promoteMember = useMutation({
    ...trpc.crew.promoteMember.mutationOptions(),
    onSuccess: async () => {
      toast.success("החבר קודם לתפקיד משתתף מוביל");
      await invalidateMembers();
      await queryClient.invalidateQueries(trpc.crew.me.queryFilter());
    },
    onError: (e) => toast.error(e.message),
  });

  if (crewPending) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (crewError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="text-destructive text-sm">{crewErr.message}</p>
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
          <CardContent>
            <Button asChild>
              <Link href="/">הצטרפות מהבית</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const myMemberId = membership.member.id;
  const myRole = membership.member.role;
  const isOwner = myRole === "OWNER";
  const canAssign = myRole === "OWNER" || myRole === "CONTRIBUTOR";
  const roster = roomMembersQuery.data;
  const rosterPending = roomMembersQuery.isPending;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">חברים</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {membership.room.name ?? `חדר ${membership.room.code}`}
          </h1>
          <p className="text-muted-foreground mt-1 font-mono" dir="ltr">
            {membership.room.code}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/room/${roomId}`}>חדר</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">בית</Link>
          </Button>
        </div>
      </div>

      {roomMembersQuery.isError ? (
        <p className="text-destructive text-sm">{roomMembersQuery.error.message}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">צוות</CardTitle>
          <CardDescription>
            תפקיד, זמינות, ואיפה הדפדפן של כל אחד ממוקד — המשימות תואמות את החדר שבמיקוד.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rosterPending || !roster ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : (
            <ul className="divide-y divide-border rounded-lg border">
              {roster.members.map((m) => {
                const isSelf = m.id === myMemberId;
                const freeForTask = m.availableForTasks && m.openTasks.length === 0;
                const showAvailabilityToggle = isSelf;

                const showPromote =
                  isOwner && !isSelf && m.role === "MEMBER";

                return (
                  <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{m.displayName}</span>
                        {isSelf ? (
                          <Badge variant="secondary" className="text-xs">
                            אתם
                          </Badge>
                        ) : null}
                        <Badge variant="outline">{memberRoleHe(m.role)}</Badge>
                        <MemberPresenceBadge
                          presence={m.presence}
                          focusRoomCode={m.focusRoomCode}
                          focusRoomName={m.focusRoomName}
                        />
                        {freeForTask ? (
                          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">פנוי למשימות</Badge>
                        ) : (
                          <Badge variant="destructive">לא פנוי</Badge>
                        )}
                      </div>
                      {m.openTasks.length > 0 ? (
                        <ul className="text-muted-foreground space-y-1 text-sm">
                          {m.openTasks.map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center gap-2">
                              <span className="text-foreground">{t.title}</span>
                              {t.urgency ? (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  {taskUrgencyHe(t.urgency)}
                                </Badge>
                              ) : null}
                              <Badge variant="outline" className="text-xs font-normal">
                                {taskStatusHe(t.status)}
                              </Badge>
                              {(isSelf || canAssign) && t.status === "OPEN" ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={startTask.isPending}
                                  onClick={() => startTask.mutate({ roomId, taskId: t.id })}
                                >
                                  התחל
                                </Button>
                              ) : null}
                              {(isSelf || canAssign) &&
                              (t.status === "OPEN" || t.status === "IN_PROGRESS") ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={completeTask.isPending}
                                  onClick={() => completeTask.mutate({ roomId, taskId: t.id })}
                                >
                                  סמן כהושלם
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground text-sm">אין משימות פתוחות.</p>
                      )}
                    </div>
                    {showAvailabilityToggle ? (
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        <p className="text-muted-foreground text-xs">זמינותכם לשיוך משימות חדשות</p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={m.availableForTasks ? "default" : "outline"}
                            disabled={
                              setAvailable.isPending ||
                              m.availableForTasks ||
                              m.openTasks.length > 0
                            }
                            onClick={() => setAvailable.mutate({ roomId, available: true })}
                          >
                            זמין
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={!m.availableForTasks ? "default" : "outline"}
                            disabled={setAvailable.isPending || !m.availableForTasks}
                            onClick={() => setAvailable.mutate({ roomId, available: false })}
                          >
                            עסוק
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {showPromote ? (
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        <p className="text-muted-foreground text-xs">פעולות בעלים</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={promoteMember.isPending}
                          onClick={() => promoteMember.mutate({ roomId, memberId: m.id })}
                        >
                          {promoteMember.isPending ? "מקדמים…" : "קדם למשתתף מוביל"}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
