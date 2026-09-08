import { Page } from "playwright";
import { imageUrl } from "./images";
export function structuredProduct(
  raw: string[],
): Record<string, unknown> | null {
  function walk(value: unknown, depth = 0): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || depth > 8) return null;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100)) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const row = value as Record<string, unknown>;
    if (
      row["@type"] === "Product" ||
      (Array.isArray(row["@type"]) && row["@type"].includes("Product"))
    )
      return row;
    return walk(row["@graph"], depth + 1);
  }
  for (const json of raw.slice(0, 20)) {
    if (json.length > 1000000) continue;
    try {
      const found = walk(JSON.parse(json));
      if (found) return found;
    } catch {}
  }
  return null;
}

export interface ProductInfo {
  name: string;
  description: string;
  features: string[];
  price: string;
  originalPrice: string; // 원가 (할인 전 가격)
  discountRate: string; // 할인율 (예: "30%")
  couponInfo: string; // 쿠폰 정보
  deliveryInfo: string; // 배송 정보 (무료배송 등)
  reviewCount: string; // 리뷰 수
  rating: string; // 평점
  finalUrl: string;
  storeName: string;
  imagePaths: string[];
  imageUrls: string[];
}

export async function collectProduct(
  page: Page,
  url: string,
): Promise<ProductInfo> {
  console.log("\n📦 STEP 1: 상품 정보 수집");

  const response = await page.goto(url, {
    timeout: 30000,
    waitUntil: "domcontentloaded",
  });
  if (!response?.ok()) throw new Error("상품 페이지 접근 실패");
  await page.waitForTimeout(5000);

  // 1. 상품명 추출 (여러 방법 시도)
  let productName = "";

  // og:title에서 추출
  const ogTitle = await page.$('meta[property="og:title"]');
  if (ogTitle) {
    const content = await ogTitle.getAttribute("content");
    if (content) productName = content.trim();
  }

  // 페이지 내 상품명 요소에서 추출 (더 정확)
  const nameSelectors = [
    "._3oDjSvLwEZ", // 스마트스토어 상품명
    ".product_title",
    "h2._22kNQuEXmb",
    '[class*="product_title"]',
    '[class*="ProductName"]',
  ];

  for (const selector of nameSelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = await el.textContent();
      if (text && text.length > 3) {
        productName = text.trim();
        break;
      }
    }
  }

  console.log(`   📌 상품명: ${productName}`);

  // 2. 상품 설명 추출
  let description = "";
  const descSelectors = [
    "._1s2eOHMQjt", // 스마트스토어 상품 설명
    ".product_detail_description",
    '[class*="description"]',
    'meta[property="og:description"]',
  ];

  for (const selector of descSelectors) {
    if (selector.startsWith("meta")) {
      const meta = await page.$(selector);
      if (meta) {
        description = (await meta.getAttribute("content")) || "";
        break;
      }
    } else {
      const el = await page.$(selector);
      if (el) {
        description = (await el.textContent())?.trim() || "";
        if (description.length > 10) break;
      }
    }
  }
  console.log(`   📝 설명: ${description.substring(0, 50)}...`);

  // 3. 상품 특징/키워드 추출
  const features: string[] = [];
  const featureEls = await page.$$(
    '[class*="benefit"], [class*="feature"], [class*="spec"] li',
  );
  for (const el of featureEls.slice(0, 5)) {
    const text = await el.textContent();
    if (text && text.length > 3 && text.length < 50) {
      features.push(text.trim());
    }
  }
  console.log(`   ✨ 특징: ${features.length}개`);

  // 4. 가격 추출
  let price = "";
  const priceSelectors = [
    "._1LY7DqCnwR",
    ".total_price",
    '[class*="price"]:not([class*="original"])',
  ];
  for (const selector of priceSelectors) {
    const el = await page.$(selector);
    if (el) {
      price = (await el.textContent())?.trim() || "";
      if (price.includes("원")) break;
    }
  }
  console.log(`   💰 가격: ${price}`);

  // 4-1. 원가 (할인 전 가격) 추출
  let originalPrice = "";
  const originalPriceSelectors = [
    "del",
    "strike",
    '[class*="original"]',
    '[class*="before"]',
    "._2DywKu0J_Y", // 스마트스토어 원가
    ".price_del",
  ];
  for (const selector of originalPriceSelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = (await el.textContent())?.trim() || "";
      if (text.includes("원") || /[\d,]+/.test(text)) {
        originalPrice = text;
        break;
      }
    }
  }
  if (originalPrice) console.log(`   💸 원가: ${originalPrice}`);

  // 4-2. 할인율 추출
  let discountRate = "";
  const discountSelectors = [
    '[class*="discount"]',
    '[class*="sale"]',
    "._2pgHN-ntx6", // 스마트스토어 할인율
    ".discount_rate",
    '[class*="percent"]',
  ];
  for (const selector of discountSelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = (await el.textContent())?.trim() || "";
      if (text.includes("%")) {
        discountRate = text.match(/\d+%/)?.[0] || text;
        break;
      }
    }
  }
  if (discountRate) console.log(`   🔥 할인율: ${discountRate}`);

  // 4-3. 쿠폰/혜택 정보 추출
  let couponInfo = "";
  const couponSelectors = [
    '[class*="coupon"]',
    '[class*="benefit"]',
    '[class*="naver_point"]',
    '[class*="npay"]',
    "._1zItxZRrZt", // 스마트스토어 쿠폰
    ".benefit_info",
  ];
  const couponTexts: string[] = [];
  for (const selector of couponSelectors) {
    const els = await page.$$(selector);
    for (const el of els.slice(0, 3)) {
      const text = (await el.textContent())?.trim() || "";
      if (
        text &&
        text.length > 2 &&
        text.length < 100 &&
        !couponTexts.includes(text)
      ) {
        couponTexts.push(text);
      }
    }
  }
  couponInfo = couponTexts.join(" / ");
  if (couponInfo)
    console.log(`   🎁 쿠폰/혜택: ${couponInfo.substring(0, 50)}...`);

  // 4-4. 배송 정보 추출
  let deliveryInfo = "";
  const deliverySelectors = [
    '[class*="delivery"]',
    '[class*="shipping"]',
    "._2OAJPEG1R8", // 스마트스토어 배송
    ".delivery_fee_info",
  ];
  for (const selector of deliverySelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = (await el.textContent())?.trim() || "";
      if (
        text &&
        (text.includes("배송") ||
          text.includes("무료") ||
          text.includes("도착"))
      ) {
        deliveryInfo = text.replace(/\s+/g, " ").substring(0, 50);
        break;
      }
    }
  }
  if (deliveryInfo) console.log(`   🚚 배송: ${deliveryInfo}`);

  // 4-5. 리뷰 수 & 평점 추출
  let reviewCount = "";
  let rating = "";
  const reviewSelectors = [
    '[class*="review"]',
    '[class*="rating"]',
    "._2LvUD5PAiM", // 스마트스토어 리뷰
    ".review_count",
  ];
  for (const selector of reviewSelectors) {
    const el = await page.$(selector);
    if (el) {
      const text = (await el.textContent())?.trim() || "";
      // 리뷰 수 추출 (숫자가 포함된 경우)
      const countMatch = text.match(/[\d,]+(?=\s*개|\s*건)/);
      if (countMatch && !reviewCount) {
        reviewCount = countMatch[0];
      }
      // 평점 추출 (4.8 같은 형태)
      const ratingMatch = text.match(/\d\.\d/);
      if (ratingMatch && !rating) {
        rating = ratingMatch[0];
      }
    }
  }
  if (reviewCount) console.log(`   ⭐ 리뷰: ${reviewCount}개`);
  if (rating) console.log(`   ⭐ 평점: ${rating}`);

  // 5. 상품 이미지 URL 추출
  console.log("   🖼️ 이미지 URL 추출 중...");
  const imageUrls: string[] = [];

  const images = await page.$$("img");
  for (const img of images) {
    let src = await img.getAttribute("src");
    const dataSrc = await img.getAttribute("data-src");
    src = dataSrc || src;

    if (
      src &&
      (src.includes("shop-phinf.pstatic.net") ||
        src.includes("shopping-phinf.pstatic.net")) &&
      !src.includes("icon") &&
      !src.includes("logo") &&
      !src.includes("1x1")
    ) {
      const highRes = src.replace(/\?type=.*/, "?type=w860");
      if (!imageUrls.includes(highRes)) {
        imageUrls.push(highRes);
      }
    }
    if (imageUrls.length >= 15) break; // 더 많이 수집
  }

  console.log(`   🖼️ ${imageUrls.length}개 이미지 발견`);

  const data = structuredProduct(
    await page.locator('script[type="application/ld+json"]').allTextContents(),
  );
  if (typeof data?.name === "string") productName = data.name;
  if (typeof data?.description === "string") description = data.description;
  const offerRaw = Array.isArray(data?.offers) ? data.offers[0] : data?.offers;
  const offer =
    offerRaw && typeof offerRaw === "object"
      ? (offerRaw as Record<string, unknown>)
      : {};
  if (typeof offer.price === "string" || typeof offer.price === "number")
    price = `${offer.price}${offer.priceCurrency === "KRW" ? "원" : typeof offer.priceCurrency === "string" ? " " + offer.priceCurrency : ""}`;
  const ratingData =
    data?.aggregateRating && typeof data.aggregateRating === "object"
      ? (data.aggregateRating as Record<string, unknown>)
      : {};
  if (
    typeof ratingData.ratingValue === "string" ||
    typeof ratingData.ratingValue === "number"
  )
    rating = String(ratingData.ratingValue);
  if (
    typeof ratingData.reviewCount === "string" ||
    typeof ratingData.reviewCount === "number"
  )
    reviewCount = String(ratingData.reviewCount);
  const schemaImages =
    typeof data?.image === "string"
      ? [data.image]
      : Array.isArray(data?.image)
        ? data.image.filter((v): v is string => typeof v === "string")
        : [];
  const safeImages = [...new Set([...schemaImages, ...imageUrls])]
    .filter((raw) => {
      try {
        imageUrl(raw);
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, 10);
  const imagePaths: string[] = [];
  if (
    !productName ||
    /접근.*제한|서비스.*오류|로그인|페이지를 찾을 수/.test(productName)
  )
    throw new Error(
      "상품명을 수집할 수 없습니다. URL과 페이지 접근 상태를 확인하세요.",
    );
  return {
    name: productName.slice(0, 500),
    finalUrl: page.url(),
    storeName:
      (await page
        .locator('meta[property="og:site_name"]')
        .getAttribute("content")
        .catch(() => "")) || "",
    description: description.slice(0, 8000),
    features,
    price: price.slice(0, 100),
    originalPrice,
    discountRate,
    couponInfo,
    deliveryInfo,
    reviewCount,
    rating,
    imagePaths,
    imageUrls: safeImages,
  };
}
