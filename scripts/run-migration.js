/**
 * データベースマイグレーション実行スクリプト
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 データベースマイグレーション実行');
    console.log('='.repeat(60) + '\n');
    
    // マイグレーションファイルを読み込み
    const migrationPath = path.join(__dirname, '../migrations/add_pending_columns.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📝 マイグレーション内容:');
    console.log('  - pending_benefit_rank カラムの追加');
    console.log('  - pending_since カラムの追加\n');
    
    // マイグレーション実行
    await client.query(migrationSQL);
    
    console.log('✅ マイグレーション完了\n');
    
    // カラムが追加されたか確認
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'benefit_history' 
      AND column_name IN ('pending_benefit_rank', 'pending_since')
      ORDER BY column_name
    `);
    
    if (result.rows.length > 0) {
      console.log('📊 追加されたカラム:');
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
      console.log('');
    }
    
    console.log('='.repeat(60));
    console.log('✅ マイグレーション成功');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ マイグレーションエラー:', error);
    console.error('詳細:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// スクリプト実行
runMigration()
  .then(() => {
    console.log('✅ 処理が完了しました');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 処理が失敗しました:', error);
    process.exit(1);
  });
