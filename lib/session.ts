import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { BrowserSession, Member, Room, SessionRoomMembership } from "@/app/generated/prisma/client";

export const CREW_SESSION_COOKIE = "crew_session";

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 400; // ~400 days

export type MembershipWithRoomMember = SessionRoomMembership & {
  room: Room;
  member: Member;
};

export type ResolvedCrewContext =
  | {
      session: BrowserSession;
      memberships: MembershipWithRoomMember[];
      activeMembership: MembershipWithRoomMember | null;
    }
  | {
      session: null;
      memberships: [];
      activeMembership: null;
    };

function cookieBaseOptions() {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure,
    path: "/" as const,
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export async function getSessionTokenFromCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(CREW_SESSION_COOKIE)?.value;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(CREW_SESSION_COOKIE, token, cookieBaseOptions());
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(CREW_SESSION_COOKIE, "", { ...cookieBaseOptions(), maxAge: 0 });
}

function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** Ensure a BrowserSession exists and the cookie is set. Used by join/create room flows. */
export async function ensureBrowserSession(): Promise<BrowserSession> {
  const existingToken = await getSessionTokenFromCookie();
  if (existingToken) {
    const existing = await prisma.browserSession.findUnique({ where: { token: existingToken } });
    if (existing) return existing;
  }

  const token = newSessionToken();
  const session = await prisma.browserSession.create({
    data: { token },
  });
  await setSessionCookie(token);
  return session;
}

/** Resolve opaque cookie token into session, room memberships, and active member (for swap). */
export async function resolveCrewSession(): Promise<ResolvedCrewContext> {
  const token = await getSessionTokenFromCookie();
  if (!token) {
    return { session: null, memberships: [], activeMembership: null };
  }

  const session = await prisma.browserSession.findUnique({
    where: { token },
    include: {
      memberships: {
        include: { room: true, member: true },
      },
    },
  });

  if (!session) {
    return { session: null, memberships: [], activeMembership: null };
  }

  const memberships = session.memberships;
  let activeMembership: MembershipWithRoomMember | null = null;

  if (session.activeRoomId) {
    activeMembership =
      memberships.find((m) => m.roomId === session.activeRoomId) ?? null;
  }

  if (!activeMembership && memberships.length > 0) {
    activeMembership = memberships[0] ?? null;
  }

  const sessionRow: BrowserSession = {
    id: session.id,
    token: session.token,
    displayName: session.displayName,
    activeRoomId: session.activeRoomId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };

  return {
    session: sessionRow,
    memberships,
    activeMembership,
  };
}
