import { NextResponse } from "next/server";
import { errorMessage } from "./config";
export function ok(data: unknown) {
  return NextResponse.json({ success: true, data });
}
export function fail(e: unknown) {
  const message = errorMessage(e);
  return NextResponse.json(
    {
      success: false,
      error:
        message.includes("prisma") || message.includes("Invalid `")
          ? "데이터 처리에 실패했습니다."
          : message,
    },
    { status: 400 },
  );
}
export function localRequest(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (
    !host ||
    !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
    (origin && new URL(origin).host !== host)
  )
    throw new Error("로컬 대시보드에서 요청하세요.");
}

export async function readBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 200000) throw new Error("요청 크기가 너무 큽니다.");
  const data: unknown = raw ? JSON.parse(raw) : {};
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("요청 형식 오류");
  return data as Record<string, unknown>;
}
