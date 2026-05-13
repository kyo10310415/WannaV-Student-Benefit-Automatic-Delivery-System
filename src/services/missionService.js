const { sendDiscordMessage } = require('./discord');
const {
  getAllMissionMessages,
  getAllStudentMissions,
  startMission,
  setMissionCompleted,
  setMissionSentAt,
  getMissionAutoSendTargets
} = require('../db/database');

/**
 * 送信日の翌日を「◯月◯日」形式で返す（JST基準）
 */
function getTomorrowLabel(baseDate) {
  const tomorrow = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
  // JSTに変換
  const jst = new Date(tomorrow.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return `${jst.getMonth() + 1}月${jst.getDate()}日`;
}

/**
 * メッセージ中の「◯月◯日」を送信翌日の日付に置換
 */
function replaceDatePlaceholder(message, sendDate) {
  const label = getTomorrowLabel(sendDate);
  return message.replace(/◯月◯日/g, label);
}

/**
 * ミッション1を送信（ミッション開始ボタン押下時）
 */
async function sendMission1(studentId, studentName, discordChannelUrl) {
  try {
    // メッセージ取得
    const messages = await getAllMissionMessages();
    const msg = messages.find(m => m.mission_no === 1);
    if (!msg || !msg.message_content.trim()) {
      return { success: false, error: 'ミッション1のメッセージが未設定です' };
    }

    // 送信日の翌日に日付を置換
    const sendDate = new Date();
    const content = replaceDatePlaceholder(msg.message_content, sendDate);

    // Discord送信
    const result = await sendDiscordMessage(discordChannelUrl, content);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // DB記録（ミッション開始 + mission1_sent_at を記録）
    await startMission(studentId, studentName, discordChannelUrl);
    console.log(`✅ ミッション1送信完了: ${studentName}（翌日: ${getTomorrowLabel(sendDate)}）`);
    return { success: true };
  } catch (error) {
    console.error(`❌ ミッション1送信エラー (${studentName}):`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * ミッション2 or 3 を送信（自動送信 or 手動）
 */
async function sendMissionN(missionNo, studentId, studentName, discordChannelUrl) {
  try {
    const messages = await getAllMissionMessages();
    const msg = messages.find(m => m.mission_no === missionNo);
    if (!msg || !msg.message_content.trim()) {
      return { success: false, error: `ミッション${missionNo}のメッセージが未設定です` };
    }

    // 送信日の翌日に日付を置換
    const sendDate = new Date();
    const content = replaceDatePlaceholder(msg.message_content, sendDate);

    const result = await sendDiscordMessage(discordChannelUrl, content);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // 送付日を記録
    await setMissionSentAt(studentId, missionNo);
    console.log(`✅ ミッション${missionNo}送信完了: ${studentName}（翌日: ${getTomorrowLabel(sendDate)}）`);
    return { success: true };
  } catch (error) {
    console.error(`❌ ミッション${missionNo}送信エラー (${studentName}):`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 毎日15時（JST）に実行する自動送信バッチ
 * - 機能がONの場合のみ実行
 * - ミッション1完了の翌日15時 → ミッション2を送信
 * - ミッション2完了の翌日15時 → ミッション3を送信
 */
async function processMissionAutoSend() {
  console.log('\n🎯 ミッション自動送信バッチ開始');
  let sent = 0;
  let failed = 0;

  for (const missionNo of [2, 3]) {
    const targets = await getMissionAutoSendTargets(missionNo);
    console.log(`  ミッション${missionNo}: 対象 ${targets.length}名`);

    for (const record of targets) {
      const result = await sendMissionN(
        missionNo,
        record.student_id,
        record.student_name,
        record.discord_channel_url
      );
      if (result.success) {
        sent++;
      } else {
        failed++;
        console.error(`  ❌ ${record.student_name}: ${result.error}`);
      }
      // 連続送信の負荷軽減
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`🎯 ミッション自動送信完了: 成功 ${sent}件 / 失敗 ${failed}件\n`);
  return { sent, failed };
}

module.exports = {
  sendMission1,
  sendMissionN,
  processMissionAutoSend,
  replaceDatePlaceholder,
  getTomorrowLabel
};

