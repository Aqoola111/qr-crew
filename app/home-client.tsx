"use client";

import dynamic from "next/dynamic";
import { RoomForms } from "@/components/room-forms";
import { Skeleton } from "@/components/ui/skeleton";

const SessionIsland = dynamic(
  () => import("@/components/session-island").then((m) => m.SessionIsland),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2">
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-24 w-full max-w-lg rounded-lg" />
      </div>
    ),
  },
);

export function HomeContent() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-10 md:py-14">
        <header className="space-y-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Crew tasks</h1>
          <p className="text-muted-foreground max-w-2xl text-base leading-relaxed">
            Scan a QR, enter a 5-digit room code, or create a room. No accounts — your crew stays on this device until you
            clear cookies.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Your session</h2>
          <SessionIsland />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Join or create</h2>
          <RoomForms />
        </section>
      </main>
    </div>
  );
}
