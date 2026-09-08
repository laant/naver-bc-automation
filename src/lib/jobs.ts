import { prisma } from "./db";
import { requireConfig } from "./config";
import { sessionStatus } from "./automation/session";
export const active = ["QUEUED", "RUNNING"];
export async function enqueue(
  linkId: string,
  type: string,
  scheduledAt?: unknown,
) {
  if (!["SCRAPE", "GENERATE", "PUBLISH"].includes(type))
    throw new Error("지원하지 않는 작업");
  if (type === "GENERATE") requireConfig(true);
  if (type === "PUBLISH" && !(await sessionStatus()).isValid)
    throw new Error("먼저 로그인 상태 확인을 실행하세요.");
  if (
    scheduledAt !== undefined &&
    (typeof scheduledAt !== "string" || !scheduledAt)
  )
    throw new Error("예약 시간 형식이 잘못되었습니다.");
  const at =
    typeof scheduledAt === "string" ? new Date(scheduledAt) : new Date();
  if (
    !Number.isFinite(at.getTime()) ||
    (scheduledAt && at.getTime() <= Date.now())
  )
    throw new Error("미래 예약 시간을 입력하세요.");
  return prisma.$transaction(async (tx) => {
    const link = await tx.brandLink.findUniqueOrThrow({
      where: { id: linkId },
      include: { posts: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (
      await tx.job.count({
        where: { linkId, status: { in: [...active, "NEEDS_REVIEW"] } },
      })
    )
      throw new Error("진행 중이거나 결과 확인이 필요한 작업이 있습니다.");
    if (link.status === "PUBLISHED") throw new Error("이미 발행된 상품입니다.");
    if (type === "GENERATE" && !link.productData)
      throw new Error("먼저 상품 정보를 수집하세요.");
    const post = link.posts[0];
    if (
      type === "PUBLISH" &&
      (!post ||
        post.reviewedVersion !== post.version ||
        post.status !== "REVIEWED")
    )
      throw new Error("초안을 저장하고 검토 완료로 표시하세요.");
    const job = await tx.job.create({
      data: {
        linkId,
        type,
        postId: type === "PUBLISH" ? post.id : null,
        scheduledAt: at,
        isScheduled: !!scheduledAt,
      },
    });
    await tx.brandLink.update({
      where: { id: linkId },
      data: { status: "QUEUED", errorMessage: null },
    });
    return job;
  });
}
export async function cancelJob(id: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUniqueOrThrow({ where: { id } });
    if (job.status === "QUEUED") {
      await tx.job.update({
        where: { id },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });
      await tx.brandLink.update({
        where: { id: job.linkId },
        data: { status: "READY" },
      });
    } else if (job.status === "RUNNING" && !job.publishAttempted) {
      await tx.job.update({ where: { id }, data: { cancelRequested: true } });
    } else
      throw new Error(
        "현재 단계에서는 취소할 수 없습니다. 게시 결과를 확인하세요.",
      );
  });
}
export async function recoverJobs() {
  const stale = await prisma.job.findMany({
    where: {
      status: "RUNNING",
      heartbeatAt: { lt: new Date(Date.now() - 120000) },
    },
  });
  for (const job of stale) {
    await prisma.$transaction(async (tx) => {
      const status = job.type === "PUBLISH" ? "NEEDS_REVIEW" : "FAILED";
      const claimed = await tx.job.updateMany({
        where: {
          id: job.id,
          status: "RUNNING",
          heartbeatAt: { lt: new Date(Date.now() - 120000) },
        },
        data: {
          status,
          finishedAt: new Date(),
          errorMessage:
            "워커가 중단되었습니다. 결과를 확인한 뒤 다시 실행하세요.",
        },
      });
      if (claimed.count)
        await tx.brandLink.update({
          where: { id: job.linkId },
          data: {
            status,
            errorMessage: "워커 중단으로 결과 확인이 필요합니다.",
          },
        });
    });
  }
}
