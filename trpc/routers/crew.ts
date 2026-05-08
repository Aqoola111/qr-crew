import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MemberRole, TaskStatus, TaskUrgency } from "@/app/generated/prisma/client";
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
      message: "הקוד חייב לכלול ספרות",
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
        message: "השם כבר נשמר במכשיר הזה ולא ניתן לשנות כאן.",
      });
    }
    return { name: locked, persistNewName: false };
  }
  const submitted = inputDisplayName?.trim();
  if (!submitted) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "הזינו שם",
    });
  }
  return { name: submitted, persistNewName: true };
}

async function requireRoomMember(
  ctx: Context,
  roomId: string,
): Promise<{ memberId: string; role: MemberRole }> {
  if (!ctx.crew.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "אין סשן בדפדפן" });
  }

  const link = await ctx.prisma.sessionRoomMembership.findUnique({
    where: {
      sessionId_roomId: { sessionId: ctx.crew.session.id, roomId },
    },
    include: { member: { select: { id: true, role: true } } },
  });

  if (!link) {
    throw new TRPCError({ code: "FORBIDDEN", message: "לא חבר בחדר הזה" });
  }

  return { memberId: link.member.id, role: link.member.role };
}

function canAssignTasks(role: MemberRole): boolean {
  return role === MemberRole.OWNER || role === MemberRole.CONTRIBUTOR;
}

/** Tasks that still block availability / count as active work. */
const ACTIVE_TASK_STATUSES: TaskStatus[] = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS];

function urgencySortValue(u: TaskUrgency): number {
  switch (u) {
    case TaskUrgency.URGENT:
      return 4;
    case TaskUrgency.HIGH:
      return 3;
    case TaskUrgency.MEDIUM:
      return 2;
    case TaskUrgency.LOW:
    default:
      return 1;
  }
}

