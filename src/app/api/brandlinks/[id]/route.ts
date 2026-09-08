import { prisma } from "@/lib/db";
import { ok, fail, localRequest, readBody } from "@/lib/http";
import { text, productUrl } from "@/lib/validation";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    return ok(
      await prisma.brandLink.findUniqueOrThrow({
        where: { id: (await params).id },
      }),
    );
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  try {
    localRequest(request);
    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      if (
        (await tx.job.count({ where: { linkId: id } })) ||
        (await tx.post.count({ where: { linkId: id } }))
      )
        throw new Error(
          "작업 이력이 있는 상품은 기록 보존을 위해 삭제할 수 없습니다.",
        );
      await tx.brandLink.delete({ where: { id } });
    });
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    localRequest(request);
    const { id } = await params;
    const b = await readBody(request);
    if (Object.keys(b).some((k) => !["url", "memo"].includes(k)))
      throw new Error("URL과 메모만 수정할 수 있습니다.");
    return ok(
      await prisma.$transaction(async (tx) => {
        if (await tx.job.count({ where: { linkId: id } }))
          throw new Error("작업을 시작한 상품의 원본은 변경할 수 없습니다.");
        return tx.brandLink.update({
          where: { id },
          data: {
            ...(b.url !== undefined ? { url: productUrl(b.url) } : {}),
            ...(b.memo !== undefined ? { memo: text(b.memo, 5000) } : {}),
          },
        });
      }),
    );
  } catch (e) {
    return fail(e);
  }
}
