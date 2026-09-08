import "dotenv/config";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { recoverJobs } from "../src/lib/jobs";
import { browserContext } from "../src/lib/automation/browser";
import { collectProduct } from "../src/lib/automation/scraper";
import { generate } from "../src/lib/automation/generator";
import { checkSession } from "../src/lib/automation/session";
import { downloadImages, publish } from "../src/lib/automation/publisher";
import { jobFailure } from "../src/lib/automation/errors";
import { draft } from "../src/lib/validation";
const owner = randomUUID();
let stopped = false;

export async function tick() {
  const now = new Date();
  await prisma.workerLease.upsert({
    where: { id: "naver" },
    create: { id: "naver", owner: "", expiresAt: new Date(0) },
    update: {},
  });
  const lock = await prisma.workerLease.updateMany({
    where: { id: "naver", OR: [{ owner }, { expiresAt: { lt: now } }] },
    data: { owner, expiresAt: new Date(Date.now() + 120000) },
  });
  if (!lock.count) return;
  await recoverJobs();
  const candidate = await prisma.job.findFirst({
    where: { status: "QUEUED", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
  });
  if (!candidate) return;
  const claim = await prisma.job.updateMany({
    where: { id: candidate.id, status: "QUEUED" },
    data: {
      status: "RUNNING",
      lockToken: owner,
      startedAt: now,
      heartbeatAt: now,
      attempt: { increment: 1 },
    },
  });
  if (!claim.count) return;
  let lost = false;
  let browser:
    Awaited<ReturnType<typeof browserContext>>["browser"] | undefined;
  const deadline = setTimeout(() => {
    lost = true;
    void browser?.close().catch(() => {});
  }, 8 * 60_000);
  const heartbeat = setInterval(() => {
    void (async () => {
      const held = await prisma.workerLease.updateMany({
        where: { id: "naver", owner, expiresAt: { gt: new Date() } },
        data: { expiresAt: new Date(Date.now() + 120000) },
      });
      if (!held.count) {
        lost = true;
        await browser?.close().catch(() => {});
      }
      await prisma.job.updateMany({
        where: { id: candidate.id, lockToken: owner, status: "RUNNING" },
        data: { heartbeatAt: new Date() },
      });
    })().catch(() => {
      lost = true;
    });
  }, 10000);
  const temp = path.join(process.cwd(), "temp_images", candidate.id);
  async function checkpoint() {
    const row = await prisma.job.findUniqueOrThrow({
      where: { id: candidate!.id },
    });
    const lease = await prisma.workerLease.findUnique({
      where: { id: "naver" },
    });
    if (
      lost ||
      row.lockToken !== owner ||
      row.status !== "RUNNING" ||
      lease?.owner !== owner ||
      lease.expiresAt < new Date()
    )
      throw new Error("실행 잠금이 만료되었습니다.");
    if (row.cancelRequested || stopped) throw new Error("CANCELLED");
  }
  try {
    await checkpoint();
    if (
      candidate.isScheduled &&
      Date.now() - candidate.scheduledAt.getTime() > 5 * 60000
    )
      throw new Error("MISSED_SCHEDULE");
    await prisma.brandLink.update({
      where: { id: candidate.linkId },
      data: { status: "RUNNING" },
    });
    await prisma.log.create({
      data: {
        jobId: candidate.id,
        action: candidate.type,
        status: "RUNNING",
        message: "작업 시작",
      },
    });
    const link = await prisma.brandLink.findUniqueOrThrow({
      where: { id: candidate.linkId },
    });
    if (candidate.type === "SCRAPE") {
      const opened = await browserContext(true, false);
      browser = opened.browser;
      const product = await collectProduct(
        await opened.context.newPage(),
        link.url,
      );
      await checkpoint();
      await prisma.brandLink.update({
        where: { id: link.id },
        data: {
          productName: product.name,
          productPrice: product.price,
          storeName: product.storeName,
          finalUrl: product.finalUrl,
          imageUrls: JSON.stringify(product.imageUrls),
          productData: JSON.stringify(product),
          scrapedAt: new Date(),
        },
      });
      await prisma.post.updateMany({
        where: { linkId: link.id, status: { not: "PUBLISHED" } },
        data: { reviewedVersion: null, status: "DRAFT" },
      });
    } else if (candidate.type === "GENERATE") {
      const post = await generate(
        JSON.parse(link.productData!),
        link.memo || "",
      );
      await checkpoint();
      await prisma.post.create({
        data: {
          linkId: link.id,
          date: now,
          scheduledAt: now,
          status: "DRAFT",
          title: post.title,
          sections: JSON.stringify(post.sections),
          tags: JSON.stringify(post.hashtags),
          imageUrls: JSON.stringify(
            JSON.parse(link.imageUrls || "[]").slice(0, 10),
          ),
        },
      });
    } else {
      await checkSession();
      await checkpoint();
      const post = await prisma.post.findUniqueOrThrow({
        where: { id: candidate.postId! },
      });
      if (post.reviewedVersion !== post.version || post.status !== "REVIEWED")
        throw new Error("검토한 초안이 변경되었습니다.");
      const content = draft({
        title: post.title,
        sections: JSON.parse(post.sections!),
        hashtags: JSON.parse(post.tags!),
      });
      content.sections.push(
        `이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.\n구매링크: ${link.url}`,
      );
      const opened = await browserContext(true, false);
      browser = opened.browser;
      const images = await downloadImages(
        JSON.parse(post.imageUrls || "[]"),
        temp,
      );
      const url = await publish(
        await opened.context.newPage(),
        content,
        images,
        async () => {
          await checkpoint();
          const result = await prisma.job.updateMany({
            where: {
              id: candidate.id,
              status: "RUNNING",
              lockToken: owner,
              cancelRequested: false,
            },
            data: { publishAttempted: true },
          });
          if (!result.count) throw new Error("CANCELLED");
        },
      );
      await prisma.$transaction([
        prisma.post.update({
          where: { id: post.id },
          data: { status: "PUBLISHED", finalUrl: url, publishedAt: new Date() },
        }),
        prisma.brandLink.update({
          where: { id: link.id },
          data: { status: "PUBLISHED", postUrl: url, publishedAt: new Date() },
        }),
      ]);
    }
    await prisma.$transaction([
      prisma.job.update({
        where: { id: candidate.id },
        data: { status: "SUCCEEDED", finishedAt: new Date() },
      }),
      prisma.brandLink.update({
        where: { id: candidate.linkId },
        data: {
          status: candidate.type === "PUBLISH" ? "PUBLISHED" : "READY",
          errorMessage: null,
        },
      }),
      prisma.log.create({
        data: {
          jobId: candidate.id,
          action: candidate.type,
          status: "SUCCEEDED",
          message: "작업 완료",
        },
      }),
    ]);
  } catch (e) {
    const current = await prisma.job.findUniqueOrThrow({
      where: { id: candidate.id },
    });
    if (current.status !== "RUNNING" || current.lockToken !== owner) return;
    const cancelled = e instanceof Error && e.message === "CANCELLED";
    const missed = e instanceof Error && e.message === "MISSED_SCHEDULE";
    const status =
      current.publishAttempted || missed
        ? "NEEDS_REVIEW"
        : cancelled
          ? "CANCELLED"
          : "FAILED";
    // Provider errors may contain request details; persist only a generic public explanation.
    const message = current.publishAttempted
      ? "게시 여부를 확인할 수 없습니다. 블로그에서 확인한 뒤 결과를 기록하세요."
      : missed
        ? "지난 예약입니다. 일정을 다시 정하세요."
        : cancelled
          ? "작업을 취소했습니다."
          : jobFailure(e, candidate.type);
    await prisma.$transaction([
      prisma.job.update({
        where: { id: candidate.id },
        data: { status, errorMessage: message, finishedAt: new Date() },
      }),
      prisma.brandLink.update({
        where: { id: candidate.linkId },
        data: {
          status: status === "CANCELLED" ? "READY" : status,
          errorMessage: message,
        },
      }),
      prisma.log.create({
        data: { jobId: candidate.id, action: candidate.type, status, message },
      }),
    ]);
  } finally {
    clearTimeout(deadline);
    clearInterval(heartbeat);
    await browser?.close().catch(() => {});
    await fs.rm(temp, { recursive: true, force: true });
  }
}
async function main() {
  console.log("Naver Writer worker started");
  while (!stopped) {
    try {
      await tick();
    } catch {
      console.error("워커 처리 오류. DB와 실행 환경을 확인하세요.");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  await prisma.workerLease.deleteMany({ where: { id: "naver", owner } });
  await prisma.$disconnect();
}
if (require.main === module) {
  process.on("SIGINT", () => {
    stopped = true;
  });
  process.on("SIGTERM", () => {
    stopped = true;
  });
  void main();
}
