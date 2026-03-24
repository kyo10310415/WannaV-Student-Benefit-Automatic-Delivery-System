/**
 * 10日達成 バックフィルスクリプト
 *
 * 【処理内容】
 * - R列+2日が 3/10以前  かつ DBなし → DB登録のみ（手動送信済みのため）
 * - R列+2日が 3/10〜3/23 かつ DBなし → 10日達成を送信 + DB登録
 * - R列+2日が 3/24以降              → スキップ（今後のバッチで送信）
 * - 既にDB登録済み                  → スキップ
 */

require('dotenv').config();

const { getStudentInfo, getTenDayAchievementDates, getMessageForBenefit } = require('../src/services/googleSheets');
const { sendDiscordMessage, initializeDiscordBot } = require('../src/services/discord');
const { getOrCreateStudentHistory, updateBenefitHistory, createSendLog, getBenefitImage } = require('../src/db/database');

// 3/10以降を送信対象、3/24未満（=3/23まで）
const SEND_FROM = new Date(Date.UTC(2026, 2, 10)); // 2026/03/10
const SEND_TO   = new Date(Date.UTC(2026, 2, 24)); // 2026/03/24

function parseAchievementDate(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

async function run() {
  console.log('\n========================================');
  console.log('10日達成 バックフィル処理開始');
  console.log('========================================\n');

  await initializeDiscordBot();

  const [students, dateMap] = await Promise.all([
    getStudentInfo(),
    getTenDayAchievementDates()
  ]);

  console.log(`対象生徒数: ${students.length}名\n`);

  let registered = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of students) {
    const dateStr = dateMap[s.studentId];

    if (!dateStr) {
      console.log(`⏭  スキップ(R列なし): ${s.studentId}`);
      skipped++;
      continue;
    }

    const achievementDate = parseAchievementDate(dateStr);
    if (!achievementDate) {
      console.log(`⏭  スキップ(日付不正): ${s.studentId} ${dateStr}`);
      skipped++;
      continue;
    }

    // DB登録（なければ新規作成）
    const history = await getOrCreateStudentHistory({
      studentName: s.studentName,
      studentId: s.studentId,
      planType: s.planType,
      enrollmentDate: null,
      lessonStartDate: s.lessonStartDate,
      discordChannelUrl: s.discordChannelUrl
    });

    // 既に送信済みならスキップ
    if (history.last_benefit_rank) {
      console.log(`⏭  スキップ(送信済み): ${s.studentId} [${history.last_benefit_rank}]`);
      skipped++;
      continue;
    }

    if (achievementDate < SEND_FROM) {
      // 3/10以前 → 送信なしでDB登録のみ
      await updateBenefitHistory(s.studentId, '10日達成');
      console.log(`📝 DB登録のみ(手動送信済み): ${s.studentId} 達成日:${dateStr}`);
      registered++;

    } else if (achievementDate < SEND_TO) {
      // 3/10〜3/23 → 実際に送信
      let message = await getMessageForBenefit(s.planType, '10日達成');
      if (!message) {
        console.log(`❌ エラー(メッセージなし): ${s.studentId}`);
        failed++;
        continue;
      }

      if (s.discordUserId) {
        message = `<@${s.discordUserId}>\n${message}`;
      }

      const imageData = await getBenefitImage('10日達成');
      const imageBuffer = imageData?.image_data || null;

      const result = await sendDiscordMessage(s.discordChannelUrl, message, imageBuffer);

      if (result.success) {
        await updateBenefitHistory(s.studentId, '10日達成');
        await createSendLog({
          studentId: s.studentId,
          studentName: s.studentName,
          benefitRank: '10日達成',
          planType: s.planType,
          messageContent: message,
          discordChannelUrl: s.discordChannelUrl,
          status: 'success'
        });
        console.log(`✅ 送信成功: ${s.studentId} 達成日:${dateStr}`);
        sent++;
      } else {
        await createSendLog({
          studentId: s.studentId,
          studentName: s.studentName,
          benefitRank: '10日達成',
          planType: s.planType,
          messageContent: message,
          discordChannelUrl: s.discordChannelUrl,
          status: 'failed',
          errorMessage: result.error
        });
        console.log(`❌ 送信失敗: ${s.studentId} ${result.error}`);
        failed++;
      }

      await new Promise(r => setTimeout(r, 500));

    } else {
      console.log(`⏭  スキップ(未来日): ${s.studentId} 達成日:${dateStr}`);
      skipped++;
    }
  }

  console.log('\n========================================');
  console.log('処理完了');
  console.log('========================================');
  console.log(`📝 DB登録のみ(手動済み): ${registered}件`);
  console.log(`✅ 送信成功:             ${sent}件`);
  console.log(`⏭  スキップ:             ${skipped}件`);
  console.log(`❌ 失敗:                 ${failed}件`);
  console.log('========================================\n');

  process.exit(0);
}

run().catch(e => {
  console.error('❌ 処理エラー:', e);
  process.exit(1);
});