export const crewRouter = createTRPCRouter({
  me: baseProcedure.query(({ ctx }) => ctx.crew),

  /** First visit: create cookie session if needed, set display name + stable local user id from the browser. */
  registerDeviceProfile: baseProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(80).trim(),
        localUserId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const browserSession = await ensureBrowserSession();

      const row = await ctx.prisma.browserSession.findUniqueOrThrow({
        where: { id: browserSession.id },
        select: { displayName: true, localUserId: true },
      });

      if (row.displayName?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "השם כבר נשמר במכשיר הזה.",
        });
      }

      if (row.localUserId && row.localUserId !== input.localUserId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "הסשן כבר מקושר לפרופיל מכשיר אחר.",
        });
      }

      await ctx.prisma.browserSession.update({
        where: { id: browserSession.id },
        data: {
          displayName: input.displayName,
          localUserId: input.localUserId,
        },
      });

      return { ok: true as const, sessionId: browserSession.id };
    }),

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
            message: "לא ניתן היה להקצות קוד חדר",
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
        throw new TRPCError({ code: "NOT_FOUND", message: "החדר לא נמצא" });
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
        throw new TRPCError({ code: "UNAUTHORIZED", message: "אין סשן בדפדפן" });
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
        throw new TRPCError({ code: "FORBIDDEN", message: "לא חבר בחדר הזה" });
      }

      await ctx.prisma.browserSession.update({
        where: { id: ctx.crew.session.id },
        data: { activeRoomId: input.roomId },
      });

      return { ok: true as const };
    }),

  /** Room owner promotes a member to contributor (cannot promote self or other owners). */
  promoteMember: baseProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        memberId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId: actorId, role } = await requireRoomMember(ctx, input.roomId);

      if (role !== MemberRole.OWNER) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "רק בעל החדר יכול לקדם חברים.",
        });
      }

      if (input.memberId === actorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "לא ניתן לקדם את עצמך." });
      }

      const target = await ctx.prisma.member.findFirst({
        where: { id: input.memberId, roomId: input.roomId },
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "החבר לא נמצא בחדר הזה." });
      }

      if (target.role !== MemberRole.MEMBER) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: 'ניתן לקדם לתפקיד "משתתף מוביל" רק חברים בתפקיד "חבר".',
        });
      }

      await ctx.prisma.member.update({
        where: { id: target.id },
        data: { role: MemberRole.CONTRIBUTOR },
      });

      return { ok: true as const };
    }),

  roomMembers: baseProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requireRoomMember(ctx, input.roomId);

      const room = await ctx.prisma.room.findUniqueOrThrow({
        where: { id: input.roomId },
        select: { id: true, code: true, name: true },
      });

      const members = await ctx.prisma.member.findMany({
        where: { roomId: input.roomId },
        orderBy: { displayName: "asc" },
        select: {
          id: true,
          displayName: true,
          role: true,
          availableForTasks: true,
          assignedTasks: {
            where: { status: { in: ACTIVE_TASK_STATUSES } },
            select: { id: true, title: true, status: true, urgency: true },
            orderBy: { createdAt: "desc" },
          },
          sessionMemberships: {
            where: { roomId: input.roomId },
            select: {
              session: {
                select: {
                  activeRoomId: true,
                  activeRoom: {
                    select: { code: true, name: true },
                  },
                },
              },
            },
          },
        },
      });

      return {
        room,
        members: members.map((m) => {
          const link = m.sessionMemberships[0];
          const session = link?.session;
          const activeId = session?.activeRoomId ?? null;

          let presence: "ACTIVE_HERE" | "OTHER_ROOM" | "NO_ACTIVE_ROOM" | "UNKNOWN";
          let focusRoomCode: string | null = null;
          let focusRoomName: string | null = null;

          if (!session) {
            presence = "UNKNOWN";
          } else if (activeId === input.roomId) {
            presence = "ACTIVE_HERE";
          } else if (activeId === null) {
            presence = "NO_ACTIVE_ROOM";
          } else {
            presence = "OTHER_ROOM";
            focusRoomCode = session.activeRoom?.code ?? null;
            focusRoomName = session.activeRoom?.name ?? null;
          }

          const { sessionMemberships: _, ...rest } = m;
          return {
            id: rest.id,
            displayName: rest.displayName,
            role: rest.role,
            availableForTasks: rest.availableForTasks,
            openTasks: rest.assignedTasks,
            presence,
            focusRoomCode,
            focusRoomName,
          };
        }),
      };
    }),

  setAvailableForTasks: baseProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        available: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId } = await requireRoomMember(ctx, input.roomId);

      if (input.available) {
        const open = await ctx.prisma.task.count({
          where: { assigneeId: memberId, status: { in: ACTIVE_TASK_STATUSES } },
        });
        if (open > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "סיימו את המשימות הפתוחות (או שמוביל יסמן שהושלמו) לפני שמסמנים את עצמכם כזמינים.",
          });
        }
      }

      await ctx.prisma.member.update({
        where: { id: memberId },
        data: { availableForTasks: input.available },
      });

      return { ok: true as const };
    }),

  roomTasks: baseProcedure
    .input(z.object({ roomId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { role } = await requireRoomMember(ctx, input.roomId);

      const taskSelect = {
        id: true,
        title: true,
        description: true,
        urgency: true,
        pendingApproval: true,
        status: true,
        assigneeId: true,
        createdAt: true,
        assignee: { select: { id: true, displayName: true } },
        createdBy: { select: { id: true, displayName: true } },
      } as const;

      const published = await ctx.prisma.task.findMany({
        where: {
          roomId: input.roomId,
          pendingApproval: false,
          status: { in: ACTIVE_TASK_STATUSES },
        },
        select: taskSelect,
      });

      published.sort((a, b) => {
        const du = urgencySortValue(b.urgency) - urgencySortValue(a.urgency);
        if (du !== 0) return du;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      let pendingSuggestions: typeof published = [];
      if (canAssignTasks(role)) {
        const raw = await ctx.prisma.task.findMany({
          where: {
            roomId: input.roomId,
            pendingApproval: true,
            status: { in: ACTIVE_TASK_STATUSES },
          },
          select: taskSelect,
        });
        pendingSuggestions = raw.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }

      const historyRaw = await ctx.prisma.task.findMany({
        where: {
          roomId: input.roomId,
          pendingApproval: false,
          status: TaskStatus.DONE,
          completedAt: { not: null },
        },
        take: 100,
        select: {
          id: true,
          title: true,
          urgency: true,
          createdAt: true,
          claimedAt: true,
          inProgressAt: true,
          completedAt: true,
          assignee: { select: { id: true, displayName: true } },
          completedBy: { select: { id: true, displayName: true } },
          createdBy: { select: { id: true, displayName: true } },
        },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
      });

      const seenHistory = new Set<string>();
      const history = historyRaw
        .filter((row) => {
          if (seenHistory.has(row.id)) return false;
          seenHistory.add(row.id);
          return true;
        })
        .map((row) => {
          const end = row.completedAt!;
          const start = row.inProgressAt ?? row.claimedAt ?? row.createdAt;
          const durationMs = Math.max(0, end.getTime() - start.getTime());
          const durationBasis = row.inProgressAt
            ? ("in_progress" as const)
            : row.claimedAt
              ? ("claimed" as const)
              : ("created" as const);
          return {
            ...row,
            durationMs,
            durationBasis,
          };
        });

      return { published, pendingSuggestions, history };
    }),

  createRoomTask: baseProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        title: z.string().min(1).max(200).trim(),
        description: z.string().max(5000).optional(),
        urgency: z.nativeEnum(TaskUrgency),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId, role } = await requireRoomMember(ctx, input.roomId);

      if (!canAssignTasks(role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "רק בעלים ומשתתפים מובילים יכולים להוסיף משימות.",
        });
      }

      await ctx.prisma.task.create({
        data: {
          roomId: input.roomId,
          title: input.title,
          description: input.description?.trim() || null,
          urgency: input.urgency,
          pendingApproval: false,
          status: TaskStatus.OPEN,
          assigneeId: null,
          createdById: memberId,
        },
      });

      return { ok: true as const };
    }),

  suggestRoomTask: baseProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        title: z.string().min(1).max(200).trim(),
        description: z.string().max(5000).optional(),
        urgency: z.nativeEnum(TaskUrgency),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId, role } = await requireRoomMember(ctx, input.roomId);

      if (role !== MemberRole.MEMBER) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "רק חברים שולחים הצעות — בעלים ומובילים מוסיפים משימה ישירות.",
        });
      }

      await ctx.prisma.task.create({
        data: {
          roomId: input.roomId,
          title: input.title,
          description: input.description?.trim() || null,
          urgency: input.urgency,
          pendingApproval: true,
          status: TaskStatus.OPEN,
          assigneeId: null,
          createdById: memberId,
        },
      });

      return { ok: true as const };
    }),

  acceptRoomTaskSuggestion: baseProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        taskId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role } = await requireRoomMember(ctx, input.roomId);

      if (!canAssignTasks(role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "רק בעלים ומובילים יכולים לאשר הצעות.",
        });
      }

      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          roomId: input.roomId,
          pendingApproval: true,
        },
      });

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ההצעה לא נמצאה או שכבר טופלה." });
      }

      await ctx.prisma.task.update({
        where: { id: task.id },
        data: { pendingApproval: false },
      });

      return { ok: true as const };
    }),

  claimRoomTask: baseProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        taskId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId } = await requireRoomMember(ctx, input.roomId);

      await ctx.prisma.$transaction(async (tx) => {
        const result = await tx.task.updateMany({
          where: {
            id: input.taskId,
            roomId: input.roomId,
            assigneeId: null,
            pendingApproval: false,
            status: TaskStatus.OPEN,
          },
          data: { assigneeId: memberId, claimedAt: new Date() },
        });

        if (result.count !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "המשימה כבר לא זמינה לשארה.",
          });
        }

        await tx.member.update({
          where: { id: memberId },
          data: { availableForTasks: false },
        });
      });

      return { ok: true as const };
    }),

  startTask: baseProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        taskId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId, role } = await requireRoomMember(ctx, input.roomId);

      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          roomId: input.roomId,
          status: TaskStatus.OPEN,
        },
        select: { id: true, assigneeId: true, createdById: true, inProgressAt: true },
      });

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "המשימה לא נמצאה או שכבר בתהליך או הושלמה",
        });
      }

      if (!task.assigneeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "יש לשאר את המשימה לפני תחילת עבודה.",
        });
      }

      const canStart =
        task.assigneeId === memberId || task.createdById === memberId || canAssignTasks(role);

      if (!canStart) {
        throw new TRPCError({ code: "FORBIDDEN", message: "אין הרשאה להתחיל את המשימה" });
      }

      await ctx.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.IN_PROGRESS,
          ...(task.inProgressAt == null ? { inProgressAt: new Date() } : {}),
        },
      });

      return { ok: true as const };
    }),

  completeTask: baseProcedure
    .input(
      z.object({
        roomId: z.string().min(1),
        taskId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId, role } = await requireRoomMember(ctx, input.roomId);

      const task = await ctx.prisma.task.findFirst({
        where: {
          id: input.taskId,
          roomId: input.roomId,
          status: { in: ACTIVE_TASK_STATUSES },
        },
      });

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND", message: "המשימה לא נמצאה או שכבר הושלמה" });
      }

      if (!task.assigneeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "יש לשאר את המשימה לפני סימון כהושלמה.",
        });
      }

      const canComplete =
        task.assigneeId === memberId ||
        task.createdById === memberId ||
        canAssignTasks(role);

      if (!canComplete) {
        throw new TRPCError({ code: "FORBIDDEN", message: "אין הרשאה לעדכן את המשימה" });
      }

      const assigneeId = task.assigneeId;

      await ctx.prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.DONE,
            completedAt: new Date(),
            completedById: memberId,
          },
        });
        const remaining = await tx.task.count({
          where: { assigneeId, status: { in: ACTIVE_TASK_STATUSES } },
        });
        if (remaining === 0) {
          await tx.member.update({
            where: { id: assigneeId },
            data: { availableForTasks: true },
          });
        }
      });

      return { ok: true as const };
    }),

  /**
   * Remove this browser session and all Member rows linked to it.
   * Rooms stay. If you were OWNER and someone else can take over, a CONTRIBUTOR becomes OWNER (else another member).
   */
  forgetMe: baseProcedure.mutation(async ({ ctx }) => {
    if (!ctx.crew.session) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "אין סשן פעיל" });
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
