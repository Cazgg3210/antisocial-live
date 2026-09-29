import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env, isProd } from "@/lib/env";
import { forbidden, unauthorized } from "@/lib/errors";
import type { Role } from "@/generated/prisma/enums";
import { signToken, verifyToken } from "./jwt";

export const ADMIN_COOKIE = "al_admin";
const TTL = 60 * 60 * 12; // 12h: covers a full event night

export interface AdminSession {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  roles: { role: Role; eventId: string | null }[];
}

export async function createAdminSession(userId: string): Promise<void> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } });
  const token = await signToken(
    {
      sub: user.id,
      org: user.organizationId,
      email: user.email,
      name: user.name,
      roles: user.roles.map((r) => ({ role: r.role, eventId: r.eventId })),
    },
    env().AUTH_SECRET,
    TTL,
  );
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    maxAge: TTL,
  });
}

export async function destroyAdminSession(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken<{
    sub: string;
    org: string;
    email: string;
    name: string;
    roles: { role: Role; eventId: string | null }[];
  }>(token, env().AUTH_SECRET);
  if (!payload) return null;
  return { userId: payload.sub, organizationId: payload.org, email: payload.email, name: payload.name, roles: payload.roles };
}

export async function requireAdmin(): Promise<AdminSession> {
  const s = await getAdminSession();
  if (!s) throw unauthorized("Admin session required");
  return s;
}

const ROLE_RANK: Record<Role, number> = {
  SUPER_ADMIN: 100,
  ORGANIZATION_ADMIN: 90,
  EVENT_MANAGER: 70,
  STAGE_OPERATOR: 50,
  STAFF_COORDINATOR: 40,
};

/** True when the session holds `role` (or a higher one) globally or for the given event. */
export function hasRole(session: AdminSession, role: Role, eventId?: string): boolean {
  return session.roles.some(
    (r) => ROLE_RANK[r.role] >= ROLE_RANK[role] && (r.eventId === null || (eventId !== undefined && r.eventId === eventId)),
  );
}

export async function requireRole(role: Role, eventId?: string): Promise<AdminSession> {
  const s = await requireAdmin();
  if (!hasRole(s, role, eventId)) throw forbidden(`Requires role ${role}`);
  return s;
}
