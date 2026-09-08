"use client";
import { useCallback, useEffect, useState } from "react";
type Post = {
  imageUrls: string | null;
  id: string;
  title: string;
  sections: string;
  tags: string;
  version: number;
  reviewedVersion: number | null;
  status: string;
};
type Job = {
  id: string;
  type: string;
  status: string;
  scheduledAt: string;
  errorMessage: string | null;
  logs: { id: string; message: string }[];
};
type Link = {
  id: string;
  url: string;
  memo: string;
  productName: string | null;
  productPrice: string | null;
  imageUrls: string | null;
  status: string;
  postUrl: string | null;
  posts: Post[];
  jobs: Job[];
};
type Settings = {
  provider: string;
  model: string;
  keyPresent: boolean;
  blogIdPresent: boolean;
  workerOnline: boolean;
  session: { status: string };
};
function array(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
const labels: Record<string, string> = {
  READY: "대기",
  QUEUED: "실행 대기",
  RUNNING: "실행 중",
  FAILED: "실패",
  NEEDS_REVIEW: "결과 확인 필요",
  PUBLISHED: "발행 완료",
  SUCCEEDED: "완료",
  CANCELLED: "취소",
  SCRAPE: "상품 수집",
  GENERATE: "초안 생성",
  PUBLISH: "발행",
  MISSING: "로그인 필요",
  UNKNOWN: "로그인 확인 필요",
  VALID: "로그인 확인됨",
  EXPIRED: "다시 로그인 필요",
};
async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, {
    method,
    ...(body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error || "요청 실패");
  return j.data;
}
const button =
  "px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-sm";
export default function Dashboard() {
  const [links, setLinks] = useState<Link[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(""),
    [memo, setMemo] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        api("/api/brandlinks"),
        api("/api/settings/status"),
      ]);
      setLinks(l);
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 오류");
    }
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      await refresh();
      if (!stopped) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);
  async function act(
    action: () => Promise<unknown>,
    message = "처리했습니다.",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 오류");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto p-6">
          <p className="text-sm text-blue-700 font-semibold">NAVER WRITER</p>
          <h1 className="text-2xl font-bold mt-1">
            상품에서 초안으로, 검토 후 발행
          </h1>
          <p className="text-slate-500 mt-2">
            상품 정보를 확인하고 내 블로그에 올릴 글을 준비하세요.
          </p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6 space-y-5">
        <section className="bg-white rounded-xl border p-5 space-y-3">
          <h2 className="font-semibold">연결 상태</h2>
          <p>
            {settings?.provider} · {settings?.model} · API 키{" "}
            {settings?.keyPresent ? "입력됨" : "미입력"} · 블로그 ID{" "}
            {settings?.blogIdPresent ? "입력됨" : "미입력"}
          </p>
          <p>
            {labels[settings?.session.status || "UNKNOWN"]} · 작업 실행기{" "}
            {settings?.workerOnline ? "실행 중" : "꺼짐"}
          </p>
          <div className="flex gap-3 items-center">
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                act(
                  () => api("/api/settings/check", "POST"),
                  "API 인증 및 모델 조회 성공. 생성 한도는 실제 생성 요청에서 확인됩니다.",
                )
              }
            >
              AI 연결 확인
            </button>
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                act(() => api("/api/session", "POST"), "로그인 확인 완료")
              }
            >
              로그인 상태 확인
            </button>
            <span className="text-sm text-slate-500">
              최초 로그인: npm run login · 실행기: npm run worker
            </span>
          </div>
          <p className="text-xs text-slate-500">
            예약 시간은 한국 시간입니다. Mac이 깨어 있고 실행기가 켜져 있어야
            합니다. API 키 입력 여부와 실제 연결 성공 여부는 다릅니다.
          </p>
        </section>
        {error && (
          <p role="alert" className="bg-red-50 text-red-700 p-4 rounded-lg">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="bg-blue-50 text-blue-800 p-4 rounded-lg">
            {notice}
          </p>
        )}
        <form
          className="bg-white rounded-xl border p-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api("/api/brandlinks", "POST", { url, memo });
              setUrl("");
              setMemo("");
            }, "상품 링크를 등록했습니다.");
          }}
        >
          <h2 className="font-semibold">상품 등록</h2>
          <input
            aria-label="상품 URL"
            type="url"
            required
            className="border rounded-lg p-3 w-full"
            placeholder="https://naver.me/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <textarea
            aria-label="체험 메모"
            className="border rounded-lg p-3 w-full"
            placeholder="직접 경험한 내용이나 작성 참고 메모 (선택)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <button className={button} disabled={busy}>
            링크 추가
          </button>
        </form>
        {!links.length && (
          <p className="text-center p-10 text-slate-500">
            등록된 상품이 없습니다. 링크를 추가해 시작하세요.
          </p>
        )}
        {links.map((link) => (
          <Product key={link.id} link={link} busy={busy} act={act} />
        ))}
      </main>
    </div>
  );
}
function Product({
  link,
  busy,
  act,
}: {
  link: Link;
  busy: boolean;
  act: (f: () => Promise<unknown>, m?: string) => Promise<void>;
}) {
  const post = link.posts[0];
  const blocked = link.jobs.some((j) =>
    ["QUEUED", "RUNNING", "NEEDS_REVIEW"].includes(j.status),
  );
  const [schedule, setSchedule] = useState("");
  function run(type: string) {
    return act(
      () => api(`/api/brandlinks/${link.id}/${type}`, "POST", {}),
      "작업을 등록했습니다. 실행기가 순서대로 처리합니다.",
    );
  }
  return (
    <article className="bg-white border rounded-xl p-5 space-y-4">
      <div className="flex justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg">
            {link.productName || "상품 정보 수집 전"}
          </h2>
          <p className="text-sm text-slate-500">{link.productPrice}</p>
          <a
            className="text-blue-700 text-sm break-all"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            상품 원본 열기 ↗
          </a>
        </div>
        <span className="text-sm">{labels[link.status] || link.status}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          className={button}
          disabled={busy || blocked || link.status === "PUBLISHED"}
          onClick={() => run("scrape")}
        >
          상품 정보 수집
        </button>
        <button
          className={button}
          disabled={
            busy || blocked || !link.productName || link.status === "PUBLISHED"
          }
          onClick={() => run("generate")}
        >
          AI 초안 생성
        </button>
        {!link.jobs.length && (
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              act(() => api(`/api/brandlinks/${link.id}`, "DELETE"))
            }
          >
            삭제
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        초안 생성은 설정한 AI API를 호출합니다. 제휴 안내와 구매 링크는 발행
        본문 끝에 자동으로 포함됩니다.
      </p>
      {array(link.imageUrls).length > 0 && (
        <div className="flex gap-2 overflow-auto">
          {array(link.imageUrls).map((src, i) => (
            <a
              href={src}
              key={src}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-700 border rounded px-3 py-2"
            >
              상품 이미지 {i + 1} ↗
            </a>
          ))}
        </div>
      )}
      {post && (
        <Draft
          key={`${post.id}:${post.version}:${post.reviewedVersion}`}
          post={post}
          availableImages={array(link.imageUrls)}
          blocked={blocked || busy}
          act={act}
        />
      )}
      {post &&
        post.reviewedVersion === post.version &&
        post.status === "REVIEWED" && (
          <div className="p-4 bg-slate-50 rounded-lg flex gap-3 flex-wrap items-center">
            <button
              className={button}
              disabled={busy || blocked}
              onClick={() => {
                if (confirm("검토한 초안을 네이버 블로그에 실제 발행할까요?"))
                  void run("publish");
              }}
            >
              지금 발행
            </button>
            <input
              aria-label="예약 시간 (한국 시간)"
              type="datetime-local"
              className="border rounded p-2"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            />
            <button
              className={button}
              disabled={busy || blocked || !schedule}
              onClick={() =>
                act(
                  () =>
                    api(`/api/brandlinks/${link.id}/publish`, "POST", {
                      scheduledAt: new Date(
                        schedule + ":00+09:00",
                      ).toISOString(),
                    }),
                  "예약을 등록했습니다.",
                )
              }
            >
              한국 시간으로 예약
            </button>
          </div>
        )}
      {link.postUrl && (
        <a
          href={link.postUrl}
          target="_blank"
          rel="noreferrer"
          className="text-green-700"
        >
          발행된 글 보기 ↗
        </a>
      )}
      <div className="space-y-2">
        {link.jobs.map((j) => (
          <div key={j.id} className="border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span>
                {labels[j.type]} · {labels[j.status]} ·{" "}
                {new Date(j.scheduledAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </span>
              {["QUEUED", "RUNNING"].includes(j.status) && (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      api(`/api/jobs/${j.id}`, "PATCH", { action: "cancel" }),
                    )
                  }
                >
                  취소 요청
                </button>
              )}
            </div>
            {j.errorMessage && (
              <p className="text-red-700 mt-2">{j.errorMessage}</p>
            )}
            {j.status === "NEEDS_REVIEW" && (
              <div className="flex gap-2 mt-2">
                <button
                  className={button}
                  onClick={() => {
                    const postUrl = prompt(
                      "블로그에서 직접 확인한 게시물 URL을 입력하세요.",
                    );
                    if (postUrl)
                      void act(() =>
                        api(`/api/jobs/${j.id}`, "PATCH", {
                          action: "resolve",
                          postUrl,
                        }),
                      );
                  }}
                >
                  게시물 URL 기록
                </button>
                <button
                  className={button}
                  onClick={() => {
                    if (
                      confirm(
                        "블로그에 게시되지 않았음을 직접 확인했나요? 확인 후에만 새 작업을 실행하세요.",
                      )
                    )
                      void act(() =>
                        api(`/api/jobs/${j.id}`, "PATCH", {
                          action: "resolve",
                          confirmNotPublished: true,
                        }),
                      );
                  }}
                >
                  미게시 확인 / 예약 해제
                </button>
              </div>
            )}
            <details className="text-slate-500 mt-2">
              <summary>작업 기록</summary>
              {j.logs.map((l) => (
                <p key={l.id}>{l.message}</p>
              ))}
            </details>
          </div>
        ))}
      </div>
    </article>
  );
}
function Draft({
  post,
  availableImages,
  blocked,
  act,
}: {
  post: Post;
  availableImages: string[];
  blocked: boolean;
  act: (f: () => Promise<unknown>, m?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(post.title),
    [body, setBody] = useState(array(post.sections).join("\n\n---\n\n")),
    [tags, setTags] = useState(array(post.tags).join(", "));
  const [images, setImages] = useState(array(post.imageUrls));
  const changed =
    JSON.stringify(images) !== JSON.stringify(array(post.imageUrls)) ||
    title !== post.title ||
    body !== array(post.sections).join("\n\n---\n\n") ||
    tags !== array(post.tags).join(", ");
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">
        초안 검토 · 버전 {post.version}{" "}
        {post.reviewedVersion === post.version ? "✓ 검토 완료" : ""}
      </h3>
      <input
        aria-label="초안 제목"
        className="border rounded p-3 w-full"
        disabled={blocked || post.status === "PUBLISHED"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        aria-label="초안 본문"
        className="border rounded p-3 w-full min-h-64"
        disabled={blocked || post.status === "PUBLISHED"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <input
        aria-label="해시태그"
        className="border rounded p-3 w-full"
        disabled={blocked || post.status === "PUBLISHED"}
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <fieldset className="flex flex-wrap gap-3">
        <legend className="text-sm mb-2">
          발행에 포함할 이미지 (최대 10개)
        </legend>
        {availableImages.slice(0, 10).map((src, i) => (
          <label key={src} className="text-sm">
            <input
              type="checkbox"
              disabled={blocked || post.status === "PUBLISHED"}
              checked={images.includes(src)}
              onChange={(e) =>
                setImages(
                  e.target.checked
                    ? [...images, src]
                    : images.filter((u) => u !== src),
                )
              }
            />{" "}
            이미지 {i + 1}
          </label>
        ))}
      </fieldset>
      <details className="bg-slate-50 rounded p-4">
        <summary>본문 미리보기</summary>
        <h3 className="font-bold my-3">{title}</h3>
        <div className="whitespace-pre-wrap">
          {body.replace(/\n\n---\n\n/g, "\n\n")}
        </div>
        <p className="mt-3">{tags}</p>
      </details>
      <p className="text-xs text-slate-500">
        섹션 구분은 별도 줄의 ---를 사용하세요. 수정하면 검토를 다시 해야
        합니다.
      </p>
      <p className="text-sm bg-slate-50 p-3">
        이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를
        제공받습니다. (구매 링크와 함께 자동 추가)
      </p>
      <div className="flex gap-2">
        <button
          className={button}
          disabled={blocked || !changed || post.status === "PUBLISHED"}
          onClick={() =>
            act(
              () =>
                api(`/api/posts/${post.id}`, "PATCH", {
                  version: post.version,
                  imageUrls: images,
                  title,
                  sections: body.split(/\n\n---\n\n/),
                  hashtags: tags
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
              "초안을 저장했습니다. 다시 검토하세요.",
            )
          }
        >
          초안 저장
        </button>
        <button
          className={button}
          disabled={
            blocked ||
            changed ||
            post.status === "PUBLISHED" ||
            post.reviewedVersion === post.version
          }
          onClick={() =>
            act(
              () =>
                api(`/api/posts/${post.id}`, "PATCH", {
                  version: post.version,
                  review: true,
                }),
              "검토 완료. 즉시 발행 또는 예약할 수 있습니다.",
            )
          }
        >
          내용 확인 · 검토 완료
        </button>
      </div>
    </section>
  );
}
