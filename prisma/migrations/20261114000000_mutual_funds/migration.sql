-- CreateTable
CREATE TABLE "MfScheme" (
    "code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isin" TEXT,
    "amc" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "nav" DOUBLE PRECISION NOT NULL,
    "navDate" DATE NOT NULL,
    "ret1m" DOUBLE PRECISION,
    "ret6m" DOUBLE PRECISION,
    "ret1y" DOUBLE PRECISION,
    "ret3y" DOUBLE PRECISION,
    "ret5y" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MfScheme_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "MfNav" (
    "code" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "nav" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MfNav_pkey" PRIMARY KEY ("code","date")
);

-- CreateIndex
CREATE INDEX "MfScheme_category_idx" ON "MfScheme"("category");

