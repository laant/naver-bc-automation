import { chromium, BrowserContext, Page } from "playwright";
import fs from "node:fs";
import { sessionFile } from "../config";
// Browser automation stays inside Naver-owned HTTPS hosts, including redirected requests.
// Enforced via framenavigated checks (below), not request interception: Naver's bot
// detection flags context.route() itself (it enables the CDP Network domain) and returns
// 429s even on requests the route handler lets through untouched.
export async function browserContext(session = false, headless = true) {
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      locale: "ko-KR",
      viewport: { width: 1280, height: 900 },
      ...(session && fs.existsSync(sessionFile)
        ? { storageState: sessionFile }
        : {}),
    });
    guardNewPages(context);
    return { browser, context };
  } catch (e) {
    await browser.close();
    throw e;
  }
}
function allowedHost(hostname: string) {
  return (
    hostname === "naver.me" ||
    hostname === "naver.com" ||
    hostname.endsWith(".naver.com") ||
    hostname === "pstatic.net" ||
    hostname.endsWith(".pstatic.net")
  );
}
function guardPage(page: Page) {
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (url === "about:blank") return;
    let allowed = false;
    try {
      allowed = new URL(url).protocol === "https:" && allowedHost(new URL(url).hostname);
    } catch {
      allowed = false;
    }
    if (!allowed) void page.close().catch(() => {});
  });
}
function guardNewPages(context: BrowserContext) {
  context.on("page", guardPage);
  const originalNewPage = context.newPage.bind(context);
  context.newPage = async (...args: Parameters<typeof originalNewPage>) => {
    const page = await originalNewPage(...args);
    guardPage(page);
    return page;
  };
}
