/**
 * 送信ログ保存機能の手動確認スクリプト
 */

require('dotenv').config();
const { createSendLog } = require('../src/db/database');

async function testCreateLog() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 送信ログ保存機能のテスト');
  console.log('='.repeat(60) + '\n');
  
  try {
    // テストログデータ
    const testLog = {
      studentId: 'TEST-001',
      studentName: 'テスト太郎',
      benefitRank: '10日達成',
      planType: 'スタンダードプラン',
      messageContent: 'これはテストメッセージです',
      discordChannelUrl: 'https://discord.com/channels/test/test',
      status: 'success',
      errorMessage: null
    };
    
    console.log('📝 テストログを保存します:');
    console.log(`  生徒名: ${testLog.studentName}`);
    console.log(`  学籍番号: ${testLog.studentId}`);
    console.log(`  ランク: ${testLog.benefitRank}`);
    console.log(`  プラン: ${testLog.planType}`);
    console.log(`  状態: ${testLog.status}\n`);
    
    await createSendLog(testLog);
    
    console.log('✅ テストログの保存に成功しました！\n');
    console.log('次のコマンドで確認してください:');
    console.log('  npm run check:db\n');
    
    console.log('='.repeat(60));
    console.log('✅ テスト完了');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    console.error('詳細:', error.message);
    console.error('\nスタックトレース:');
    console.error(error.stack);
    process.exit(1);
  }
}

// スクリプト実行
testCreateLog()
  .then(() => {
    console.log('✅ 処理が完了しました');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 処理が失敗しました:', error);
    process.exit(1);
  });
