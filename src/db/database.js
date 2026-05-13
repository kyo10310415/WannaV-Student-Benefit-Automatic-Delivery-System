const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL接続プール
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// データベース初期化
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    const fs = require('fs');
    const path = require('path');
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schemaSQL);
    console.log('✅ データベース初期化完了');
  } catch (error) {
    console.error('❌ データベース初期化エラー:', error);
    throw error;
  } finally {
    client.release();
  }
}

// 生徒の履歴を取得または作成
async function getOrCreateStudentHistory(studentData) {
  const client = await pool.connect();
  try {
    // 既存レコード検索
    const selectResult = await client.query(
      'SELECT * FROM benefit_history WHERE student_id = $1',
      [studentData.studentId]
    );

    if (selectResult.rows.length > 0) {
      return selectResult.rows[0];
    }

    // 新規レコード作成
    const insertResult = await client.query(
      `INSERT INTO benefit_history 
       (student_name, student_id, plan_type, enrollment_date, lesson_start_date, discord_channel_url) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        studentData.studentName,
        studentData.studentId,
        studentData.planType,
        studentData.enrollmentDate,
        studentData.lessonStartDate,
        studentData.discordChannelUrl
      ]
    );

    return insertResult.rows[0];
  } finally {
    client.release();
  }
}

// 送信履歴を更新
async function updateBenefitHistory(studentId, benefitRank) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE benefit_history 
       SET last_benefit_rank = $1, last_sent_at = CURRENT_TIMESTAMP, 
           pending_benefit_rank = NULL, pending_since = NULL, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE student_id = $2`,
      [benefitRank, studentId]
    );
  } finally {
    client.release();
  }
}

// 保留中の特典を設定
async function setPendingBenefit(studentId, benefitRank) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE benefit_history 
       SET pending_benefit_rank = $1, pending_since = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE student_id = $2`,
      [benefitRank, studentId]
    );
  } finally {
    client.release();
  }
}

// 送信ログを記録
async function createSendLog(logData) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO send_logs 
       (student_id, student_name, benefit_rank, plan_type, message_content, discord_channel_url, status, error_message) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        logData.studentId,
        logData.studentName,
        logData.benefitRank,
        logData.planType,
        logData.messageContent,
        logData.discordChannelUrl,
        logData.status || 'success',
        logData.errorMessage || null
      ]
    );
  } finally {
    client.release();
  }
}

// 全生徒の履歴を取得（管理画面用）
async function getAllBenefitHistory() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM benefit_history ORDER BY last_sent_at DESC NULLS LAST'
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// 送信ログを取得（管理画面用）
async function getSendLogs(limit = 100) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM send_logs ORDER BY sent_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// ランク別画像を保存または更新
async function saveBenefitImage(benefitRank, imageBuffer, filename, mimetype) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO benefit_images (benefit_rank, image_data, image_filename, image_mimetype, image_size)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (benefit_rank) 
       DO UPDATE SET 
         image_data = EXCLUDED.image_data,
         image_filename = EXCLUDED.image_filename,
         image_mimetype = EXCLUDED.image_mimetype,
         image_size = EXCLUDED.image_size,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [benefitRank, imageBuffer, filename, mimetype, imageBuffer.length]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ランク別画像を取得
async function getBenefitImage(benefitRank) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM benefit_images WHERE benefit_rank = $1',
      [benefitRank]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

// すべての画像情報を取得（管理画面用）
async function getAllBenefitImages() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT benefit_rank, image_filename, image_size, uploaded_at, updated_at FROM benefit_images ORDER BY benefit_rank'
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// 画像を削除
async function deleteBenefitImage(benefitRank) {
  const client = await pool.connect();
  try {
    await client.query(
      'DELETE FROM benefit_images WHERE benefit_rank = $1',
      [benefitRank]
    );
  } finally {
    client.release();
  }
}

// ========================================
// ミッション関連
// ========================================

// ミッションメッセージを全件取得
async function getAllMissionMessages() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM mission_messages ORDER BY mission_no'
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// ミッションメッセージを更新
async function updateMissionMessage(missionNo, messageContent) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE mission_messages SET message_content = $1, updated_at = CURRENT_TIMESTAMP WHERE mission_no = $2`,
      [messageContent, missionNo]
    );
  } finally {
    client.release();
  }
}

// 全生徒のミッション進捗を取得（管理画面用）
async function getAllStudentMissions() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM student_missions ORDER BY created_at DESC'
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// 生徒のミッション進捗を取得（なければnull）
async function getStudentMission(studentId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM student_missions WHERE student_id = $1',
      [studentId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } finally {
    client.release();
  }
}

