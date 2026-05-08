"use client";

import { DeviceNameGate } from "@/components/device-name-gate";
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
      <DeviceNameGate>
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-10 md:py-14">
          <header className="space-y-2">
            <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">משימות צוות</h1>
            <p className="text-muted-foreground max-w-2xl text-base leading-relaxed">
              סריקת QR, הזנת קוד חדר בן־5 ספרות, או יצירת חדר חדש. בלי הרשמה — הצוות נשמר במכשיר הזה עד ניקוי עוגיות.
            </p>
          </header>

          <section className="space-y-4">
            <h2 className="text-lg font-medium">המכשיר שלך</h2>
            <SessionIsland />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-medium">הצטרפות או יצירה</h2>
            <RoomForms />
          </section>
        </main>
      </DeviceNameGate>
    </div>
  );
}
