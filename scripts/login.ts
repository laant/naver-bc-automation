import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { browserContext } from "../src/lib/automation/browser";
import { requireConfig, sessionFile } from "../src/lib/config";
import { prisma } from "../src/lib/db";
async function main() {
  const c = requireConfig();
  const { browser, context } = await browserContext(false, false);
  try {
    const page = await context.newPage();
    await page.goto("https://nid.naver.com/nidlogin.login");
    console.log("열린 브라우저에서 5분 이내에 로그인하세요.");
    const deadline = Date.now() + 300000;
    let authenticated = false;
    while (Date.now() < deadline && browser.isConnected()) {
      const cookies = await context.cookies("https://naver.com");
      if (cookies.some((c) => c.name === "NID_AUT" && c.value)) {
        authenticated = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!authenticated) throw new Error("로그인 시간 초과");
    await page.goto(`https://blog.naver.com/${c.blogId}/postwrite`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .locator(".se-documentTitle, .se-title-text")
      .first()
      .waitFor({ timeout: 20000 });
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });
    await fs.writeFile(
      sessionFile + ".tmp",
      JSON.stringify(await context.storageState()),
      { mode: 0o600 },
    );
    await fs.rename(sessionFile + ".tmp", sessionFile);
    await prisma.session.upsert({
      where: { name: "naver" },
      create: { name: "naver", isValid: true, lastChecked: new Date() },
      update: { isValid: true, lastChecked: new Date() },
    });
    console.log("로그인 확인 및 세션 저장 완료");
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error("로그인을 확인하지 못했습니다. 기존 세션은 유지됩니다.");
  process.exitCode = 1;
});
