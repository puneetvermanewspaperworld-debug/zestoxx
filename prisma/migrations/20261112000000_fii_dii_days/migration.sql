-- Daily FII/DII institutional activity: cash flows (NSE provisional JSON) and FII index-futures positions (participant-wise OI file).
-- Additive: a new table only.

-- CreateTable
CREATE TABLE "FiiDiiDay" (
    "date" TEXT NOT NULL,
    "fiiBuy" DOUBLE PRECISION,
    "fiiSell" DOUBLE PRECISION,
    "fiiNet" DOUBLE PRECISION,
    "diiBuy" DOUBLE PRECISION,
    "diiSell" DOUBLE PRECISION,
    "diiNet" DOUBLE PRECISION,
    "fiiIdxFutLong" INTEGER,
    "fiiIdxFutShort" INTEGER,
    "provisional" BOOLEAN NOT NULL DEFAULT true,
    "cashFetchedAt" TIMESTAMP(3),
    "oiFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiiDiiDay_pkey" PRIMARY KEY ("date")
);
