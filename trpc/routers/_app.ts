import { createTRPCRouter } from "@/trpc/init";
import { crewRouter } from "@/trpc/routers/crew";

export const appRouter = createTRPCRouter({
  crew: crewRouter,
});

export type AppRouter = typeof appRouter;
