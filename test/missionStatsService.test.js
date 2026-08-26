const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildMissionMonthlyStats,
  getJstMonthKey,
  isValidMonthKey
} = require('../src/services/missionStatsService');

test('UTC日時をJSTの年月へ変換する', () => {
  assert.equal(getJstMonthKey('2026-07-31T15:00:00.000Z'), '2026-08');
  assert.equal(getJstMonthKey('2026-08-31T14:59:59.000Z'), '2026-08');
  assert.equal(getJstMonthKey('invalid'), null);
});

test('年月キーを検証する', () => {
  assert.equal(isValidMonthKey('2026-08'), true);
  assert.equal(isValidMonthKey('2026-13'), false);
  assert.equal(isValidMonthKey('2026-8'), false);
});

test('送付月ごとに全体とミッション別の達成率を集計する', () => {
  const result = buildMissionMonthlyStats([
    {
      student_id: 'S001',
      mission_no: 1,
      sent_at: new Date('2026-07-31T15:00:00.000Z'),
      completed: true
    },
    {
      student_id: 'S001',
      mission_no: 2,
      sent_at: new Date('2026-08-02T03:00:00.000Z'),
      completed: false
    },
    {
      student_id: 'S002',
      mission_no: 1,
      sent_at: new Date('2026-08-03T03:00:00.000Z'),
      completed: true
    },
    {
      student_id: 'S003',
      mission_no: 1,
      sent_at: new Date('2026-06-01T03:00:00.000Z'),
      completed: true
    }
  ], '2026-08');

  assert.equal(result.selected.monthLabel, '2026年8月');
  assert.deepEqual(result.selected.overall, {
    sentCount: 3,
    completedCount: 2,
    studentCount: 2,
    achievementRate: 66.7
  });
  assert.equal(result.selected.missions[1].achievementRate, 100);
  assert.equal(result.selected.missions[2].achievementRate, 0);
  assert.equal(result.monthly[0].month, '2026-08');
  assert.equal(result.monthly[1].month, '2026-06');
});

test('データがない選択月も0件として返す', () => {
  const result = buildMissionMonthlyStats([], '2025-12');
  assert.equal(result.selected.month, '2025-12');
  assert.equal(result.selected.overall.sentCount, 0);
  assert.equal(result.selected.overall.achievementRate, 0);
  assert.deepEqual(result.monthly, []);
});
