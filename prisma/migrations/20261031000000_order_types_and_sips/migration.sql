-- Order metadata (GTD / SIP / day-limit) and Stock SIP plans. Additive: existing orders
-- keep working and read back as MARKET (or LIMIT where mode was "limit").

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "expiryDate" TEXT,
ADD COLUMN     "orderType" TEXT NOT NULL DEFAULT 'MARKET',
ADD COLUMN     "placedDate" TEXT;

-- CreateTable
CREATE TABLE "Sip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "nextDate" TEXT NOT NULL,
    "anchorDay" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "installments" INTEGER NOT NULL DEFAULT 0,
    "createdLabel" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sip_userId_idx" ON "Sip"("userId");

-- AddForeignKey
ALTER TABLE "Sip" ADD CONSTRAINT "Sip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
