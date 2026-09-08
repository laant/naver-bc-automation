import { checkAIConnection } from "@/lib/automation/connection";
import { ok, fail, localRequest } from "@/lib/http";
export async function POST(request: Request) {
  try {
    localRequest(request);
    return ok(await checkAIConnection());
  } catch (e) {
    return fail(e);
  }
}
