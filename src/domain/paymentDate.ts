// 결제일 계산 (= 결제조건을 발행일에 적용한 값, 명세서 단위). 엑셀엔 없는 새 값 = 앱의 존재 이유.
// 입출력 날짜는 'YYYY-MM-DD' 문자열. 내부 계산은 연·월·일 정수 산술로 (타임존 함정 회피).
import type { PaymentTerms } from './types';

interface YMD {
  year: number;
  month: number; // 1-12
  day: number;
}

export function computeDueDate(issueDate: string, terms: PaymentTerms): string {
  const issue = parseDate(issueDate);

  if (terms.type === 'net') {
    // 발행일 + value일
    return formatDate(addDays(issue, terms.value));
  }

  // dayOfMonth: 발행월 value일이 아직 안 지났으면(발행일 <= value) 이번 달, 지났으면 다음 달.
  const monthOffset = issue.day <= terms.value ? 0 : 1;
  return formatDate(dayOfMonthDate(issue.year, issue.month + monthOffset, terms.value));
}

function parseDate(s: string): YMD {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function formatDate(d: YMD): string {
  return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// 월의 일수 (month 1-12). 윤년 자동 반영.
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// month가 12를 넘으면(다음 달 오버플로) 연도 보정. value가 월 일수보다 크면 월말로 클램프.
function dayOfMonthDate(year: number, month: number, value: number): YMD {
  let y = year;
  let m = month;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const day = Math.min(value, daysInMonth(y, m));
  return { year: y, month: m, day };
}

// net 계산용 일수 더하기. UTC 기준이라 DST 영향 없음.
function addDays(d: YMD, days: number): YMD {
  const dt = new Date(Date.UTC(d.year, d.month - 1, d.day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}
