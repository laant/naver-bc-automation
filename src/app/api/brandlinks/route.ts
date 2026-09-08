import { prisma } from "@/lib/db";
import { ok, fail, localRequest, readBody } from "@/lib/http";
import { productUrl, text } from "@/lib/validation";
export async function GET() {
  try {
    return ok(
      await prisma.brandLink.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          posts: { orderBy: { createdAt: "desc" }, take: 1 },
          jobs: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: { logs: { orderBy: { createdAt: "desc" }, take: 10 } },
          },
        },
      }),
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    localRequest(request);
    const b = await readBody(request);
    const url = productUrl(b.url);
    const memo = text(b.memo || "", 5000);
    return ok(
      await prisma.$transaction(async (tx) => {
        if (await tx.brandLink.findFirst({ where: { url } }))
          throw new Error("이미 등록된 URL입니다.");
        return tx.brandLink.create({ data: { url, memo } });
      }),
    );
  } catch (e) {
    return fail(e);
  }
}
