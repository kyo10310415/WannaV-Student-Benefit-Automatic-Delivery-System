process.env.DATABASE_URL = 'postgresql://fixture:fixture-only@localhost/fixture';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '{}';

const test = require('node:test');
const assert = require('node:assert/strict');
const { google } = require('googleapis');
const database = require('../src/db/database');
const { processMissionCompletionCheck } = require('../src/services/missionService');

test('ミッション提出チェックは全角と半角の学籍番号を照合する', async (t) => {
  const sentAt = new Date('2026-11-20T06:00:00Z');
  const sheetRequests = [];
  const completed = [];

  t.mock.method(google, 'sheets', () => ({
    spreadsheets: {
      values: {
        get: async ({ range }) => {
          sheetRequests.push(range);
          const values = {
            'ミッション1!A2:D': [
              ['', '', '', '　ＯLWV000001－ＡＢ　'],
              ['', '', '', 'ＯLWV000001-AB'],
              ['', '', '', 'OLWV000003-AB'],
              ['', '', '', 'OLWV000004-AB']
            ],
            'ミッション2!A2:C': [['', '', 'OLWV000002-AB']],
            'ミッション3!A2:C': [['', '', 'ＯＬＷＶ０００００６－ＡＢ']]
          };
          return { data: { values: values[range] } };
        }
      }
    }
  }));
  t.mock.method(database, 'getAllStudentMissions', async () => [
    { student_id: 'OLWV000001-AB', mission1_sent_at: sentAt },
    { student_id: 'OLWV０００００２-AB', mission2_sent_at: sentAt },
    { student_id: 'OLWV000003-AB', mission1_sent_at: null },
    { student_id: 'OLWV000004-AB', mission1_sent_at: sentAt, mission1_completed: true },
    { student_id: 'OLWV000005-AB', mission1_sent_at: sentAt },
    { student_id: 'OLWV000006-AB', mission3_sent_at: sentAt }
  ]);
  t.mock.method(database, 'setMissionCompleted', async (...args) => completed.push(args));

  assert.deepEqual(await processMissionCompletionCheck(), { checked: 3, skipped: 1 });
  assert.deepEqual(sheetRequests, ['ミッション1!A2:D', 'ミッション2!A2:C', 'ミッション3!A2:C']);
  assert.deepEqual(completed, [
    ['OLWV000001-AB', 1, true],
    ['OLWV０００００２-AB', 2, true],
    ['OLWV000006-AB', 3, true]
  ]);
});
