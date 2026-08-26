/**
 * 日付文字列をパース（様々な形式に対応）
 * YYYY/MM/DD, YYYY-MM-DD 形式を UTC 00:00:00 として解釈する
 */
function parseDate(dateString) {
  if (!dateString) return null;
  
  try {
    const str = String(dateString).trim();
    
    // YYYY/MM/DD または YYYY-MM-DD 形式（例: 2026/3/24, 2026/03/24, 2026-03-24）
    const slashMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (slashMatch) {
      const year  = parseInt(slashMatch[1], 10);
      const month = parseInt(slashMatch[2], 10);
      const day   = parseInt(slashMatch[3], 10);
      // UTC 00:00:00 として生成（タイムゾーンに依存しない）
      const date = new Date(Date.UTC(year, month - 1, day));
      // Date は 2月31日などを翌月へ繰り越すため、元の年月日と一致することも検証する
      if (
        isNaN(date.getTime()) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        return null;
      }
      return date;
    }
    
    // その他の形式はフォールバックとして new Date() で試みる
    const date = new Date(str);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch (error) {
    return null;
  }
}

/**
 * 2つの日付の差を日数で計算
 */
function getDaysDifference(date1, date2) {
  const diffTime = Math.abs(date2 - date1);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 2つの日付の差を月数で計算
 */
function getMonthsDifference(startDate, currentDate) {
  const yearDiff = currentDate.getUTCFullYear() - startDate.getUTCFullYear();
  const monthDiff = currentDate.getUTCMonth() - startDate.getUTCMonth();
  return yearDiff * 12 + monthDiff;
}

/**
 * 月初かどうかを判定
 */
function isFirstDayOfMonth(date) {
  return date.getUTCDate() === 1;
}

/**
 * 現在の日本時間を取得
 * JSTのカレンダー値をUTC getterで参照できるDateとして返す。
 * これにより、ホストOSのタイムゾーンに関係なく同じ判定結果になる。
 * ※ 返り値は getUTCFullYear/getUTCMonth/getUTCDate/getUTCHours で参照すること
 */
function getJapanTime(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23'
  }).formatToParts(referenceDate);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  ));
}

/**
 * 日付を YYYY-MM-DD 形式でフォーマット
 */
function formatDate(date) {
  if (!date) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 日付を YYYY/MM/DD HH:mm:ss 形式でフォーマット（日本時間）
 */
function formatDateTime(date) {
  if (!date) return '';
  
  // 日本時間に変換
  const jstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  
  const year = jstDate.getFullYear();
  const month = String(jstDate.getMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getDate()).padStart(2, '0');
  const hours = String(jstDate.getHours()).padStart(2, '0');
  const minutes = String(jstDate.getMinutes()).padStart(2, '0');
  const seconds = String(jstDate.getSeconds()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
  parseDate,
  getDaysDifference,
  getMonthsDifference,
  isFirstDayOfMonth,
  getJapanTime,
  formatDate,
  formatDateTime
};
