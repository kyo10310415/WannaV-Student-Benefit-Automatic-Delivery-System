/**
 * 既に10日達成報酬を送信済みの生徒をデータベースに一括登録
 */

require('dotenv').config();
const { Pool } = require('pg');
const { google } = require('googleapis');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Google Sheets API初期化
let sheetsClient = null;

function initializeGoogleSheets() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets API初期化完了');
    return sheetsClient;
  } catch (error) {
    console.error('❌ Google Sheets API初期化エラー:', error.message);
    throw error;
  }
}

// スプレッドシートから生徒情報を取得
async function getStudentInfoFromSheet(studentId) {
  if (!sheetsClient) {
    initializeGoogleSheets();
  }

  const STUDENT_INFO_SPREADSHEET_ID = '1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM';
  
  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: STUDENT_INFO_SPREADSHEET_ID,
      range: '❶RAW_生徒様情報!A2:U'
    });
    
    const rows = response.data.values || [];
    
    // 学籍番号（B列 = index 1）で検索
    for (const row of rows) {
      if (row[1] === studentId) {
        return {
          studentName: row[0] || '',           // A列: 生徒名
          studentId: row[1] || '',             // B列: 学籍番号
          planType: row[2] || 'スタンダードプラン', // C列: プラン種別（デフォルト値）
          memberStatus: row[3] || '',          // D列: 会員ステータス
          discordUserId: row[6] || '',         // G列: DiscordユーザーID
          discordChannelUrl: row[12] || '',    // M列: Discordチャンネル URL
          lessonStartDate: row[20] || ''       // U列: レッスン開始日
        };
      }
    }
    
    return null; // 見つからない場合
  } catch (error) {
    console.error(`❌ スプレッドシート取得エラー:`, error.message);
    return null;
  }
}

// 10日達成報酬送信済みの生徒リスト（学籍番号のみ）
const completedStudentIds = [
  'OLWV250027-KU',
  'OLWV250028-GG',
  'OLWV250030-UN',
  'OLWV250032-CE',
  'OLWV250125-NX',
  'OLWV250126-OX',
  'OLWV250127-KX',
  'OLWV251330-NM',
  'OLWV250131-ZI',
  'OLWV250133-II',
  'OLWV250156-US',
  'OLWV250160-FF',
  'OLWV260163-WF',
  'OLWV260164-WA',
  'OLWV260269-OZ',
  'OLWV260274-QW',
  'OLWV260276-WQ',
  'OLWV260282-JZ',
  'OLWV260283-LC',
  'OLWV260284-DA'
];

async function registerCompletedStudents() {
  const client = await pool.connect();
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('📝 10日達成報酬送信済み生徒の一括登録');
    console.log('='.repeat(60));
    console.log(`対象生徒数: ${completedStudentIds.length}名\n`);
    
    // Google Sheets API初期化
    initializeGoogleSheets();
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    
    for (const studentId of completedStudentIds) {
      try {
        console.log(`処理中: ${studentId}`);
        
        // スプレッドシートから生徒情報を取得
        const studentInfo = await getStudentInfoFromSheet(studentId);
        
        if (!studentInfo) {
          console.log(`  ⚠️  スプレッドシートに見つかりません`);
          notFoundCount++;
          continue;
        }
        
        console.log(`  📋 取得成功: ${studentInfo.studentName} (${studentInfo.planType})`);
        
        // 既存レコードを確認
        const checkResult = await client.query(
          'SELECT * FROM benefit_history WHERE student_id = $1',
          [studentId]
        );
        
        if (checkResult.rows.length > 0) {
          const existing = checkResult.rows[0];
          
          // 既に10日達成が登録されている場合はスキップ
          if (existing.last_benefit_rank === '10日達成') {
            console.log(`  ⏭️  スキップ: 既に10日達成が登録済み`);
            skipCount++;
            continue;
          }
          
          // レコードは存在するが10日達成が未登録の場合は更新
          await client.query(
            `UPDATE benefit_history 
             SET last_benefit_rank = '10日達成', 
                 last_sent_at = CURRENT_TIMESTAMP,
                 plan_type = $1,
                 student_name = $2,
                 discord_channel_url = $3,
                 lesson_start_date = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE student_id = $5`,
            [
              studentInfo.planType,
              studentInfo.studentName,
              studentInfo.discordChannelUrl,
              studentInfo.lessonStartDate || null,
              studentId
            ]
          );
          console.log(`  ✅ 更新成功: 10日達成を登録`);
          successCount++;
          
        } else {
          // 新規レコードを作成
          await client.query(
            `INSERT INTO benefit_history 
             (student_name, student_id, plan_type, discord_channel_url, lesson_start_date, last_benefit_rank, last_sent_at) 
             VALUES ($1, $2, $3, $4, $5, '10日達成', CURRENT_TIMESTAMP)`,
            [
              studentInfo.studentName,
              studentId,
              studentInfo.planType,
              studentInfo.discordChannelUrl,
              studentInfo.lessonStartDate || null
            ]
          );
          console.log(`  ✅ 新規登録: 10日達成を登録`);
          successCount++;
        }
        
        // APIレート制限対策（500ms待機）
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`  ❌ エラー: ${error.message}`);
        errorCount++;
      }
    }
    
    // サマリー表示
    console.log('\n' + '='.repeat(60));
    console.log('📊 登録結果サマリー');
    console.log('='.repeat(60));
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`⏭️  スキップ: ${skipCount}件`);
    console.log(`⚠️  未検出: ${notFoundCount}件`);
    console.log(`❌ エラー: ${errorCount}件`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ 処理中にエラーが発生しました:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// スクリプト実行
registerCompletedStudents()
  .then(() => {
    console.log('✅ 処理が完了しました');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 処理が失敗しました:', error);
    process.exit(1);
  });
