const { sendDiscordMessage } = require('./discord');
const {
  getAllMissionMessages,
  getAllStudentMissions,
  startMission,
  setMissionCompleted,
  setMissionSentAt,
  getMissionAutoSendTargets,
  getMissionAutoSendTargetsForEntry,
  getAllReminderMessages,
  setMissionRemindedAt,
  getReminderTargets
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

/** エントリープランかどうか判定 */
function isEntryPlan(planType) {
  return (planType || '').trim() === 'エントリープラン';
}

/**
 * ミッション1を送信（ミッション開始ボタン押下時）
 * @param {string} planType - プラン種別（エントリープランの場合はミッション2をスキップ）
 */
async function sendMission1(studentId, studentName, discordChannelUrl, planType) {
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

    // DB記録（ミッション開始 + mission1_sent_at + plan_type を記録）
    await startMission(studentId, studentName, discordChannelUrl, planType);
    console.log(`✅ ミッション1送信完了: ${studentName}（翌日: ${getTomorrowLabel(sendDate)}）${isEntryPlan(planType) ? ' ※エントリープランのためミッション2はスキップ' : ''}`);
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
 * - ミッション1完了の翌日15時 → ミッション2を送信（エントリープランはスキップしてミッション3へ）
 * - ミッション2完了の翌日15時 → ミッション3を送信
 */
async function processMissionAutoSend() {
  console.log('\n🎯 ミッション自動送信バッチ開始');
  let sent = 0;
  let failed = 0;

  // ─── ミッション2 ───
  // エントリープランはミッション1完了→ミッション3へ直接送信するためスキップ
  const m2Targets = await getMissionAutoSendTargets(2);
  const m2NonEntry = m2Targets.filter(r => !isEntryPlan(r.plan_type));
  const m2EntrySkipped = m2Targets.length - m2NonEntry.length;
  if (m2EntrySkipped > 0) {
    console.log(`  ミッション2: エントリープラン ${m2EntrySkipped}名をスキップ`);
  }
  console.log(`  ミッション2: 対象 ${m2NonEntry.length}名`);
  for (const record of m2NonEntry) {
    const result = await sendMissionN(2, record.student_id, record.student_name, record.discord_channel_url);
    if (result.success) { sent++; } else { failed++; console.error(`  ❌ ${record.student_name}: ${result.error}`); }
    await new Promise(r => setTimeout(r, 500));
  }

  // ─── ミッション3 ───
  // 通常: ミッション2完了の翌日
  // エントリープラン: ミッション1完了の翌日（ミッション2をスキップ）
  const m3Targets = await getMissionAutoSendTargets(3);
  // エントリープランでミッション1完了済み・ミッション2未送信・ミッション3未送信 の対象を追加
  const m3EntryTargets = await getMissionAutoSendTargetsForEntry();
  // 重複排除（student_idで）
  const m3All = [...m3Targets];
  for (const rec of m3EntryTargets) {
    if (!m3All.find(r => r.student_id === rec.student_id)) m3All.push(rec);
  }
  console.log(`  ミッション3: 対象 ${m3All.length}名（通常 ${m3Targets.length}名 + エントリー ${m3EntryTargets.length}名）`);
  for (const record of m3All) {
    const result = await sendMissionN(3, record.student_id, record.student_name, record.discord_channel_url);
    if (result.success) { sent++; } else { failed++; console.error(`  ❌ ${record.student_name}: ${result.error}`); }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`🎯 ミッション自動送信完了: 成功 ${sent}件 / 失敗 ${failed}件\n`);
  return { sent, failed };
}

/**
 * 毎日15時（JST）に実行するリマインド自動送信バッチ
 * - ミッション送付日から3日経過しても完了チェックがない生徒にリマインドを送信
 * - ミッション1〜3それぞれ対象
 * - リマインドは1回のみ（reminded_at が NULL の場合のみ送信）
 */
async function processReminderAutoSend() {
  console.log('\n🔔 リマインド自動送信バッチ開始');
  let sent = 0;
  let failed = 0;

  // リマインドメッセージを一括取得
  const reminderMessages = await getAllReminderMessages();

  for (const missionNo of [1, 2, 3]) {
    const msg = reminderMessages.find(m => m.mission_no === missionNo);
    if (!msg || !msg.message_content.trim()) {
      console.log(`  ミッション${missionNo}リマインド: メッセージ未設定のためスキップ`);
      continue;
    }

    const targets = await getReminderTargets(missionNo);
    console.log(`  ミッション${missionNo}リマインド: 対象 ${targets.length}名`);

    for (const record of targets) {
      try {
        // ◯月◯日 置換（リマインドは翌日置換を適用）
        const sendDate = new Date();
        const content = replaceDatePlaceholder(msg.message_content, sendDate);

        const result = await sendDiscordMessage(record.discord_channel_url, content);
        if (result.success) {
          await setMissionRemindedAt(record.student_id, missionNo);
          sent++;
          console.log(`  ✅ リマインド送信完了: ${record.student_name} ミッション${missionNo}`);
        } else {
          failed++;
          console.error(`  ❌ リマインド送信失敗: ${record.student_name} ミッション${missionNo}: ${result.error}`);
        }
      } catch (error) {
        failed++;
        console.error(`  ❌ リマインド送信エラー: ${record.student_name} ミッション${missionNo}:`, error.message);
      }
      // 連続送信の負荷軽減
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`🔔 リマインド自動送信完了: 成功 ${sent}件 / 失敗 ${failed}件\n`);
  return { sent, failed };
}

module.exports = {
  sendMission1,
  sendMissionN,
  processMissionAutoSend,
  processReminderAutoSend,
  replaceDatePlaceholder,
  getTomorrowLabel,
  isEntryPlan
};

