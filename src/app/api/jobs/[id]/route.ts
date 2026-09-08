import { prisma } from "@/lib/db";
import { cancelJob } from "@/lib/jobs";
import { publishedUrl } from "@/lib/validation";
import { config } from "@/lib/config";
import { ok, fail, localRequest, readBody } from "@/lib/http";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    localRequest(request);
    const { id } = await params;
    const b = await readBody(request);
    if (b.action === "cancel") {
      await cancelJob(id);
      return ok(null);
    }
    if (b.action !== "resolve") throw new Error("지원하지 않는 요청");
    return ok(
      await prisma.$transaction(async (tx) => {
        const job = await tx.job.findUniqueOrThrow({ where: { id } });
        if (job.status !== "NEEDS_REVIEW")
          throw new Error("확인 대기 작업이 아닙니다.");
        const url = b.postUrl
          ? publishedUrl(
              typeof b.postUrl === "string" ? b.postUrl : "",
              config().blogId,
            )
          : null;
        if (b.postUrl && !url)
          throw new Error("현재 블로그의 게시물 URL을 입력하세요.");
        if (url && job.type !== "PUBLISH")
          throw new Error("발행 작업이 아닙니다.");
        if (!url && b.confirmNotPublished !== true)
          throw new Error("블로그에서 미게시 여부를 직접 확인하세요.");
        if (url && job.postId)
          await tx.post.update({
            where: { id: job.postId },
            data: {
              status: "PUBLISHED",
              finalUrl: url,
              publishedAt: new Date(),
            },
          });
        await tx.brandLink.update({
          where: { id: job.linkId },
          data: {
            status: url ? "PUBLISHED" : "READY",
            errorMessage: null,
            ...(url ? { postUrl: url, publishedAt: new Date() } : {}),
          },
        });
        await tx.log.create({
          data: {
            jobId: id,
            action: "MANUAL_VERIFY",
            status: url ? "SUCCEEDED" : "CANCELLED",
            message: "사용자가 게시 결과 확인",
          },
        });
        return tx.job.update({
          where: { id },
          data: {
            status: url ? "SUCCEEDED" : "CANCELLED",
            finishedAt: new Date(),
          },
        });
      }),
    );
  } catch (e) {
    return fail(e);
  }
}
