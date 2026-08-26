const test = require('node:test');
const assert = require('node:assert/strict');

const { determineCurrentRank } = require('../src/services/benefitService');

const studentId = 'S001';
const achievementDates = { [studentId]: '2026/01/10' };

test('10日達成日になると最初の特典を判定する', () => {
  const rank = determineCurrentRank(
    studentId,
    achievementDates,
    '2026/08/01',
    null,
    null,
    new Date('2026-01-09T15:00:00.000Z')
  );
  assert.equal(rank, '10日達成');
});

test('月次特典は対象月の月初に判定する', () => {
  const rank = determineCurrentRank(
    studentId,
    achievementDates,
    '2026/08/15',
    '10日達成',
    null,
    new Date('2026-07-31T15:00:00.000Z')
  );
  assert.equal(rank, 'ビギナーⅠ');
});

test('支払い待ちの特典は同月の支払い完了後にも判定できる', () => {
  const rank = determineCurrentRank(
    studentId,
    achievementDates,
    '2026/08/15',
    '10日達成',
    'ビギナーⅠ',
    new Date('2026-08-04T15:00:00.000Z')
  );
  assert.equal(rank, 'ビギナーⅠ');
});

test('未実装ランクは送信対象にしない', () => {
  const rank = determineCurrentRank(
    studentId,
    achievementDates,
    '2024/01/01',
    'ゴールド',
    null,
    new Date('2026-08-01T00:00:00.000Z')
  );
  assert.equal(rank, null);
});
