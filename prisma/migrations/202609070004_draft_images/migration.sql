ALTER TABLE "Post" ADD COLUMN "imageUrls" TEXT;
CREATE UNIQUE INDEX "Job_one_active_link" ON "Job"("linkId") WHERE "status" IN ('QUEUED', 'RUNNING', 'NEEDS_REVIEW');
