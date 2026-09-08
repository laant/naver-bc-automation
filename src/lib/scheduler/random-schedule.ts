/**
 * 랜덤 스케줄 생성 모듈
 * 09:00 ~ 18:00 사이에 5개의 랜덤 발행 시간 생성
 */

export interface ScheduleConfig {
  startHour: number; // 시작 시간 (기본 9)
  endHour: number; // 종료 시간 (기본 18)
  postCount: number; // 글 개수 (기본 5)
  minGapMinutes: number; // 최소 간격 (분, 기본 30)
}

const DEFAULT_CONFIG: ScheduleConfig = {
  startHour: 9,
  endHour: 18,
  postCount: 5,
  minGapMinutes: 30,
};

/**
 * 주어진 날짜에 대해 랜덤 발행 시간 배열 생성
 * @param date 대상 날짜
 * @param config 스케줄 설정
 * @returns 정렬된 발행 시간 배열
 */
export function generateRandomSchedule(
  date: Date,
  config: Partial<ScheduleConfig> = {},
): Date[] {
  const { startHour, endHour, postCount, minGapMinutes } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  if (
    ![startHour, endHour, postCount, minGapMinutes].every(Number.isInteger) ||
    startHour < 0 ||
    endHour > 24 ||
    startHour >= endHour ||
    postCount < 1 ||
    minGapMinutes < 1
  )
    throw new Error("예약 범위와 개수를 확인하세요.");
  const totalMinutes = (endHour - startHour) * 60;
  if ((postCount - 1) * minGapMinutes >= totalMinutes)
    throw new Error("최소 간격으로 요청 개수를 배치할 수 없습니다.");
  const slack = totalMinutes - 1 - (postCount - 1) * minGapMinutes;
  const offsets = Array.from({ length: postCount }, () =>
    Math.floor(Math.random() * (slack + 1)),
  ).sort((a, b) => a - b);
  const times = offsets.map((offset, i) => offset + i * minGapMinutes);

  // 시간순 정렬 후 Date 객체로 변환
  return times
    .sort((a, b) => a - b)
    .map((minutes) => {
      const result = new Date(date);
      result.setHours(startHour + Math.floor(minutes / 60));
      result.setMinutes(minutes % 60);
      result.setSeconds(0); // 초도 랜덤
      result.setMilliseconds(0);
      return result;
    });
}

/**
 * 오늘 날짜 기준 랜덤 스케줄 생성
 */
export function generateTodaySchedule(
  config: Partial<ScheduleConfig> = {},
): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return generateRandomSchedule(today, config);
}

/**
 * 내일 날짜 기준 랜덤 스케줄 생성
 */
export function generateTomorrowSchedule(
  config: Partial<ScheduleConfig> = {},
): Date[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return generateRandomSchedule(tomorrow, config);
}

/**
 * 스케줄 시간을 사람이 읽기 쉬운 형식으로 포맷
 */
export function formatSchedule(times: Date[]): string[] {
  return times.map((time) =>
    time.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  );
}
