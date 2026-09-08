import { Page } from "playwright";
import { requireConfig } from "../config";
export async function step3_openEditor(page: Page): Promise<void> {
  console.log("\n📄 STEP 3: 블로그 글쓰기 페이지");

  await page.goto(
    `https://blog.naver.com/${requireConfig().blogId}/postwrite`,
    { timeout: 30000 },
  );
  await page.waitForTimeout(5000);

  // 팝업 닫기 (작성 중인 글 있습니다)
  try {
    const cancelBtn = await page.$(".se-popup-button-cancel");
    if (cancelBtn) {
      await cancelBtn.click();
      console.log("   팝업 닫음");
      await page.waitForTimeout(1000);
    }
  } catch {}

  console.log("   ✅ 에디터 준비 완료");
}

// ============================================
// STEP 4: 제목 입력
// ============================================
export async function step4_inputTitle(
  page: Page,
  title: string,
): Promise<void> {
  console.log("\n✏️ STEP 4: 제목 입력");

  // 제목 영역 클릭
  const titleArea = await page.$(".se-documentTitle .se-text-paragraph");
  if (titleArea) {
    await titleArea.click();
    await page.waitForTimeout(300);
  } else {
    throw new Error("제목 입력 영역을 찾을 수 없습니다.");
  }

  await page.keyboard.insertText(title);
  console.log(`   ✅ 제목 입력: "${title}"`);
}

// ============================================
// STEP 5: 이미지 1장 업로드 (반복 호출용)
// ============================================
async function uploadOneImage(page: Page, imagePath: string): Promise<boolean> {
  try {
    const imageBtn = await page.$('button[data-name="image"]');
    if (imageBtn) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
        imageBtn.click(),
      ]);

      if (fileChooser) {
        await fileChooser.setFiles(imagePath);
        await page.waitForTimeout(2500); // 업로드 완료 대기
        return true;
      }
    }
  } catch {
    console.log("이미지 업로드 실패");
  }
  return false;
}

// 텍스트 섹션 입력 (줄바꿈 포함)
async function inputTextSection(page: Page, text: string): Promise<void> {
  // \n을 실제 줄바꿈으로 처리
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      // 빈 줄이면 Enter만
      await page.keyboard.press("Enter");
    } else {
      // 텍스트가 있으면 입력 후 Enter
      await page.keyboard.insertText(line);
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(50);
  }

  // 섹션 끝에 여백 추가
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
}

// ============================================
// STEP 5+6: 이미지와 본문 번갈아 입력
// ============================================
export async function step5and6_uploadAndWrite(
  page: Page,
  imagePaths: string[],
  sections: string[],
  hashtags: string[],
): Promise<void> {
  console.log("\n📝 STEP 5+6: 이미지 + 본문 번갈아 입력");

  // 본문 영역으로 이동
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);

  const maxLoop = Math.max(imagePaths.length, sections.length);
  let uploadedCount = 0;

  for (let i = 0; i < maxLoop; i++) {
    // 이미지 업로드 (있으면)
    if (i < imagePaths.length) {
      console.log(`   [${i + 1}] 🖼️ 이미지 업로드...`);
      const success = await uploadOneImage(page, imagePaths[i]);
      if (!success) throw new Error("상품 이미지 업로드 실패");
      uploadedCount++;
    }

    // 텍스트 섹션 입력 (있으면)
    if (i < sections.length) {
      console.log(`   [${i + 1}] ✏️ 텍스트 입력 (${sections[i].length}자)`);
      await inputTextSection(page, sections[i]);
      await page.waitForTimeout(300);
    }
  }

  // 해시태그 (맨 마지막) - 스페이스 제거하여 태그 깨짐 방지
  await page.keyboard.press("Enter");
  const hashtagText = hashtags
    .map((t: string) => `#${t.replace(/\s+/g, "")}`)
    .join(" ");
  await page.keyboard.type(hashtagText, { delay: 10 });

  console.log(`\n   ✅ 총 이미지 ${uploadedCount}개 업로드`);
  console.log(`   ✅ 총 섹션 ${sections.length}개 입력`);
  console.log(`   ✅ 해시태그 ${hashtags.length}개`);
}
