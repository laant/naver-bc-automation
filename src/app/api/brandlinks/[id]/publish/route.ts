import { enqueue } from "@/lib/jobs";
import { ok, fail, localRequest, readBody } from "@/lib/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    localRequest(request);
    const b = await readBody(request);
    return ok(await enqueue((await params).id, "PUBLISH", b.scheduledAt));
  } catch (e) {
    return fail(e);
  }
}
