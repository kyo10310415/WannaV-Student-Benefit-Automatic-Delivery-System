const { getStudentInfo, getTenDayAchievementDates, getMessageForBenefit, getPaymentStatus } = require('./googleSheets');
const { sendDiscordMessage } = require('./discord');
const { getOrCreateStudentHistory, updateBenefitHistory, setPendingBenefit, createSendLog, getBenefitImage } = require('../db/database');
const { parseDate, getMonthsDifference, getJapanTime } = require('../utils/dateUtils');

// ランク定義（日数・月数ベース）
const RANK_DEFINITIONS = [
  { rank: '10日達成', type: 'achievement', fromOnboarding: true },  // ❹オンボーディングシート R列+2日
  { rank: 'ビギナーⅠ', type: 'months', value: 0, fromLessonStart: true },  // レッスン開始月
  { rank: 'ビギナーⅡ', type: 'months', value: 1, fromLessonStart: true },  // レッスン2ヶ月目
  { rank: 'ビギナーⅢ', type: 'months', value: 2, fromLessonStart: true },  // レッスン3ヶ月目
  { rank: 'ブロンズ', type: 'months', value: 3, fromLessonStart: true },    // レッスン4ヶ月目
  { rank: 'シルバー', type: 'months', value: 6, fromLessonStart: true },    // レッスン7ヶ月目
  { rank: 'ゴールド', type: 'months', value: 12, fromLessonStart: true },   // レッスン13ヶ月目
  { rank: 'プラチナ', type: 'months', value: 18, fromLessonStart: true, enabled: false }, // レッスン19ヶ月目（未実装）
  { rank: 'ブラック', type: 'months', value: 24, fromLessonStart: true, enabled: false }   // レッスン25ヶ月目（未実装）
];

/**
 * 生徒が現在達成すべきランクを判定
 * 支払い完了後すぐに送信: 過去の該当月を過ぎている場合は月初でなくても送信
 * 10日達成: ❹オンボーディングシート R列+2日
 */
