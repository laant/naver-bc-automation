export function productUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("상품 URL을 확인하세요.");
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.port ||
    u.username ||
    u.password ||
    ![
      "naver.me",
      "smartstore.naver.com",
      "brand.naver.com",
      "shopping.naver.com",
      "shoppingconnect.naver.com",
      "brandconnect.naver.com",
    ].includes(u.hostname)
  )
    throw new Error("지원되는 네이버 HTTPS 상품 URL만 입력하세요.");
  u.hash = "";
  return u.toString();
}
export function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("입력 길이 또는 형식이 올바르지 않습니다.");
  return value.trim();
}
export function strings(value: unknown, max = 30): string[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((v) => typeof v !== "string" || v.length > 20000)
  )
    throw new Error("본문 또는 태그 형식이 올바르지 않습니다.");
  return value;
}
export function draft(value: unknown) {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== "object") throw new Error("초안 형식 오류");
  const title = text(v.title, 120),
    sections = strings(v.sections),
    hashtags = strings(v.hashtags);
  if (sections.join("").length > 20000 || hashtags.some((t) => t.length > 60))
    throw new Error("본문은 20,000자, 태그는 각각 60자 이하로 입력하세요.");
  if (!title || !sections.length || !sections.some((s) => s.trim()))
    throw new Error("제목과 본문을 입력하세요.");
  return { title, sections, hashtags };
}
export function publishedUrl(raw: string, blogId: string): string | null {
  try {
    const u = new URL(raw);
    if (
      u.protocol !== "https:" ||
      !["blog.naver.com", "m.blog.naver.com"].includes(u.hostname)
    )
      return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const id = u.searchParams.get("blogId"),
      no = u.searchParams.get("logNo");
    if (
      (parts[0] === blogId && /^\d+$/.test(parts[1] || "")) ||
      (id === blogId && /^\d+$/.test(no || ""))
    )
      return u.href;
  } catch {}
  return null;
}
