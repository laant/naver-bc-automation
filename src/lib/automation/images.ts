import https from "node:https";
export function imageUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    !u.hostname.endsWith(".pstatic.net") ||
    u.port ||
    u.username ||
    u.password
  )
    throw new Error("이미지 주소가 허용되지 않습니다.");
  return u;
}
export async function imageBytes(
  raw: string,
): Promise<{ body: Buffer; extension: string }> {
  const u = imageUrl(raw);
  return new Promise((resolve, reject) => {
    const req = https.get(u, (response) => {
      const type = response.headers["content-type"] || "";
      if (
        response.statusCode !== 200 ||
        !/^image\/(jpeg|png|webp)(;|$)/.test(type) ||
        Number(response.headers["content-length"]) > 10_000_000
      ) {
        response.destroy();
        reject(new Error("이미지 응답 형식 또는 크기 오류"));
        return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > 10_000_000) {
          response.destroy(new Error("이미지 용량 제한 초과"));
        } else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () =>
        resolve({
          body: Buffer.concat(chunks),
          extension: type.includes("png")
            ? "png"
            : type.includes("webp")
              ? "webp"
              : "jpg",
        }),
      );
    });
    const timer = setTimeout(
      () => req.destroy(new Error("이미지 다운로드 시간 초과")),
      15000,
    );
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
  });
}