function determineCurrentRank(
  studentId,
  tenDayAchievementDateMap,
  lessonStartDate,
  lastSentRank,
  pendingBenefitRank = null,
  referenceDate = new Date()
) {
  const now = getJapanTime(referenceDate);
  const lessonStart = parseDate(lessonStartDate);
  
  // 送信済みランクのインデックスを取得
  const lastRankIndex = lastSentRank 
    ? RANK_DEFINITIONS.findIndex(r => r.rank === lastSentRank)
    : -1;
  
  // 次に送信すべきランクを順番に確認
  for (let i = lastRankIndex + 1; i < RANK_DEFINITIONS.length; i++) {
    const rankDef = RANK_DEFINITIONS[i];

    // メッセージ設定が未実装のランクは送信対象にしない
    if (rankDef.enabled === false) {
      continue;
    }
    
    // 10日達成の判定（❹オンボーディングシート R列+2日）
    if (rankDef.fromOnboarding) {
      const achievementDateStr = tenDayAchievementDateMap[studentId];
      if (!achievementDateStr) {
        // 達成日が見つからない = まだオンボーディング未完了
        // 次のランクへは進まず、処理を完全に停止する
        console.warn(`⚠️ ${studentId}: ❹オンボーディングシートに10日達成日が見つかりません（まだ特典送信不可）`);
        return null;
      }
      
      const achievementDate = parseDate(achievementDateStr);
      if (!achievementDate) {
        console.warn(`⚠️ ${studentId}: 10日達成日の形式が不正です (${achievementDateStr})`);
        return null;
      }
      
      // 現在日時が10日達成日以降かチェック
      if (now >= achievementDate) {
        return rankDef.rank;
      }
      // 10日達成日が未来 → まだ送信タイミングではない → 以降のランクも送らない
      return null;
    }
    
    // 月次ランクの判定（レッスン開始日から○ヶ月目の月初）
    if (rankDef.fromLessonStart && lessonStart) {
      const monthsSinceLessonStart = getMonthsDifference(lessonStart, now);
      
      // 該当月数に達しているか
      if (monthsSinceLessonStart >= rankDef.value) {
        // 該当月を過ぎている場合は月初でなくてもすぐに送信
        // 例: 2026/2/1にビギナーⅡが送信予定だったが支払い未完了でスキップ
        //     → 2026/2/5に支払い完了したら即座に送信
        if (monthsSinceLessonStart > rankDef.value) {
          // 該当月を過ぎている = 既に送信タイミングを過ぎている
          return rankDef.rank;
        } else {
          // 支払い待ちとして記録済みなら、支払い完了後は同月内でも即時送信
          if (pendingBenefitRank === rankDef.rank) {
            return rankDef.rank;
          }

          // 該当月ちょうどで未保留の場合は月初のみ送信
          const isFirstDay = now.getUTCDate() === 1;
          if (isFirstDay) {
            return rankDef.rank;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * 単一生徒の特典送信処理
 */
async function processBenefitForStudent(student, tenDayAchievementDateMap, paymentStatusMap) {
  try {
    console.log(`\n📝 処理開始: ${student.studentName} (${student.studentId})`);
    
    // データベースから履歴を取得または作成
    const history = await getOrCreateStudentHistory({
      studentName: student.studentName,
      studentId: student.studentId,
      planType: student.planType,
      enrollmentDate: null, // 不要になった
      lessonStartDate: student.lessonStartDate || null,
      discordChannelUrl: student.discordChannelUrl
    });
    
    // 現在達成すべきランクを判定
    const currentRank = determineCurrentRank(
      student.studentId,
      tenDayAchievementDateMap,
      student.lessonStartDate,
      history.last_benefit_rank,
      history.pending_benefit_rank
    );
    
    if (!currentRank) {
      console.log(`  ℹ️ ${student.studentName}: 現時点で送信すべき特典なし`);
      return { success: true, skipped: true };
    }
    
    // 10日達成以外は支払い状況をチェック
    if (currentRank !== '10日達成') {
      const paymentStatus = paymentStatusMap[student.studentId];
      if (paymentStatus !== '支払い完了') {
        console.log(`  💳 ${student.studentName}: 前月の支払い未完了 (${paymentStatus || '未記入'}) - スキップ`);
        // スキップしたランクをDBに記録（まだ記録されていない場合のみ更新）
        if (history.pending_benefit_rank !== currentRank) {
          await setPendingBenefit(student.studentId, currentRank);
          console.log(`  📝 ${student.studentName}: ペンディング登録 → ${currentRank}`);
        }
        return { success: true, skipped: true, reason: 'payment_pending' };
      }
      console.log(`  ✅ ${student.studentName}: 前月の支払い完了確認`);
    } else {
      console.log(`  ✨ ${student.studentName}: 10日達成 - 支払い状況チェックをスキップ`);
    }
    
    console.log(`  🎯 ${student.studentName}: ${currentRank} の特典を送信します`);
    
    // メッセージを取得
    let message = await getMessageForBenefit(student.planType, currentRank);
    
    if (!message) {
      console.error(`  ❌ ${student.studentName}: メッセージが取得できませんでした`);
      await createSendLog({
        studentId: student.studentId,
        studentName: student.studentName,
        benefitRank: currentRank,
        planType: student.planType,
        messageContent: null,
        discordChannelUrl: student.discordChannelUrl,
        status: 'failed',
        errorMessage: 'メッセージ取得失敗'
      });
      return { success: false, error: 'メッセージ取得失敗' };
    }
    
    // DiscordユーザーIDがある場合はメンションを追加
    if (student.discordUserId) {
      message = `<@${student.discordUserId}>\n${message}`;
      console.log(`  💬 ${student.studentName}: メンションを追加 (<@${student.discordUserId}>)`);
    }
    
    // ランク別画像を取得
    let imageBuffer = null;
    const imageData = await getBenefitImage(currentRank);
    if (imageData && imageData.image_data) {
      imageBuffer = imageData.image_data;
      console.log(`  🖼️ ${student.studentName}: 画像を添付します (${imageData.image_filename})`);
    }
    
    // Discordに送信
    const discordResult = await sendDiscordMessage(
      student.discordChannelUrl,
      message,
      imageBuffer
    );
    
    if (!discordResult.success) {
      console.error(`  ❌ ${student.studentName}: Discord送信失敗 - ${discordResult.error}`);
      await createSendLog({
        studentId: student.studentId,
        studentName: student.studentName,
        benefitRank: currentRank,
        planType: student.planType,
        messageContent: message,
        discordChannelUrl: student.discordChannelUrl,
        status: 'failed',
        errorMessage: discordResult.error
      });
      return { success: false, error: discordResult.error };
    }
    
    // 送信成功：履歴を更新
    await updateBenefitHistory(student.studentId, currentRank);
    await createSendLog({
      studentId: student.studentId,
      studentName: student.studentName,
      benefitRank: currentRank,
      planType: student.planType,
      messageContent: message,
      discordChannelUrl: student.discordChannelUrl,
      status: 'success'
    });
    
    console.log(`  ✅ ${student.studentName}: ${currentRank} 送信完了`);
    return { success: true, rank: currentRank };
    
  } catch (error) {
    console.error(`  ❌ ${student.studentName}: 処理エラー - ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * 全生徒の特典送信バッチ処理
 */
async function processAllBenefits() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 特典自動送信バッチ処理開始');
  console.log('='.repeat(60));
  
  const startTime = Date.now();
  const results = {
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
  
  try {
    // Google Sheetsから生徒情報を取得
    console.log('\n📊 Google Sheetsからデータ取得中...');
    const students = await getStudentInfo();
    const tenDayAchievementDateMap = await getTenDayAchievementDates();
    const paymentStatusMap = await getPaymentStatus();
    
    console.log(`✅ 取得完了: 対象生徒 ${students.length}名`);
    
    results.total = students.length;
    
    // 各生徒を処理
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      
      const result = await processBenefitForStudent(student, tenDayAchievementDateMap, paymentStatusMap);
      
      if (result.success) {
        if (result.skipped) {
          results.skipped++;
        } else {
          results.success++;
        }
      } else {
        results.failed++;
        results.errors.push({
          student: student.studentName,
          error: result.error
        });
      }
      
      // 連続処理時の負荷軽減
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
  } catch (error) {
    console.error('\n❌ バッチ処理でエラー発生:', error);
    results.errors.push({
      student: 'システム',
      error: error.message
    });
  }
  
  // 結果サマリー表示
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(60));
  console.log('📊 バッチ処理結果サマリー');
  console.log('='.repeat(60));
  console.log(`処理対象: ${results.total}名`);
  console.log(`✅ 送信成功: ${results.success}件`);
  console.log(`⏭️  スキップ: ${results.skipped}件`);
  console.log(`❌ 送信失敗: ${results.failed}件`);
  console.log(`⏱️  処理時間: ${duration}秒`);
  
  if (results.errors.length > 0) {
    console.log('\n⚠️ エラー詳細:');
    results.errors.forEach(err => {
      console.log(`  - ${err.student}: ${err.error}`);
    });
  }
  
  console.log('='.repeat(60) + '\n');
  
  return results;
}

module.exports = {
  processBenefitForStudent,
  processAllBenefits,
  determineCurrentRank
};
