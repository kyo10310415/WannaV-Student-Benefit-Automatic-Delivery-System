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
      if (isNaN(date.getTime())) return null;
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
  const yearDiff = currentDate.getFullYear() - startDate.getFullYear();
  const monthDiff = currentDate.getMonth() - startDate.getMonth();
  return yearDiff * 12 + monthDiff;
}

/**
 * 月初かどうかを判定
 */
function isFirstDayOfMonth(date) {
  return date.getDate() === 1;
}

/**
 * 現在の日本時間を取得
 * UTC+9 オフセットをタイムスタンプに加算して返す
 * ※ 返り値の getFullYear/getMonth/getDate/getHours は JST の値として扱うこと
 */
function getJapanTime() {
  // UTC タイムスタンプに 9 時間分を加算して JST のタイムスタンプとして扱う
  const utcNow = new Date();
  return new Date(utcNow.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * 日付を YYYY-MM-DD 形式でフォーマット
 */
function formatDate(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
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
