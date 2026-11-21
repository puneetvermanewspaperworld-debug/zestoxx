-- GTT orders and symbol notes: additive only (new nullable or defaulted columns). Nothing is dropped, renamed or rewritten.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notes" JSONB;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "placedAtMs" DOUBLE PRECISION,
ADD COLUMN     "simulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "triggerSide" TEXT;

