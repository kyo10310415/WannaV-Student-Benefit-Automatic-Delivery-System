/**
 * 日付文字列をパース（様々な形式に対応）
 */
function parseDate(dateString) {
  if (!dateString) return null;
  
  try {
    // YYYY/MM/DD, YYYY-MM-DD, MM/DD/YYYY などに対応
    const date = new Date(dateString);
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
 */
function getJapanTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
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
 * 日付を YYYY/MM/DD HH:mm:ss 形式でフォーマット
 */
function formatDateTime(date) {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
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