// ミッション開始（ミッション1送付日を記録）
async function startMission(studentId, studentName, discordChannelUrl) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO student_missions (student_id, student_name, discord_channel_url, mission1_sent_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (student_id) DO UPDATE SET
         student_name = EXCLUDED.student_name,
         discord_channel_url = EXCLUDED.discord_channel_url,
         mission1_sent_at = CURRENT_TIMESTAMP,
         mission1_completed = FALSE,
         mission1_completed_at = NULL,
         mission2_sent_at = NULL,
         mission2_completed = FALSE,
         mission2_completed_at = NULL,
         mission3_sent_at = NULL,
         mission3_completed = FALSE,
         mission3_completed_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, studentName, discordChannelUrl]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

// ミッション完了チェック更新
async function setMissionCompleted(studentId, missionNo, completed) {
  const client = await pool.connect();
  try {
    const completedAtSql = completed
      ? `mission${missionNo}_completed_at = CURRENT_TIMESTAMP`
      : `mission${missionNo}_completed_at = NULL`;
    await client.query(
      `UPDATE student_missions
       SET mission${missionNo}_completed = $1,
           ${completedAtSql},
           updated_at = CURRENT_TIMESTAMP
       WHERE student_id = $2`,
      [completed, studentId]
    );
  } finally {
    client.release();
  }
}

// ミッション送付日を記録（ミッション2 or 3）
async function setMissionSentAt(studentId, missionNo) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE student_missions
       SET mission${missionNo}_sent_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE student_id = $1`,
      [studentId]
    );
  } finally {
    client.release();
  }
}

// ミッション2/3の自動送信対象を取得
// 「前ミッション完了済み」かつ「完了日の翌日15時以降」かつ「次ミッション未送信」の生徒
async function getMissionAutoSendTargets(missionNo) {
  const client = await pool.connect();
  try {
    const prevNo = missionNo - 1;
    // 前ミッション完了日の翌日15時（JST = UTC+9 → 翌日06:00 UTC）以降かつ次ミッション未送信
    const result = await client.query(
      `SELECT * FROM student_missions
       WHERE mission${prevNo}_completed = TRUE
         AND mission${prevNo}_completed_at IS NOT NULL
         AND mission${missionNo}_sent_at IS NULL
         AND (mission${prevNo}_completed_at AT TIME ZONE 'Asia/Tokyo' + INTERVAL '1 day')::DATE
             <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE`
      ,
      []
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// ========================================
// リマインド関連
// ========================================

// リマインドメッセージを全件取得
async function getAllReminderMessages() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM reminder_messages ORDER BY mission_no'
    );
    return result.rows;
  } finally {
    client.release();
  }
}

// リマインドメッセージを更新
async function updateReminderMessage(missionNo, messageContent) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE reminder_messages SET message_content = $1, updated_at = CURRENT_TIMESTAMP WHERE mission_no = $2`,
      [messageContent, missionNo]
    );
  } finally {
    client.release();
  }
}

// リマインド送信済みを記録
async function setMissionRemindedAt(studentId, missionNo) {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE student_missions
       SET mission${missionNo}_reminded_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE student_id = $1`,
      [studentId]
    );
  } finally {
    client.release();
  }
}

// リマインド自動送信対象を取得
// 「ミッション送付済み」かつ「送付日から3日経過」かつ「完了チェックなし」かつ「リマインド未送信」
async function getReminderTargets(missionNo) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM student_missions
       WHERE mission${missionNo}_sent_at IS NOT NULL
         AND mission${missionNo}_completed = FALSE
         AND mission${missionNo}_reminded_at IS NULL
         AND (mission${missionNo}_sent_at AT TIME ZONE 'Asia/Tokyo' + INTERVAL '3 days')::DATE
             <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE`,
      []
    );
    return result.rows;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initializeDatabase,
  getOrCreateStudentHistory,
  updateBenefitHistory,
  setPendingBenefit,
  createSendLog,
  getAllBenefitHistory,
  getSendLogs,
  saveBenefitImage,
  getBenefitImage,
  getAllBenefitImages,
  deleteBenefitImage,
  // ミッション関連
  getAllMissionMessages,
  updateMissionMessage,
  getAllStudentMissions,
  getStudentMission,
  startMission,
  setMissionCompleted,
  setMissionSentAt,
  getMissionAutoSendTargets,
  // リマインド関連
  getAllReminderMessages,
  updateReminderMessage,
  setMissionRemindedAt,
  getReminderTargets
};
