import { sessionStatus, checkSession } from "@/lib/automation/session";
import { ok, fail, localRequest } from "@/lib/http";
export async function GET() {
  try {
    return ok(await sessionStatus());
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    localRequest(request);
    return ok(await checkSession());
  } catch (e) {
    return fail(e);
  }
}
