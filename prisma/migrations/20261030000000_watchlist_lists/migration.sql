-- Custom watchlists: every row now belongs to a named list. Existing rows keep the
-- default, which is the primary "My Watchlist" — nothing is moved or lost.

-- DropIndex
DROP INDEX "Watchlist_userId_symbol_key";

-- AlterTable
ALTER TABLE "Watchlist" ADD COLUMN     "listName" TEXT NOT NULL DEFAULT 'My Watchlist';

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_listName_symbol_key" ON "Watchlist"("userId", "listName", "symbol");
