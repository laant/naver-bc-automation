import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
export const sessionFile = path.join(
  process.cwd(),
  "playwright/storage/naver-session.json",
);
export function config() {
  const file = path.join(process.cwd(), ".env");
  const env = {
    ...process.env,
    ...(fs.existsSync(file) ? parse(fs.readFileSync(file)) : {}),
  };
  const provider = (env.AI_PROVIDER || "openai").toLowerCase();
  const key = provider === "gemini" ? env.GEMINI_API_KEY : env.OPENAI_API_KEY;
  return {
    provider,
    key,
    model:
      provider === "gemini"
        ? env.GEMINI_MODEL || "gemini-3.6-flash"
        : env.OPENAI_MODEL || "gpt-5.2",
    blogId: env.NAVER_BLOG_ID || "",
  };
}
export function requireConfig(ai = false) {
  const c = config();
  if (!/^[a-zA-Z0-9_-]+$/.test(c.blogId))
    throw new Error(".env의 NAVER_BLOG_ID를 확인하세요.");
  if (
    ai &&
    (!["openai", "gemini"].includes(c.provider) ||
      !c.key?.trim() ||
      c.key.endsWith("..."))
  )
    throw new Error("AI 공급자와 API 키를 설정하세요.");
  return c;
}
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "작업 처리 중 오류가 발생했습니다.";
}
