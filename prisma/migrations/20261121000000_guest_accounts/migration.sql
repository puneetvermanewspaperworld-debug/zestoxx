-- Guest accounts: additive only (new columns with defaults, one new table, new indexes). Nothing is dropped, renamed or rewritten.
-- Existing users get kind = 'member', so the inactive-guest cleanup can never touch them; the shared demo user stays as it is until it is claimed.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'member',
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tokenHash" TEXT;

-- CreateTable
CREATE TABLE "GuestCreation" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestCreation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestCreation_ipHash_createdAt_idx" ON "GuestCreation"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "GuestCreation_createdAt_idx" ON "GuestCreation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_tokenHash_key" ON "User"("tokenHash");

-- CreateIndex
CREATE INDEX "User_kind_lastSeenAt_idx" ON "User"("kind", "lastSeenAt");

