const { sendDiscordMessage } = require('./discord');
const { getMission1AutoSendTargets, getMissionCompletedStudentIds } = require('./googleSheets');
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

/**
 * ミッション提出チェック自動化バッチ（毎日15時JST実行、自動送信より先に実行）
 * スプレッドシートの提出記録とDBを照合し、未完了のミッションに自動でチェックを入れる
 * - ミッション1: 提出確認シートの「ミッション1」D列に学籍番号があればチェック
 * - ミッション2: 提出確認シートの「ミッション2」C列に学籍番号があればチェック
 * - ミッション3: 提出確認シートの「ミッション3」C列に学籍番号があればチェック
 * ※ミッションが開始状態（sent_atあり）のもののみ対象
 */
async function processMissionCompletionCheck() {
  console.log('\n✅ ミッション提出チェック自動化バッチ開始');
  const { getAllStudentMissions, setMissionCompleted } = require('../db/database');
  let checked = 0;
  let skipped = 0;

  // DB上の全ミッション進捗を取得
  const allMissions = await getAllStudentMissions();

  for (const missionNo of [1, 2, 3]) {
    const sentKey      = `mission${missionNo}_sent_at`;
    const completedKey = `mission${missionNo}_completed`;

    // このミッション番号が送信済みかつ未完了のレコードを抽出
    const targets = allMissions.filter(m => m[sentKey] && !m[completedKey]);
    if (targets.length === 0) {
      console.log(`  ミッション${missionNo}: 対象なし`);
      continue;
    }

    // スプレッドシートから提出済み学籍番号セットを取得
    const submittedIds = await getMissionCompletedStudentIds(missionNo);
    if (submittedIds.size === 0) {
      console.log(`  ミッション${missionNo}: スプレッドシートに提出記録なし`);
      continue;
    }

    console.log(`  ミッション${missionNo}: 未完了 ${targets.length}名 / 提出済み ${submittedIds.size}件`);

    for (const record of targets) {
      if (submittedIds.has(record.student_id)) {
        try {
          await setMissionCompleted(record.student_id, missionNo, true);
          checked++;
          console.log(`  ✅ 自動チェック: ${record.student_name}（${record.student_id}）ミッション${missionNo}`);
        } catch (error) {
          console.error(`  ❌ チェック更新エラー: ${record.student_name} ミッション${missionNo}:`, error.message);
        }
        await new Promise(r => setTimeout(r, 200));
      } else {
        skipped++;
      }
    }
  }

  console.log(`✅ ミッション提出チェック完了: 自動チェック ${checked}件 / 未提出スキップ ${skipped}件\n`);
  return { checked, skipped };
}

/**
 * ミッション1の自動送信バッチ（毎日15時JST実行）
 * 条件: B列(学籍番号)あり・M列(チャンネルURL)あり・D列=レッスン準備中・AK列=FALSE(未開始)
 * かつ、DB上でそのstudentIdのmission1_sent_atがNULL（まだ送信していない）
 */
async function processMission1AutoSend() {
  console.log('\n🚀 ミッション1自動送信バッチ開始');
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  // スプレッドシートから対象生徒を取得
  const targets = await getMission1AutoSendTargets();
  console.log(`  対象候補: ${targets.length}名`);

  // DB上の既送信済みを除外
  const { getStudentMission } = require('../db/database');

  for (const student of targets) {
    try {
      // DB確認: すでにミッション1を送信済みならスキップ
      const existing = await getStudentMission(student.studentId);
      if (existing && existing.mission1_sent_at) {
        skipped++;
        continue;
      }

      // ミッション1を送信
      const result = await sendMission1(
        student.studentId,
        student.studentName,
        student.discordChannelUrl,
        student.planType
      );

      if (result.success) {
        sent++;
        console.log(`  ✅ ミッション1自動送信: ${student.studentName}（${student.studentId}）`);
      } else {
        failed++;
        console.error(`  ❌ ${student.studentName}: ${result.error}`);
      }
    } catch (error) {
      failed++;
      console.error(`  ❌ ${student.studentName} エラー:`, error.message);
    }
    // 連続送信の負荷軽減
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`🚀 ミッション1自動送信完了: 送信 ${sent}件 / スキップ ${skipped}件 / 失敗 ${failed}件\n`);
  return { sent, skipped, failed };
}

module.exports = {
  sendMission1,
  sendMissionN,
  processMissionCompletionCheck,
  processMission1AutoSend,
  processMissionAutoSend,
  processReminderAutoSend,
  replaceDatePlaceholder,
  getTomorrowLabel,
  isEntryPlan
};

