import "dotenv/config";
import { enqueue } from "../src/lib/jobs";
import { prisma } from "../src/lib/db";
const id = process.argv[2];
(async () => {
  if (!id) throw new Error("상품 ID를 입력하세요.");
  await enqueue(id, "PUBLISH");
  console.log("발행 작업 등록 완료. npm run worker가 실행 중이어야 합니다.");
})()
  .catch(() => {
    console.error("발행 등록 실패: 로그인 및 검토한 초안을 확인하세요.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
