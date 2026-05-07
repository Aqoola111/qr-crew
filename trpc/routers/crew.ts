import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MemberRole } from "@/app/generated/prisma/client";
import { clearSessionCookie, ensureBrowserSession } from "@/lib/session";
import { baseProcedure, createTRPCRouter, type Context } from "@/trpc/init";

function randomRoomCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/** Normalize user input to a 5-digit room code string. */
export function normalizeRoomCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Room code must contain digits",
    });
  }
  const tail = digits.slice(-5);
  return tail.padStart(5, "0").slice(-5);
}

/** Single display name per browser session; optional client input only until first save. */
async function resolveDisplayNameForSession(
  prisma: Context["prisma"],
  sessionId: string,
  inputDisplayName: string | undefined,
): Promise<{ name: string; persistNewName: boolean }> {
  const row = await prisma.browserSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { displayName: true },
  });
  const locked = row.displayName?.trim();
  if (locked) {
    const submitted = inputDisplayName?.trim();
    if (submitted && submitted !== locked) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Your name is already set on this device and cannot be changed here.",
      });
    }
    return { name: locked, persistNewName: false };
  }
  const submitted = inputDisplayName?.trim();
  if (!submitted) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Enter your name",
    });
  }
  return { name: submitted, persistNewName: true };
}

export const crewRouter = createTRPCRouter({
  me: baseProcedure.query(({ ctx }) => ctx.crew),

  createRoom: baseProcedure
    .input(
      z.object({
        displayName: z.string().max(80).trim().optional(),
        roomName: z.string().max(120).trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const browserSession = await ensureBrowserSession();

      const { name: displayName, persistNewName } = await resolveDisplayNameForSession(
        ctx.prisma,
        browserSession.id,
        input.displayName,
      );

      const result = await ctx.prisma.$transaction(async (tx) => {
        let code = "";
        for (let attempt = 0; attempt < 24; attempt++) {
          const candidate = randomRoomCode();
          const taken = await tx.room.findUnique({ where: { code: candidate } });
          if (!taken) {
            code = candidate;
            break;
          }
        }
        if (!code) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not allocate a room code",
          });
        }

        const room = await tx.room.create({
          data: {
            code,
            name: input.roomName ?? null,
          },
        });

        const member = await tx.member.create({
          data: {
            roomId: room.id,
            displayName,
            role: MemberRole.OWNER,
          },
        });

        await tx.sessionRoomMembership.create({
          data: {
            sessionId: browserSession.id,
            roomId: room.id,
            memberId: member.id,
          },
        });

        await tx.browserSession.update({
          where: { id: browserSession.id },
          data: {
            activeRoomId: room.id,
            ...(persistNewName ? { displayName } : {}),
          },
        });

        return { roomId: room.id, code: room.code, memberId: member.id };
      });

      return result;
    }),

  joinRoom: baseProcedure
    .input(
      z.object({
        code: z.string().min(1).max(32),
        displayName: z.string().max(80).trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const code = normalizeRoomCode(input.code);
      const room = await ctx.prisma.room.findUnique({ where: { code } });
      if (!room) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
      }

      const browserSession = await ensureBrowserSession();

      const existing = await ctx.prisma.sessionRoomMembership.findUnique({
        where: {
          sessionId_roomId: { sessionId: browserSession.id, roomId: room.id },
        },
      });

      if (existing) {
        await ctx.prisma.browserSession.update({
          where: { id: browserSession.id },
          data: { activeRoomId: room.id },
        });
        return {
          roomId: room.id,
          code: room.code,
          memberId: existing.memberId,
          rejoined: true as const,
        };
      }

      const { name: displayName, persistNewName } = await resolveDisplayNameForSession(
        ctx.prisma,
        browserSession.id,
        input.displayName,
      );

      const out = await ctx.prisma.$transaction(async (tx) => {
        const member = await tx.member.create({
          data: {
            roomId: room.id,
            displayName,
            role: MemberRole.MEMBER,
          },
        });
        await tx.sessionRoomMembership.create({
          data: {
            sessionId: browserSession.id,
            roomId: room.id,
            memberId: member.id,
          },
        });
        await tx.browserSession.update({
          where: { id: browserSession.id },
          data: {
            activeRoomId: room.id,
            ...(persistNewName ? { displayName } : {}),
          },
        });
        return { memberId: member.id };
      });

      return {
        roomId: room.id,
        code: room.code,
        memberId: out.memberId,
        rejoined: false as const,
      };
    }),

  setActiveRoom: baseProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.crew.session) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "No browser session" });
      }

      const membership = await ctx.prisma.sessionRoomMembership.findUnique({
        where: {
          sessionId_roomId: {
            sessionId: ctx.crew.session.id,
            roomId: input.roomId,
          },
        },
      });

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this room" });
      }

      await ctx.prisma.browserSession.update({
        where: { id: ctx.crew.session.id },
        data: { activeRoomId: input.roomId },
      });

      return { ok: true as const };
    }),

  /**
   * Remove this browser session and all Member rows linked to it.
   * Rooms stay. If you were OWNER and someone else can take over, a CONTRIBUTOR becomes OWNER (else another member).
   */
  forgetMe: baseProcedure.mutation(async ({ ctx }) => {
    if (!ctx.crew.session) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "No active session" });
    }

    const sessionId = ctx.crew.session.id;

    await ctx.prisma.$transaction(async (tx) => {
      const links = await tx.sessionRoomMembership.findMany({
        where: { sessionId },
        include: { member: true },
      });

      for (const link of links) {
        const leaving = link.member;

        const others = await tx.member.findMany({
          where: { roomId: leaving.roomId, id: { not: leaving.id } },
        });

        if (leaving.role === MemberRole.OWNER && others.length > 0) {
          const contributors = others.filter((o) => o.role === MemberRole.CONTRIBUTOR);
          const pool = contributors.length > 0 ? contributors : others;
          pool.sort((a, b) => a.id.localeCompare(b.id));
          const nextOwner = pool[0];
          if (nextOwner) {
            await tx.member.update({
              where: { id: nextOwner.id },
              data: { role: MemberRole.OWNER },
            });
          }
        }

        await tx.member.delete({ where: { id: leaving.id } });
      }

      await tx.browserSession.delete({ where: { id: sessionId } });
    });

    await clearSessionCookie();

    return { ok: true as const };
  }),
});
