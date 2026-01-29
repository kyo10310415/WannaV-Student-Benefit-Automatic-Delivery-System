/**
 * 既に10日達成報酬を送信済みの生徒をデータベースに一括登録
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 10日達成報酬送信済みの生徒リスト
const completedStudents = [
  { studentId: 'OLWV250027-KU', studentName: '蟹龍聖' },
  { studentId: 'OLWV250028-GG', studentName: '小島康稔' },
  { studentId: 'OLWV250030-UN', studentName: '齋藤亮太' },
  { studentId: 'OLWV250032-CE', studentName: '二村歩夢' },
  { studentId: 'OLWV250125-NX', studentName: '齊藤陸' },
  { studentId: 'OLWV250126-OX', studentName: '亀田啓太' },
  { studentId: 'OLWV250127-KX', studentName: '上尾隆夏' },
  { studentId: 'OLWV251330-NM', studentName: '高平史龍' },
  { studentId: 'OLWV250131-ZI', studentName: '谷口拓真' },
  { studentId: 'OLWV250133-II', studentName: '田村良太' },
  { studentId: 'OLWV250156-US', studentName: '生神優季' },
  { studentId: 'OLWV250160-FF', studentName: '内田優慈' },
  { studentId: 'OLWV260163-WF', studentName: '山村将太郎' },
  { studentId: 'OLWV260164-WA', studentName: '植松美羽' },
  { studentId: 'OLWV260269-OZ', studentName: '那須裕介' },
  { studentId: 'OLWV260274-QW', studentName: '川上隼和' },
  { studentId: 'OLWV260276-WQ', studentName: '大塚美和' },
  { studentId: 'OLWV260282-JZ', studentName: '稲福浩志郎' },
  { studentId: 'OLWV260283-LC', studentName: '外舘潤' },
  { studentId: 'OLWV260284-DA', studentName: '大野雅貴' }
];

async function registerCompletedStudents() {
  const client = await pool.connect();
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('📝 10日達成報酬送信済み生徒の一括登録');
    console.log('='.repeat(60));
    console.log(`対象生徒数: ${completedStudents.length}名\n`);
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (const student of completedStudents) {
      try {
        console.log(`処理中: ${student.studentName} (${student.studentId})`);
        
        // 既存レコードを確認
        const checkResult = await client.query(
          'SELECT * FROM benefit_history WHERE student_id = $1',
          [student.studentId]
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
                 updated_at = CURRENT_TIMESTAMP
             WHERE student_id = $1`,
            [student.studentId]
          );
          console.log(`  ✅ 更新成功: 10日達成を登録`);
          successCount++;
          
        } else {
          // 新規レコードを作成（最小限の情報で）
          await client.query(
            `INSERT INTO benefit_history 
             (student_name, student_id, last_benefit_rank, last_sent_at) 
             VALUES ($1, $2, '10日達成', CURRENT_TIMESTAMP)`,
            [student.studentName, student.studentId]
          );
          console.log(`  ✅ 新規登録: 10日達成を登録`);
          successCount++;
        }
        
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
