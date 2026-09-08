import fs from "node:fs";
import { sessionFile, requireConfig } from "../config";
import { browserContext } from "./browser";
import { prisma } from "../db";
export async function sessionStatus() {
  if (!fs.existsSync(sessionFile))
    return { hasSession: false, isValid: false, status: "MISSING" };
  const row = await prisma.session.findUnique({ where: { name: "naver" } });
  const fresh =
    row?.lastChecked && Date.now() - row.lastChecked.getTime() < 5 * 60_000;
  return {
    hasSession: true,
    isValid: !!(fresh && row?.isValid),
    status: fresh ? (row?.isValid ? "VALID" : "EXPIRED") : "UNKNOWN",
    lastChecked: row?.lastChecked,
  };
}
export async function checkSession() {
  const c = requireConfig();
  if (!fs.existsSync(sessionFile))
    throw new Error("네이버 로그인이 필요합니다. npm run login을 실행하세요.");
  const { browser, context } = await browserContext(true);
  let valid = false;
  try {
    const page = await context.newPage();
    await page.goto(`https://blog.naver.com/${c.blogId}/postwrite`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page
      .locator(".se-documentTitle, .se-title-text")
      .first()
      .waitFor({ timeout: 15000 });
    const cookies = await context.cookies("https://naver.com");
    valid =
      cookies.some((c) => c.name === "NID_AUT" && !!c.value) &&
      !page.url().includes("nidlogin");
  } catch {
    valid = false;
  } finally {
    await browser.close();
  }
  await prisma.session.upsert({
    where: { name: "naver" },
    create: { name: "naver", isValid: valid, lastChecked: new Date() },
    update: { isValid: valid, lastChecked: new Date() },
  });
  if (!valid)
    throw new Error(
      "로그인 또는 블로그 편집기 접근을 확인할 수 없습니다. 다시 로그인하세요.",
    );
  return sessionStatus();
}
