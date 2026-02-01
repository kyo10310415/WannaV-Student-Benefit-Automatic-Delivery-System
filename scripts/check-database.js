/**
 * データベースの状態を確認するスクリプト
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('📊 データベース状態確認');
    console.log('='.repeat(60) + '\n');
    
    // 1. benefit_history テーブルの件数
    const historyCount = await client.query('SELECT COUNT(*) FROM benefit_history');
    console.log(`📋 benefit_history テーブル: ${historyCount.rows[0].count}件`);
    
    // 2. send_logs テーブルの件数
    const logsCount = await client.query('SELECT COUNT(*) FROM send_logs');
    console.log(`📝 send_logs テーブル: ${logsCount.rows[0].count}件\n`);
    
    // 3. benefit_history のカラム確認
    const historyColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'benefit_history'
      ORDER BY ordinal_position
    `);
    
    console.log('🔍 benefit_history テーブルのカラム:');
    historyColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    console.log('');
    
    // 4. send_logs のカラム確認
    const logsColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'send_logs'
      ORDER BY ordinal_position
    `);
    
    console.log('🔍 send_logs テーブルのカラム:');
    logsColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });
    console.log('');
    
    // 5. benefit_history の最新5件
    if (parseInt(historyCount.rows[0].count) > 0) {
      const latestHistory = await client.query(`
        SELECT student_name, student_id, plan_type, last_benefit_rank, last_sent_at
        FROM benefit_history 
        ORDER BY last_sent_at DESC NULLS LAST
        LIMIT 5
      `);
      
      console.log('📋 benefit_history の最新5件:');
      latestHistory.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.student_name} (${row.student_id})`);
        console.log(`     プラン: ${row.plan_type}`);
        console.log(`     最終ランク: ${row.last_benefit_rank || '未送信'}`);
        console.log(`     最終送信: ${row.last_sent_at || '未送信'}`);
        console.log('');
      });
    }
    
    // 6. send_logs の最新10件
    if (parseInt(logsCount.rows[0].count) > 0) {
      const latestLogs = await client.query(`
        SELECT student_name, student_id, benefit_rank, plan_type, status, sent_at, error_message
        FROM send_logs 
        ORDER BY sent_at DESC
        LIMIT 10
      `);
      
      console.log('📝 send_logs の最新10件:');
      latestLogs.rows.forEach((row, index) => {
        const statusIcon = row.status === 'success' ? '✅' : '❌';
        console.log(`  ${index + 1}. ${statusIcon} ${row.student_name} (${row.student_id})`);
        console.log(`     ランク: ${row.benefit_rank}`);
        console.log(`     プラン: ${row.plan_type}`);
        console.log(`     送信日時: ${row.sent_at}`);
        if (row.error_message) {
          console.log(`     エラー: ${row.error_message}`);
        }
        console.log('');
      });
    } else {
      console.log('⚠️ send_logs にデータがありません\n');
      console.log('考えられる原因:');
      console.log('  1. バッチ処理がまだ実行されていない');
      console.log('  2. createSendLog() 関数が正しく呼び出されていない');
      console.log('  3. データベース接続エラーが発生している\n');
    }
    
    console.log('='.repeat(60));
    console.log('✅ 確認完了');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ エラー:', error);
    console.error('詳細:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// スクリプト実行
checkDatabase()
  .then(() => {
    console.log('✅ 処理が完了しました');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 処理が失敗しました:', error);
    process.exit(1);
  });
