import { prisma } from "@/lib/db";
import type { User } from "@prisma/client";

/**
 * There is no real authentication yet (handoff brief — accounts come later). Until
 * then the whole app operates as one shared "demo" user. When you wire up real auth
 * (NextAuth / Clerk / Supabase Auth / …), this is the only function that changes:
 * read the session, look the user up (or create on first sign-in), return it.
 */
export const DEMO_USER_EMAIL = "demo@zestoxx.local";

export async function getCurrentUser(): Promise<User> {
  return prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, name: "Demo Trader" },
  });
}
