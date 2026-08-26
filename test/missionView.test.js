const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const { buildMissionMonthlyStats } = require('../src/services/missionStatsService');

test('ミッション管理画面に年月選択・選択月結果・全期間一覧を表示する', async () => {
  const missionStats = buildMissionMonthlyStats([
    {
      student_id: 'S001',
      mission_no: 1,
      sent_at: new Date('2026-08-01T00:00:00.000Z'),
      completed: true
    },
    {
      student_id: 'S002',
      mission_no: 1,
      sent_at: new Date('2026-08-02T00:00:00.000Z'),
      completed: false
    },
    {
      student_id: 'S003',
      mission_no: 2,
      sent_at: new Date('2026-07-02T00:00:00.000Z'),
      completed: true
    }
  ], '2026-08');

  const html = await ejs.renderFile(path.join(__dirname, '../views/mission.ejs'), {
    messages: [],
    reminderMessages: [],
    sheetStudents: [],
    missionMap: {},
    missionEnabled: false,
    missionStats,
    formatDateTime: () => ''
  });

  assert.match(html, /type="month"/);
  assert.match(html, /value="2026-08"/);
  assert.match(html, /2026年8月 の結果/);
  assert.match(html, /過去のデータ（全期間）/);
  assert.match(html, /2026年7月/);
  assert.match(html, />50<\/strong><span>%<\/span>/);
});
