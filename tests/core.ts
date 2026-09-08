import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { productUrl, draft, publishedUrl } from "../src/lib/validation";
import { imageUrl } from "../src/lib/automation/images";
import { generateRandomSchedule } from "../src/lib/scheduler/random-schedule";
const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "naver-writer-test-"));
let passed = 0;
async function test(name: string, fn: () => unknown | Promise<unknown>) {
  await fn();
  console.log("PASS", name);
  passed++;
}
async function main() {
  fs.writeFileSync(path.join(temp, "test.db"), "");
  process.env.DATABASE_URL = `file:${path.join(temp, "test.db")}`;
  fs.writeFileSync(
    path.join(temp, ".env"),
    "AI_PROVIDER=gemini\nGEMINI_API_KEY=test-key\nNAVER_BLOG_ID=test_blog\n",
  );
  execFileSync(
    path.join(root, "node_modules/.bin/prisma"),
    ["migrate", "deploy", "--schema", path.join(root, "prisma/schema.prisma")],
    { env: process.env, stdio: "pipe", cwd: temp },
  );
  process.chdir(temp);
  const { localRequest } = await import("../src/lib/http");
  const { sessionFile } = await import("../src/lib/config");
  assert.ok(sessionFile === path.join(fs.realpathSync(temp), "playwright/storage/naver-session.json"), "Tests must not inspect the real session");
  const { prisma } = await import("../src/lib/db");
  const { enqueue, cancelJob, recoverJobs } = await import("../src/lib/jobs");
  const { tick } = await import("../scripts/worker");
  const { PATCH: editPost } = await import("../src/app/api/posts/[id]/route");
  const { PATCH: resolveJob } = await import("../src/app/api/jobs/[id]/route");
  // These handlers use @ aliases. The test runner registers the existing alias below.
  const request = (body: unknown) =>
    new Request("http://127.0.0.1:3000/api/test", {
      method: "PATCH",
      headers: { host: "127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    await test("URL allowlist rejects credentials, private IPs, schemes and deceptive hosts", () => {
      for (const bad of [
        "http://naver.me/a",
        "https://127.0.0.1/a",
        "https://naver.me.evil.test/a",
        "https://x@naver.me/a",
        "https://naver.me:8443/a",
        "javascript:alert(1)",
      ])
        assert.throws(() => productUrl(bad));
      assert.equal(
        productUrl("https://naver.me/test#x"),
        "https://naver.me/test",
      );
      assert.throws(() => imageUrl("https://pstatic.net.evil.test/a.jpg"));
      assert.throws(() =>
        imageUrl("https://evil.test/a?shop-phinf.pstatic.net"),
      );
    });
    await test("Cross-origin local mutations rejected", () =>
      assert.throws(() =>
        localRequest(
          new Request("http://127.0.0.1:3000", {
            headers: { host: "127.0.0.1:3000", origin: "https://evil.test" },
          }),
        ),
      ));
    await test("Malformed and overlong AI output rejected", () => {
      assert.throws(() => draft({ title: "x", sections: [], hashtags: [] }));
      assert.throws(() =>
        draft({ title: "x", sections: ["x".repeat(20001)], hashtags: [] }),
      );
      assert.throws(() => draft({ title: "x", sections: [123], hashtags: [] }));
    });
    await test("Only an actual article in the intended blog verifies", () => {
      assert.equal(
        publishedUrl("https://blog.naver.com/test_blog/postwrite", "test_blog"),
        null,
      );
      assert.equal(
        publishedUrl("https://blog.naver.com/other/123", "test_blog"),
        null,
      );
      assert.ok(
        publishedUrl("https://blog.naver.com/test_blog/123", "test_blog"),
      );
      assert.ok(
        publishedUrl(
          "https://blog.naver.com/PostView.naver?blogId=test_blog&logNo=123",
          "test_blog",
        ),
      );
    });
    await test("Random schedules always satisfy count and minimum gap", () => {
      for (let i = 0; i < 100; i++) {
        const t = generateRandomSchedule(new Date(), {
          startHour: 9,
          endHour: 10,
          postCount: 6,
          minGapMinutes: 10,
        });
        assert.equal(t.length, 6);
        for (let j = 1; j < t.length; j++)
          assert.ok(t[j].getTime() - t[j - 1].getTime() >= 600000);
      }
      assert.throws(() =>
        generateRandomSchedule(new Date(), {
          startHour: 9,
          endHour: 10,
          postCount: 7,
          minGapMinutes: 10,
        }),
      );
    });
    const link = await prisma.brandLink.create({
      data: { url: "https://naver.me/test" },
    });
    await test("Concurrent enqueue allows one active job only", async () => {
      const result = await Promise.allSettled([
        enqueue(link.id, "SCRAPE"),
        enqueue(link.id, "SCRAPE"),
      ]);
      assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        await prisma.job.count({
          where: { linkId: link.id, status: "QUEUED" },
        }),
        1,
      );
    });
    await test("Queued cancellation releases link", async () => {
      const j = await prisma.job.findFirstOrThrow({
        where: { linkId: link.id, status: "QUEUED" },
      });
      await cancelJob(j.id);
      assert.equal(
        (await prisma.brandLink.findUniqueOrThrow({ where: { id: link.id } }))
          .status,
        "READY",
      );
    });
    await test("Publish without login is rejected before queueing", async () => {
      await assert.rejects(() => enqueue(link.id, "PUBLISH"));
      assert.equal(
        await prisma.job.count({
          where: { linkId: link.id, status: "QUEUED" },
        }),
        0,
      );
    });
    fs.mkdirSync("playwright/storage", { recursive: true });
    fs.writeFileSync("playwright/storage/naver-session.json", "{}");
    await prisma.session.create({
      data: { name: "naver", isValid: true, lastChecked: new Date() },
    });
    const post = await prisma.post.create({
      data: {
        linkId: link.id,
        date: new Date(),
        scheduledAt: new Date(),
        title: "테스트 제목",
        sections: '["테스트 본문"]',
        tags: "[]",
        status: "DRAFT",
      },
    });
    await test("Unreviewed draft cannot publish", async () => {
      await assert.rejects(() => enqueue(link.id, "PUBLISH"));
    });
    await test("Review requires current version, edits invalidate review", async () => {
      const params = Promise.resolve({ id: post.id });
      assert.equal(
        (await editPost(request({ version: 99, review: true }), { params }))
          .status,
        400,
      );
      assert.equal(
        (await editPost(request({ version: 1, review: true }), { params }))
          .status,
        200,
      );
      assert.equal(
        (
          await editPost(
            request({
              version: 1,
              title: "변경 제목",
              sections: ["수정 본문"],
              hashtags: [],
            }),
            { params },
          )
        ).status,
        200,
      );
      const p = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      assert.equal(p.version, 2);
      assert.equal(p.reviewedVersion, null);
      await assert.rejects(() => enqueue(link.id, "PUBLISH"));
      assert.equal(
        (await editPost(request({ version: 2, review: true }), { params }))
          .status,
        200,
      );
    });
    await test("Queued publication locks reviewed content", async () => {
      const j = await enqueue(
        link.id,
        "PUBLISH",
        new Date(Date.now() + 3600000).toISOString(),
      );
      assert.equal(
        (
          await editPost(
            request({
              version: 2,
              title: "bad",
              sections: ["changed"],
              hashtags: [],
            }),
            { params: Promise.resolve({ id: post.id }) },
          )
        ).status,
        400,
      );
      await cancelJob(j.id);
    });
    await test("Abandoned publish needs manual review and blocks retry", async () => {
      const j = await prisma.job.create({
        data: {
          type: "PUBLISH",
          linkId: link.id,
          postId: post.id,
          status: "RUNNING",
          heartbeatAt: new Date(0),
          lockToken: "dead",
          publishAttempted: true,
        },
      });
      await recoverJobs();
      assert.equal(
        (await prisma.job.findUniqueOrThrow({ where: { id: j.id } })).status,
        "NEEDS_REVIEW",
      );
      await assert.rejects(() => enqueue(link.id, "PUBLISH"));
      assert.equal(
        (
          await resolveJob(request({ action: "resolve" }), {
            params: Promise.resolve({ id: j.id }),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await resolveJob(
            request({ action: "resolve", confirmNotPublished: true }),
            { params: Promise.resolve({ id: j.id }) },
          )
        ).status,
        200,
      );
    });
    await test("Worker refuses a second live lease", async () => {
      await prisma.workerLease.upsert({
        where: { id: "naver" },
        create: {
          id: "naver",
          owner: "another",
          expiresAt: new Date(Date.now() + 60000),
        },
        update: { owner: "another", expiresAt: new Date(Date.now() + 60000) },
      });
      const j = await enqueue(link.id, "SCRAPE");
      await tick();
      assert.equal(
        (await prisma.job.findUniqueOrThrow({ where: { id: j.id } })).status,
        "QUEUED",
      );
      await cancelJob(j.id);
      await prisma.workerLease.deleteMany();
    });
    await test("Missed scheduled publication does not call browser or API", async () => {
      const j = await prisma.job.create({
        data: {
          type: "PUBLISH",
          linkId: link.id,
          postId: post.id,
          isScheduled: true,
          scheduledAt: new Date(0),
        },
      });
      await tick();
      assert.equal(
        (await prisma.job.findUniqueOrThrow({ where: { id: j.id } })).status,
        "NEEDS_REVIEW",
      );
      await resolveJob(
        request({ action: "resolve", confirmNotPublished: true }),
        { params: Promise.resolve({ id: j.id }) },
      );
    });
    await test("Worker catches errors, records failure and removes RUNNING", async () => {
      await prisma.brandLink.update({
        where: { id: link.id },
        data: { productData: "invalid JSON" },
      });
      const j = await enqueue(link.id, "GENERATE");
      await tick();
      const result = await prisma.job.findUniqueOrThrow({
        where: { id: j.id },
        include: { logs: true },
      });
      assert.equal(result.status, "FAILED");
      assert.ok(result.logs.some((l) => l.status === "FAILED"));
      assert.ok(!result.errorMessage?.includes("test-key"));
    });
    console.log(
      `${passed} tests passed; isolated database only; no external AI or publishing calls.`,
    );
  } finally {
    await prisma.$disconnect();
    process.chdir(root);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
