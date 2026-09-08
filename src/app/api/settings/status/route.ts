import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import { sessionStatus } from "@/lib/automation/session";
import { ok, fail } from "@/lib/http";
export async function GET() {
  try {
    const c = config();
    const lease = await prisma.workerLease.findUnique({
      where: { id: "naver" },
    });
    return ok({
      provider: c.provider,
      model: c.model,
      keyPresent: !!c.key?.trim() && !c.key.endsWith("..."),
      blogIdPresent: !!c.blogId,
      workerOnline: !!lease && lease.expiresAt > new Date(),
      session: await sessionStatus(),
    });
  } catch (e) {
    return fail(e);
  }
}
