/**
 * 业务日期统一使用中国标准时间（Asia/Shanghai），格式 YYYY-MM-DD。
 * 时间戳仍由数据库/JS 按瞬时点处理，只有日历日期字段使用这些函数。
 */
const CHINA_TIME_ZONE = "Asia/Shanghai";
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatLocalDate(date: Date | string | null | undefined): string {
  if (!date) return getBusinessDate();
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return getBusinessDate();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function getBusinessDate(date: Date = new Date()): string {
  return formatDateParts(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CHINA_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
  );
}

function formatDateParts(parts: Intl.DateTimeFormatPart[]): string {
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`无效日期格式：${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new Error(`无效日期：${value}`);
  }
  return date;
}

export function addBusinessDays(date: string, days: number): string {
  const d = parseDateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffBusinessDays(from: string, to: string): number {
  return Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / DAY_MS);
}

export { CHINA_TIME_ZONE };
