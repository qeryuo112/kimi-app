/**
 * 将 Date 对象格式化为本地日期字符串 YYYY-MM-DD
 * 避免 toISOString() 返回 UTC 日期导致的时区偏移问题
 */
export function formatLocalDate(date: Date | string | null | undefined): string {
  if (!date) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
