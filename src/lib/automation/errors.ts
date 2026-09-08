export function jobFailure(error: unknown, stage: string) {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
  if (status === 429)
    return "AI 사용량 한도 초과입니다. 공급자의 한도·결제 설정을 확인한 뒤 다시 실행하세요.";
  if (status === 401 || status === 403)
    return "AI 키 인증 또는 모델 권한 오류입니다. 연결 상태를 확인하세요.";
  if (status === 404 && stage === "GENERATE")
    return "설정한 AI 모델을 찾을 수 없습니다. 모델 설정을 확인하세요.";
  if (error instanceof SyntaxError)
    return "수집 데이터 또는 AI 응답 형식 오류입니다. 다시 수집·생성하세요.";
  return `${stage} 작업 실패. 설정·로그인·상품 접근 상태를 확인하세요.`;
}
