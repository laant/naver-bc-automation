-- AlterTable
ALTER TABLE "BrandLink" ADD COLUMN "productData" TEXT;
ALTER TABLE "BrandLink" ADD COLUMN "scrapedAt" DATETIME;

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "linkId" TEXT NOT NULL,
    "postId" TEXT,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isScheduled" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "heartbeatAt" DATETIME,
    "lockToken" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "publishAttempted" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "BrandLink" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkerLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "topicSeed" TEXT,
    "title" TEXT,
    "contentHtml" TEXT,
    "keywords" TEXT,
    "brandLinks" TEXT,
    "category" TEXT,
    "tags" TEXT,
    "tone" TEXT,
    "finalUrl" TEXT,
    "screenshotPath" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    "linkId" TEXT,
    "sections" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewedVersion" INTEGER,
    CONSTRAINT "Post_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "BrandLink" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("brandLinks", "category", "contentHtml", "createdAt", "date", "errorMessage", "finalUrl", "id", "keywords", "publishedAt", "retryCount", "scheduledAt", "screenshotPath", "status", "tags", "title", "tone", "topicSeed", "updatedAt") SELECT "brandLinks", "category", "contentHtml", "createdAt", "date", "errorMessage", "finalUrl", "id", "keywords", "publishedAt", "retryCount", "scheduledAt", "screenshotPath", "status", "tags", "title", "tone", "topicSeed", "updatedAt" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE INDEX "Post_date_idx" ON "Post"("date");
CREATE INDEX "Post_status_idx" ON "Post"("status");
CREATE INDEX "Post_scheduledAt_idx" ON "Post"("scheduledAt");
CREATE TABLE "new_Log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT,
    "postId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "screenshotPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Log_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Log_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Log" ("action", "createdAt", "id", "message", "postId", "screenshotPath", "status") SELECT "action", "createdAt", "id", "message", "postId", "screenshotPath", "status" FROM "Log";
DROP TABLE "Log";
ALTER TABLE "new_Log" RENAME TO "Log";
CREATE INDEX "Log_postId_idx" ON "Log"("postId");
CREATE INDEX "Log_createdAt_idx" ON "Log"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Job_status_scheduledAt_idx" ON "Job"("status", "scheduledAt");

