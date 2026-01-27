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
       SET last_benefit_rank = $1, last_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
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

module.exports = {
  pool,
  initializeDatabase,
  getOrCreateStudentHistory,
  updateBenefitHistory,
  createSendLog,
  getAllBenefitHistory,
  getSendLogs
};
