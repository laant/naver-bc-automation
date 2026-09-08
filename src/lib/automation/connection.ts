import { requireConfig } from "../config";
export async function checkAIConnection() {
  const c = requireConfig(true);
  const endpoint =
    c.provider === "gemini"
      ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}`
      : `https://api.openai.com/v1/models/${encodeURIComponent(c.model)}`;
  const headers: Record<string, string> =
    c.provider === "gemini"
      ? { "x-goog-api-key": c.key! }
      : { Authorization: `Bearer ${c.key}` };
  const response = await fetch(endpoint, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "API 사용량 제한입니다."
        : response.status === 404
          ? "설정한 모델을 사용할 수 없습니다."
          : "API 인증 또는 모델 접근 확인에 실패했습니다. 키와 권한을 확인하세요.",
    );
  return {
    provider: c.provider,
    model: c.model,
    connected: true,
    checkedAt: new Date().toISOString(),
    message: "인증 및 모델 조회 성공. 생성 요청의 사용량 한도는 별도입니다.",
  };
}
