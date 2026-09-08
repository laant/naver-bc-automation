import { prisma } from "@/lib/db";
import { draft, strings } from "@/lib/validation";
import { ok, fail, localRequest, readBody } from "@/lib/http";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    localRequest(request);
    const b = await readBody(request);
    const { id } = await params;
    return ok(
      await prisma.$transaction(async (tx) => {
        const post = await tx.post.findUniqueOrThrow({ where: { id } });
        if (
          post.status === "PUBLISHED" ||
          (await tx.job.count({
            where: {
              linkId: post.linkId || "",
              status: { in: ["QUEUED", "RUNNING", "NEEDS_REVIEW"] },
            },
          }))
        )
          throw new Error("진행 중이거나 발행된 초안은 수정할 수 없습니다.");
        if (b.version !== post.version)
          throw new Error("초안이 변경되었습니다. 새로고침하세요.");
        if (b.review === true)
          return tx.post.update({
            where: { id },
            data: { reviewedVersion: post.version, status: "REVIEWED" },
          });
        const d = draft(b);
        const link = await tx.brandLink.findUniqueOrThrow({
          where: { id: post.linkId! },
        });
        const selected =
          b.imageUrls === undefined
            ? (JSON.parse(post.imageUrls || "[]") as string[])
            : strings(b.imageUrls, 10);
        const available: string[] = JSON.parse(link.imageUrls || "[]");
        if (selected.some((u) => !available.includes(u)))
          throw new Error("수집된 이미지 중에서 선택하세요.");
        return tx.post.update({
          where: { id },
          data: {
            imageUrls: JSON.stringify(selected),
            title: d.title,
            sections: JSON.stringify(d.sections),
            tags: JSON.stringify(d.hashtags),
            version: { increment: 1 },
            reviewedVersion: null,
            status: "DRAFT",
          },
        });
      }),
    );
  } catch (e) {
    return fail(e);
  }
}
