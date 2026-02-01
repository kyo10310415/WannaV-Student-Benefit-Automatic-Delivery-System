/**
 * 2026/2/1 17時のバッチ処理で送信されたがログが保存されなかった分を手動で修正
 * 
 * Discord送信は成功したが、pending_benefit_rankエラーでログ保存に失敗したケースを想定
 */

require('dotenv').config();
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function fixMissingLogs() {
  const client = await pool.connect();
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔧 2026/2/1 17:00 バッチ処理のログ修正');
    console.log('='.repeat(60) + '\n');
    
    console.log('📋 本日17時に送信された生徒を確認します...\n');
    
    // 2026/2/1 の送信履歴を確認
    const todayHistory = await client.query(`
      SELECT student_name, student_id, last_benefit_rank, last_sent_at
      FROM benefit_history
      WHERE DATE(last_sent_at) = '2026-02-01'
      ORDER BY last_sent_at DESC
    `);
    
    if (todayHistory.rows.length === 0) {
      console.log('⚠️ 本日（2026/2/1）の送信履歴が見つかりません。');
      console.log('');
      console.log('考えられる状況:');
      console.log('  1. benefit_history も更新されていない（重複送信のリスクあり）');
      console.log('  2. まだバッチ処理が実行されていない');
      console.log('');
      
      const answer = await question('Discordで送信された生徒の情報を手動で入力しますか？ (y/n): ');
      
      if (answer.toLowerCase() !== 'y') {
        console.log('\n❌ 処理を中止しました');
        return;
      }
      
      console.log('\n📝 送信された生徒の情報を入力してください\n');
      console.log('例: 井上達貴,OLWV250027-KU,10日達成,スタンダードプラン');
      console.log('複数の場合は改行で区切ってください。入力完了後、空行でEnter\n');
      
      const students = [];
      while (true) {
        const input = await question('生徒情報（名前,学籍番号,ランク,プラン）または空行: ');
        if (!input.trim()) break;
        
        const [name, id, rank, plan] = input.split(',').map(s => s.trim());
        if (name && id && rank && plan) {
          students.push({ name, id, rank, plan });
        } else {
          console.log('⚠️ 形式が正しくありません。スキップします。');
        }
      }
      
      if (students.length === 0) {
        console.log('\n⚠️ 入力された生徒情報がありません。処理を中止します。');
        return;
      }
      
      console.log(`\n📊 入力された生徒: ${students.length}名\n`);
      students.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.name} (${s.id}) - ${s.rank}`);
      });
      
      const confirm = await question('\nこれらの生徒の履歴とログを作成しますか？ (y/n): ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('\n❌ 処理を中止しました');
        return;
      }
      
      // 各生徒の履歴を更新＆ログを作成
      for (const student of students) {
        // benefit_history を更新
        await client.query(`
          UPDATE benefit_history
          SET last_benefit_rank = $1, last_sent_at = '2026-02-01 17:00:00'
          WHERE student_id = $2
        `, [student.rank, student.id]);
        
        // send_logs を作成
        await client.query(`
          INSERT INTO send_logs 
          (student_id, student_name, benefit_rank, plan_type, message_content, discord_channel_url, status, sent_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-02-01 17:00:00')
        `, [
          student.id,
          student.name,
          student.rank,
          student.plan,
          '[手動修正: 実際のメッセージは送信済み]',
          '[Discord送信済み]',
          'success'
        ]);
        
        console.log(`  ✅ ${student.name} - 履歴とログを作成しました`);
      }
      
      console.log('\n✅ 全ての修正が完了しました\n');
      
    } else {
      console.log(`✅ 本日の送信履歴: ${todayHistory.rows.length}件\n`);
      
      todayHistory.rows.forEach((row, index) => {
        console.log(`  ${index + 1}. ${row.student_name} (${row.student_id})`);
        console.log(`     ランク: ${row.last_benefit_rank}`);
        console.log(`     送信日時: ${row.last_sent_at}`);
        console.log('');
      });
      
      console.log('📝 これらの生徒の send_logs を作成します...\n');
      
      const confirm = await question('send_logs を作成しますか？ (y/n): ');
      if (confirm.toLowerCase() !== 'y') {
        console.log('\n❌ 処理を中止しました');
        return;
      }
      
      // 各生徒の send_logs を作成
      for (const row of todayHistory.rows) {
        // 既存のログがあるかチェック
        const existingLog = await client.query(`
          SELECT id FROM send_logs
          WHERE student_id = $1 AND benefit_rank = $2 AND DATE(sent_at) = '2026-02-01'
        `, [row.student_id, row.last_benefit_rank]);
        
        if (existingLog.rows.length > 0) {
          console.log(`  ⏭️  ${row.student_name} - ログは既に存在します`);
          continue;
        }
        
        // プラン情報を取得
        const historyData = await client.query(`
          SELECT plan_type, discord_channel_url FROM benefit_history WHERE student_id = $1
        `, [row.student_id]);
        
        const planType = historyData.rows[0]?.plan_type || 'スタンダードプラン';
        const discordUrl = historyData.rows[0]?.discord_channel_url || '';
        
        // send_logs を作成
        await client.query(`
          INSERT INTO send_logs 
          (student_id, student_name, benefit_rank, plan_type, message_content, discord_channel_url, status, sent_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          row.student_id,
          row.student_name,
          row.last_benefit_rank,
          planType,
          '[手動修正: 17時のバッチで送信済み]',
          discordUrl,
          'success',
          row.last_sent_at
        ]);
        
        console.log(`  ✅ ${row.student_name} - ログを作成しました`);
      }
      
      console.log('\n✅ 全てのログ作成が完了しました\n');
    }
    
    // 最終確認
    const finalCheck = await client.query(`
      SELECT COUNT(*) as count FROM send_logs WHERE DATE(sent_at) = '2026-02-01'
    `);
    
    console.log('='.repeat(60));
    console.log('📊 修正結果');
    console.log('='.repeat(60));
    console.log(`2026/2/1 の send_logs: ${finalCheck.rows[0].count}件`);
    console.log('');
    console.log('✅ これで手動バッチを実行しても重複送信されません');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    console.error('詳細:', error.message);
  } finally {
    rl.close();
    client.release();
    await pool.end();
  }
}

// スクリプト実行
fixMissingLogs()
  .then(() => {
    console.log('✅ 処理が完了しました');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 処理が失敗しました:', error);
    process.exit(1);
  });
