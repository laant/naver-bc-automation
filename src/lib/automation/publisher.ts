import fs from "node:fs/promises";
import path from "node:path";
import { Page } from "playwright";
import {
  step3_openEditor,
  step4_inputTitle,
  step5and6_uploadAndWrite,
} from "./editor";
import { publishedUrl } from "../validation";
import { requireConfig } from "../config";
import { imageBytes } from "./images";
export async function downloadImages(urls: string[], directory: string) {
  await fs.mkdir(directory, { recursive: true });
  const paths: string[] = [];
  for (const [i, raw] of urls.slice(0, 10).entries()) {
    const { body, extension } = await imageBytes(raw);
    const file = path.join(directory, `${i}.${extension}`);
    await fs.writeFile(file, body);
    paths.push(file);
  }
  return paths;
}
export async function publish(
  page: Page,
  post: { title: string; sections: string[]; hashtags: string[] },
  images: string[],
  beforeClick: () => Promise<void>,
) {
  await step3_openEditor(page);
  await step4_inputTitle(page, post.title);
  await step5and6_uploadAndWrite(page, images, post.sections, post.hashtags);
  // Stop when the editor changed; never guess publication coordinates.
  const title = await page
    .locator(".se-documentTitle, .se-title-text")
    .first()
    .innerText();
  if (!title.includes(post.title))
    throw new Error("편집기의 제목을 확인할 수 없습니다.");
  const body = await page.locator("body").innerText();
  if (
    !post.sections.every((s) =>
      body.replace(/\s/g, "").includes(s.replace(/\s/g, "")),
    )
  )
    throw new Error("편집기 본문 검증에 실패했습니다.");
  if (
    images.length &&
    (await page.locator(".se-image-resource").count()) < images.length
  )
    throw new Error("편집기 이미지 확인에 실패했습니다.");
  await page.keyboard.press("Escape");
  const first = page.locator('button[class*="publish_btn"]').first();
  await first.click({ timeout: 10000 });
  const final = page.locator('button[class*="confirm_btn"]');
  await final.waitFor({ state: "visible", timeout: 10000 });
  if ((await final.count()) !== 1)
    throw new Error("최종 발행 버튼을 명확히 확인할 수 없습니다.");
  await beforeClick();
  await final.click();
  await page.waitForURL((u) => !!publishedUrl(u.href, requireConfig().blogId), {
    timeout: 20000,
  });
  const url = publishedUrl(page.url(), requireConfig().blogId);
  if (!url) throw new Error("실제 게시물 URL 확인 실패");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // The classic Naver view renders the published article in mainFrame.
  const frame =
    page.frames().find((f) => f.name() === "mainFrame") || page.mainFrame();
  await frame
    .getByText(post.title, { exact: false })
    .first()
    .waitFor({ timeout: 15000 });
  return url;
}
