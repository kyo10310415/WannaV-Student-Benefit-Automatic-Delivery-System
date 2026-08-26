const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseDate,
  getMonthsDifference,
  isFirstDayOfMonth,
  getJapanTime,
  formatDate
} = require('../src/utils/dateUtils');

test('parseDate は日付文字列をUTCの日付として解釈する', () => {
  assert.equal(parseDate('2026/8/26').toISOString(), '2026-08-26T00:00:00.000Z');
  assert.equal(parseDate('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
});

test('parseDate は実在しない年月日を拒否する', () => {
  assert.equal(parseDate('2026-02-29'), null);
  assert.equal(parseDate('2026-02-31'), null);
  assert.equal(parseDate('2026-13-01'), null);
});

test('JSTのカレンダー値はホストのタイムゾーンに依存しない', () => {
  const japanTime = getJapanTime(new Date('2026-08-26T15:30:45.000Z'));
  assert.equal(japanTime.toISOString(), '2026-08-27T00:30:45.000Z');
  assert.equal(isFirstDayOfMonth(getJapanTime(new Date('2026-08-31T15:00:00.000Z'))), true);
});

test('月差と日付フォーマットはUTCのカレンダー値で計算する', () => {
  const start = parseDate('2025-12-15');
  const current = parseDate('2026-02-01');
  assert.equal(getMonthsDifference(start, current), 2);
  assert.equal(formatDate(current), '2026-02-01');
});
