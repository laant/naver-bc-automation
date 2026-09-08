INSERT INTO "Job" ("id","type","status","linkId","scheduledAt","isScheduled","attempt","cancelRequested","publishAttempted","createdAt","errorMessage")
SELECT lower(hex(randomblob(16))), 'PUBLISH', 'NEEDS_REVIEW', "id", CURRENT_TIMESTAMP, 0, 0, 0, 1, CURRENT_TIMESTAMP, '이전 버전의 발행 결과를 블로그에서 확인하세요.' FROM "BrandLink" WHERE "status" = 'PUBLISHING';
UPDATE "BrandLink" SET "status" = 'NEEDS_REVIEW', "errorMessage" = '이전 버전 발행 결과 확인 필요' WHERE "status" = 'PUBLISHING';
