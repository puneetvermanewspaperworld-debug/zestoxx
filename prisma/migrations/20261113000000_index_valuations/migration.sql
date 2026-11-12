-- Daily P/E, P/B and dividend yield per NSE index (from the index closing file), with the closing level.
-- Additive: a new table only.

-- CreateTable
CREATE TABLE "IndexValuation" (
    "indexName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "pe" DOUBLE PRECISION,
    "pb" DOUBLE PRECISION,
    "divYield" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexValuation_pkey" PRIMARY KEY ("indexName","date")
);

-- CreateIndex
CREATE INDEX "IndexValuation_date_idx" ON "IndexValuation"("date");
