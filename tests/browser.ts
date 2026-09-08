import assert from "node:assert/strict";
import { chromium } from "playwright";
import { collectProduct } from "../src/lib/automation/scraper";
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://smartstore.naver.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: '<html><head><meta property="og:title" content="상품 A-B: 상세명"><meta property="og:description" content="확인된 상품 설명"><meta property="og:site_name" content="테스트 상점"></head><body><span class="total_price">12,000원</span><img src="https://shop-phinf.pstatic.net/test.jpg"></body></html>',
      }),
    );
    await page.route("https://shop-phinf.pstatic.net/**", (route) =>
      route.abort(),
    );
    const product = await collectProduct(
      page,
      "https://smartstore.naver.com/test/products/123",
    );
    assert.equal(product.name, "상품 A-B: 상세명");
    assert.equal(product.price, "12,000원");
    assert.equal(product.storeName, "테스트 상점");
    assert.equal(product.imageUrls.length, 1);
    await page.unroute("https://smartstore.naver.com/**");
    await page.route("https://smartstore.naver.com/**", (route) =>
      route.fulfill({ status: 403, body: "Forbidden" }),
    );
    await assert.rejects(() =>
      collectProduct(page, "https://smartstore.naver.com/test/products/123"),
    );
    console.log(
      "PASS browser scraper fixtures: metadata, complete product name, image URLs, HTTP failure",
    );
    await page.close();
    const ui = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    let post = {
      id: "post-1",
      title: "검토할 상품 소개",
      sections: JSON.stringify(["확인된 상품 특징입니다."]),
      tags: '["상품"]',
      imageUrls: "[]",
      version: 1,
      reviewedVersion: null as number | null,
      status: "DRAFT",
    };
    let jobs: {
      id: string;
      type: string;
      status: string;
      scheduledAt: string;
      logs: never[];
    }[] = [];
    const link = () => ({
      id: "link-1",
      url: "https://naver.me/example",
      productName: "테스트 상품",
      productPrice: "12,000원",
      imageUrls: "[]",
      status: jobs.some((j) => j.status === "QUEUED") ? "QUEUED" : "READY",
      postUrl: null,
      posts: [post],
      jobs,
    });
    await ui.route("**/api/**", async (route) => {
      const req = route.request();
      const pathname = new URL(req.url()).pathname;
      let data: unknown = null;
      if (pathname === "/api/settings/status")
        data = {
          provider: "gemini",
          model: "gemini-2.5-flash",
          keyPresent: true,
          blogIdPresent: true,
          workerOnline: true,
          session: { status: "VALID" },
        };
      else if (pathname === "/api/brandlinks") data = [link()];
      else if (pathname === "/api/posts/post-1") {
        const b = req.postDataJSON();
        post = b.review
          ? { ...post, reviewedVersion: post.version, status: "REVIEWED" }
          : {
              ...post,
              title: b.title,
              sections: JSON.stringify(b.sections),
              tags: JSON.stringify(b.hashtags),
              imageUrls: JSON.stringify(b.imageUrls),
              version: post.version + 1,
              reviewedVersion: null,
              status: "DRAFT",
            };
        data = post;
      } else if (pathname === "/api/brandlinks/link-1/publish") {
        const b = req.postDataJSON();
        assert.ok(b.scheduledAt);
        jobs = [
          {
            id: "job-1",
            type: "PUBLISH",
            status: "QUEUED",
            scheduledAt: b.scheduledAt,
            logs: [],
          },
        ];
        data = jobs[0];
      } else if (pathname === "/api/jobs/job-1") {
        jobs = jobs.map((j) => ({ ...j, status: "CANCELLED" }));
        data = null;
      } else throw new Error("Unexpected UI API: " + pathname);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ success: true, data }),
      });
    });
    const errors: string[] = [];
    ui.on("pageerror", (e) => errors.push(e.message));
    await ui.goto("http://127.0.0.1:3000");
    await ui
      .getByRole("heading", { name: "테스트 상품", exact: true })
      .waitFor();
    await ui.getByLabel("초안 제목", { exact: true }).fill("수정한 제목");
    assert.equal(
      await ui
        .getByRole("button", { name: "내용 확인 · 검토 완료", exact: true })
        .isEnabled(),
      false,
    );
    await ui.getByRole("button", { name: "초안 저장", exact: true }).click();
    await ui.getByText("초안 검토 · 버전 2", { exact: false }).waitFor();
    await ui
      .getByRole("button", { name: "내용 확인 · 검토 완료", exact: true })
      .click();
    await ui.getByRole("button", { name: "지금 발행", exact: true }).waitFor();
    await ui
      .getByLabel("예약 시간 (한국 시간)", { exact: true })
      .fill("2027-01-01T12:00");
    await ui
      .getByRole("button", { name: "한국 시간으로 예약", exact: true })
      .click();
    await ui.getByRole("button", { name: "취소 요청", exact: true }).waitFor();
    assert.equal(jobs[0].scheduledAt, "2027-01-01T03:00:00.000Z");
    await ui.getByRole("button", { name: "취소 요청", exact: true }).click();
    await ui.getByText("발행 · 취소", { exact: false }).waitFor();
    assert.equal(errors.length, 0, errors.join(";"));
    await ui.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await ui.evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth",
      ),
    );
    console.log(
      "PASS browser dashboard: edit, save, review, Korean-time schedule, cancellation, mobile layout",
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
