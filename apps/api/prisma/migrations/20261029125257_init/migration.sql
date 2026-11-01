-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "isAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "targetScore" INTEGER NOT NULL DEFAULT 100,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "activePlayerId" TEXT NOT NULL,
    "player1GlobalScore" INTEGER NOT NULL DEFAULT 0,
    "player2GlobalScore" INTEGER NOT NULL DEFAULT 0,
    "currentRoundScore" INTEGER NOT NULL DEFAULT 0,
    "lastDie1" INTEGER,
    "lastDie2" INTEGER,
    "lastOutcome" TEXT,
    "winnerId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Game_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Game_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Game_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Game_player1Id_idx" ON "Game"("player1Id");

-- CreateIndex
CREATE INDEX "Game_player2Id_idx" ON "Game"("player2Id");
