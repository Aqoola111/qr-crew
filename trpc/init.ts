import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { prisma } from "@/lib/prisma";
import { resolveCrewSession } from "@/lib/session";

/**
 * Shared across the HTTP handler (pass `req.headers`) and RSC server helpers (`headers()` from Next).
 */
export async function createTRPCContext(opts: { headers: Headers }) {
  void opts.headers;
  const crew = await resolveCrewSession();
  return { prisma, crew };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;
