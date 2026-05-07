"use client";

import { Suspense } from "react";
import { CrewSessionPanel } from "@/components/crew-session-panel";
import { Skeleton } from "@/components/ui/skeleton";

function Fallback() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-24 w-full max-w-lg rounded-lg" />
    </div>
  );
}

/** Client-only Suspense boundary around `useSuspenseQuery` (avoids SSR fetch during `next build`). */
export function SessionIsland() {
  return (
    <Suspense fallback={<Fallback />}>
      <CrewSessionPanel />
    </Suspense>
  );
}
