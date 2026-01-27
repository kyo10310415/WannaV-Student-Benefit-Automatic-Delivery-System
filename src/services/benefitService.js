const { getStudentInfo, getEnrollmentDates, getMessageForBenefit } = require('./googleSheets');
const { sendDiscordMessage } = require('./discord');
const { getOrCreateStudentHistory, updateBenefitHistory, createSendLog } = require('../db/database');
const { parseDate, getDaysDifference, getMonthsDifference, getJapanTime } = require('../utils/dateUtils');

// ランク定義（日数・月数ベース）
const RANK_DEFINITIONS = [
  { rank: '10日達成', type: 'days', value: 10, fromEnrollment: true },
  { rank: 'ビギナーⅠ', type: 'months', value: 0, fromLessonStart: true },  // レッスン開始月
  { rank: 'ビギナーⅡ', type: 'months', value: 1, fromLessonStart: true },  // レッスン2ヶ月目
  { rank: 'ビギナーⅢ', type: 'months', value: 2, fromLessonStart: true },  // レッスン3ヶ月目
  { rank: 'ブロンズ', type: 'months', value: 3, fromLessonStart: true },    // レッスン4ヶ月目
  { rank: 'シルバー', type: 'months', value: 6, fromLessonStart: true },    // レッスン7ヶ月目
  { rank: 'ゴールド', type: 'months', value: 12, fromLessonStart: true },   // レッスン13ヶ月目
  { rank: 'プラチナ', type: 'months', value: 18, fromLessonStart: true },   // レッスン19ヶ月目（未実装）
  { rank: 'ブラック', type: 'months', value: 24, fromLessonStart: true }    // レッスン25ヶ月目（未実装）
];

/**
 * 生徒が現在達成すべきランクを判定
 */
function determineCurrentRank(enrollmentDate, lessonStartDate, lastSentRank) {
  const now = getJapanTime();
  const enrollment = parseDate(enrollmentDate);
  const lessonStart = parseDate(lessonStartDate);
  
  if (!enrollment) {
    console.warn('⚠️ 入会日が不正です');
    return null;
  }
  
  // 送信済みランクのインデックスを取得
  const lastRankIndex = lastSentRank 
    ? RANK_DEFINITIONS.findIndex(r => r.rank === lastSentRank)
    : -1;
  
  // 次に送信すべきランクを順番に確認
  for (let i = lastRankIndex + 1; i < RANK_DEFINITIONS.length; i++) {
    const rankDef = RANK_DEFINITIONS[i];
    
    // 10日達成の判定（入会日から10日経過）
    if (rankDef.fromEnrollment) {
      const daysSinceEnrollment = getDaysDifference(enrollment, now);
      if (daysSinceEnrollment >= rankDef.value) {
        return rankDef.rank;
      }
    }
    
    // 月次ランクの判定（レッスン開始日から○ヶ月目の月初）
    if (rankDef.fromLessonStart && lessonStart) {
      const monthsSinceLessonStart = getMonthsDifference(lessonStart, now);
      
      // 該当月数に達しているか
      if (monthsSinceLessonStart >= rankDef.value) {
        // 月初に送信（月初でない場合は次回に持ち越し）
        const isFirstDay = now.getDate() === 1;
        
        // まだ送信していないランクで、月初の場合に返す
        if (isFirstDay) {
          return rankDef.rank;
        }
      }
    }
  }
  
  return null;
}

/**
 * 単一生徒の特典送信処理
 */
async function processBenefitForStudent(student, enrollmentDate) {
  try {
    console.log(`\n📝 処理開始: ${student.studentName} (${student.studentId})`);
    
    // データベースから履歴を取得または作成
    const history = await getOrCreateStudentHistory({
      studentName: student.studentName,
      studentId: student.studentId,
      planType: student.planType,
      enrollmentDate: enrollmentDate,
      lessonStartDate: student.lessonStartDate,
      discordChannelUrl: student.discordChannelUrl
    });
    
    // 現在達成すべきランクを判定
    const currentRank = determineCurrentRank(
      enrollmentDate,
      student.lessonStartDate,
      history.last_benefit_rank
    );
    
    if (!currentRank) {
      console.log(`  ℹ️ ${student.studentName}: 現時点で送信すべき特典なし`);
      return { success: true, skipped: true };
    }
    
    console.log(`  🎯 ${student.studentName}: ${currentRank} の特典を送信します`);
    
    // メッセージを取得
    const message = await getMessageForBenefit(student.planType, currentRank);
    
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
    
    // Discordに送信
    const discordResult = await sendDiscordMessage(
      student.discordChannelUrl,
      message
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
    const enrollmentDates = await getEnrollmentDates();
    
    console.log(`✅ 取得完了: 対象生徒 ${students.length}名`);
    
    results.total = students.length;
    
    // 各生徒を処理
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const enrollmentDate = enrollmentDates[i] || null;
      
      const result = await processBenefitForStudent(student, enrollmentDate);
      
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
