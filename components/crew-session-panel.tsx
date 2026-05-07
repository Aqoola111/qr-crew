"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDownIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Loaded inside `<Suspense>` — uses TanStack `useSuspenseQuery` + `queryOptions` from tRPC docs. */
export function CrewSessionPanel() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [forgetOpen, setForgetOpen] = useState(false);

  const setActiveRoom = useMutation({
    ...trpc.crew.setActiveRoom.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(trpc.crew.me.queryFilter());
    },
    onError: (e) => toast.error(e.message),
  });

  const forgetMe = useMutation({
    ...trpc.crew.forgetMe.mutationOptions(),
    onSuccess: async () => {
      toast.success("This device’s session was cleared.");
      await queryClient.invalidateQueries(trpc.crew.me.queryFilter());
      router.refresh();
      setForgetOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: crew } = useSuspenseQuery(trpc.crew.me.queryOptions());

  if (!crew.session) {
    return (
      <p className="text-muted-foreground text-sm">
        No room session yet — create or join a room below. Your crew stays on this device via a cookie.
      </p>
    );
  }

  const active = crew.activeMembership;
  const memberships = crew.memberships;
  const deviceName = crew.session.displayName?.trim();

  async function goToRoom(roomId: string) {
    await setActiveRoom.mutateAsync({ roomId });
    router.push(`/room/${roomId}`);
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          Browser session active.
          {deviceName ? (
            <>
              {" "}
              You’re <span className="font-medium text-foreground">{deviceName}</span> on this device.
            </>
          ) : null}
          {memberships.length > 0
            ? ` ${memberships.length} room${memberships.length === 1 ? "" : "s"} saved.`
            : ""}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {memberships.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 min-w-48 justify-between gap-2 font-normal sm:min-w-56"
                  disabled={setActiveRoom.isPending}
                >
                  <span className="truncate">
                    {active ? (
                      <>
                        <span className="font-mono font-medium">{active.room.code}</span>
                        {active.room.name ? (
                          <span className="text-muted-foreground"> · {active.room.name}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Choose a room</span>
                    )}
                  </span>
                  <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[min(100vw-2rem,var(--radix-dropdown-menu-trigger-width))] min-w-48">
                <DropdownMenuLabel>Your rooms</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {memberships.map((m) => {
                  const isActive = active?.roomId === m.roomId;
                  return (
                    <DropdownMenuItem
                      key={m.roomId}
                      className="gap-2"
                      onSelect={() => {
                        void goToRoom(m.roomId);
                      }}
                    >
                      <span className="font-mono">{m.room.code}</span>
                      {m.room.name ? (
                        <span className="text-muted-foreground truncate">{m.room.name}</span>
                      ) : null}
                      {isActive ? <CheckIcon className="text-primary ml-auto size-4 shrink-0" /> : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          <AlertDialog open={forgetOpen} onOpenChange={setForgetOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Forget this device"
                disabled={forgetMe.isPending || setActiveRoom.isPending}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Forget this device?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    This removes your crew profile and room memberships from this browser. Rooms are not deleted.
                  </span>
                  <span className="block">
                    If you owned a room and at least one contributor remains, one contributor becomes the owner.
                    Otherwise another remaining member becomes the owner when needed.
                  </span>
                  <span className="block font-medium text-foreground">You cannot undo this.</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={forgetMe.isPending}>Cancel</AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={forgetMe.isPending}
                  onClick={() => void forgetMe.mutateAsync()}
                >
                  {forgetMe.isPending ? "Clearing…" : "Forget me"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {active ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active room</CardTitle>
            <CardDescription>
              Code <span className="font-mono font-semibold">{active.room.code}</span>
              {active.room.name ? ` · ${active.room.name}` : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            You appear as <span className="font-medium text-foreground">{active.member.displayName}</span> (
            {active.member.role})
          </CardContent>
        </Card>
      ) : memberships.length > 0 ? (
        <p className="text-muted-foreground">Use the menu above to open a room.</p>
      ) : (
        <p className="text-muted-foreground">Join or create a room below.</p>
      )}
    </div>
  );
}
