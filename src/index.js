const express = require('express');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const { initializeDatabase, getAllBenefitHistory, getSendLogs } = require('./db/database');
const { initializeGoogleSheets } = require('./services/googleSheets');
const { initializeDiscordBot } = require('./services/discord');
const { processAllBenefits } = require('./services/benefitService');
const { formatDateTime } = require('./utils/dateUtils');

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// バッチ処理の実行状態
let isProcessing = false;
let lastRunTime = null;
let lastRunResult = null;

// ルート: トップページ（管理画面）
app.get('/', async (req, res) => {
  try {
    const history = await getAllBenefitHistory();
    const logs = await getSendLogs(50);
    
    res.render('index', {
      history,
      logs,
      lastRunTime,
      lastRunResult,
      isProcessing,
      formatDateTime
    });
  } catch (error) {
    console.error('管理画面エラー:', error);
    res.status(500).send('管理画面の表示に失敗しました');
  }
});

// API: 手動実行
app.post('/api/run-batch', async (req, res) => {
  if (isProcessing) {
    return res.json({
      success: false,
      message: 'バッチ処理は既に実行中です'
    });
  }
  
  try {
    isProcessing = true;
    console.log('🔧 手動バッチ実行開始');
    
    const result = await processAllBenefits();
    
    lastRunTime = new Date();
    lastRunResult = result;
    isProcessing = false;
    
    res.json({
      success: true,
      message: 'バッチ処理が完了しました',
      result
    });
  } catch (error) {
    console.error('手動バッチ実行エラー:', error);
    isProcessing = false;
    res.status(500).json({
      success: false,
      message: 'バッチ処理でエラーが発生しました',
      error: error.message
    });
  }
});

// API: 実行状態確認
app.get('/api/status', (req, res) => {
  res.json({
    isProcessing,
    lastRunTime,
    lastRunResult
  });
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 初期化関数
async function initialize() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 WannaV 生徒様特典自動送付システム 起動中...');
  console.log('='.repeat(60) + '\n');
  
  try {
    // データベース初期化
    console.log('📦 データベース初期化中...');
    await initializeDatabase();
    
    // Google Sheets API初期化
    console.log('📊 Google Sheets API初期化中...');
    initializeGoogleSheets();
    
    // Discord Bot初期化
    console.log('💬 Discord Bot初期化中...');
    await initializeDiscordBot();
    
    console.log('\n✅ すべての初期化が完了しました\n');
  } catch (error) {
    console.error('\n❌ 初期化エラー:', error);
    console.error('環境変数を確認してください\n');
  }
}

// 定期実行スケジュール設定（毎日17時に実行、日本時間）
function setupCronJob() {
  // cron形式: 分 時 日 月 曜日
  // 日本時間17時 = UTC 8時（JST = UTC+9）
  const cronExpression = '0 17 * * *';  // 毎日17時（サーバーのタイムゾーン設定が必要）
  
  cron.schedule(cronExpression, async () => {
    if (isProcessing) {
      console.log('⚠️ 前回のバッチ処理がまだ実行中のため、スキップします');
      return;
    }
    
    try {
      isProcessing = true;
      console.log(`\n⏰ 定期実行開始: ${formatDateTime(new Date())}`);
      
      const result = await processAllBenefits();
      
      lastRunTime = new Date();
      lastRunResult = result;
      isProcessing = false;
      
      console.log(`✅ 定期実行完了: ${formatDateTime(lastRunTime)}\n`);
    } catch (error) {
      console.error('❌ 定期実行エラー:', error);
      isProcessing = false;
    }
  }, {
    timezone: 'Asia/Tokyo'
  });
  
  console.log(`⏰ 定期実行スケジュール設定完了: 毎日17時（日本時間）\n`);
}

// サーバー起動
async function startServer() {
  await initialize();
  setupCronJob();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log(`🌐 サーバー起動完了: http://localhost:${PORT}`);
    console.log('='.repeat(60) + '\n');
  });
}

// サーバー起動
startServer().catch(error => {
  console.error('サーバー起動失敗:', error);
  process.exit(1);
});
