const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPaymentStatusMap } = require('../src/services/googleSheets');

test('ヘッダー名から学籍番号列と対象月列を特定する', () => {
  const result = buildPaymentStatusMap(
    ['状態', '生徒名', 'ふりがな', ' 学籍番号 ', 'プラン', '2026/9'],
    [
      ['completed', '山田太郎', 'やまだ たろう', ' OLWV260294-XA ', 'プレミアムプラン', ' 支払い完了 '],
      ['completed', '田中花子', 'たなか はなこ', 'OLWV260295-XB', 'レギュラープラン', '未払い']
    ],
    '2026/9'
  );

  assert.equal(result.studentIdColumnIndex, 3);
  assert.equal(result.targetColumnIndex, 5);
  assert.deepEqual(result.paymentStatusMap, {
    'OLWV260294-XA': '支払い完了',
    'OLWV260295-XB': '未払い'
  });
});

test('必須ヘッダーがない場合は誤った列を使用しない', () => {
  const missingStudentId = buildPaymentStatusMap(
    ['状態', '生徒名', 'ふりがな', '2026/9'],
    [['completed', '山田太郎', 'OLWV260294-XA', '支払い完了']],
    '2026/9'
  );
  assert.equal(missingStudentId.studentIdColumnIndex, -1);
  assert.deepEqual(missingStudentId.paymentStatusMap, {});

  const missingMonth = buildPaymentStatusMap(
    ['状態', '生徒名', '学籍番号', '2026/10'],
    [['completed', '山田太郎', 'OLWV260294-XA', '支払い完了']],
    '2026/1'
  );
  assert.equal(missingMonth.targetColumnIndex, -1);
  assert.deepEqual(missingMonth.paymentStatusMap, {});
});
