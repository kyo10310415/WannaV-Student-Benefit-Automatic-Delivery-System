const express = require('express');
const cron = require('node-cron');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const { initializeDatabase, getAllBenefitHistory, getSendLogs, saveBenefitImage, getBenefitImage, getAllBenefitImages, deleteBenefitImage } = require('./db/database');
const { initializeGoogleSheets, getMessageForBenefit } = require('./services/googleSheets');
const { initializeDiscordBot, sendDiscordMessage } = require('./services/discord');
const { processAllBenefits } = require('./services/benefitService');
const { formatDateTime } = require('./utils/dateUtils');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer設定（メモリストレージ）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB制限
  },
  fileFilter: (req, file, cb) => {
    // PNG, JPEG, GIF, WEBPのみ許可
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('画像ファイルのみアップロード可能です'));
    }
  }
});

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
    const images = await getAllBenefitImages();
    const cronEnabled = process.env.ENABLE_CRON === 'true';
    
    res.render('index', {
      history,
      logs,
      images,
      lastRunTime,
      lastRunResult,
      isProcessing,
      cronEnabled,
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

// API: テスト送信
app.post('/api/test-send', async (req, res) => {
  const { planType, benefitRank } = req.body;
  
  // 固定のテスト送信先
  const testChannelUrl = 'https://discord.com/channels/1176426605309083678/1293539258069417994';
  
  if (!planType || !benefitRank) {
    return res.status(400).json({
      success: false,
      message: 'プランタイプと特典ランクを指定してください'
    });
  }
  
  try {
    console.log(`🧪 テスト送信: ${planType} - ${benefitRank}`);
    
    // メッセージを取得
    const message = await getMessageForBenefit(planType, benefitRank);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'メッセージが見つかりませんでした'
      });
    }
    
    // ランク別画像を取得
    let imageBuffer = null;
    const imageData = await getBenefitImage(benefitRank);
    if (imageData && imageData.image_data) {
      imageBuffer = imageData.image_data;
      console.log(`  🖼️ テスト送信: 画像を添付します (${imageData.image_filename})`);
    }
    
    // Discordに送信
    const result = await sendDiscordMessage(testChannelUrl, message, imageBuffer);
    
    if (result.success) {
      console.log(`✅ テスト送信成功: ${planType} - ${benefitRank}`);
      res.json({
        success: true,
        message: 'テスト送信が完了しました',
        planType,
        benefitRank,
        channelUrl: testChannelUrl
      });
    } else {
      console.error(`❌ テスト送信失敗: ${result.error}`);
      res.status(500).json({
        success: false,
        message: 'Discord送信に失敗しました',
        error: result.error
      });
    }
  } catch (error) {
    console.error('テスト送信エラー:', error);
    res.status(500).json({
      success: false,
      message: 'テスト送信でエラーが発生しました',
      error: error.message
    });
  }
});

// API: 画像アップロード
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    const { benefitRank } = req.body;
    
    if (!benefitRank) {
      return res.status(400).json({
        success: false,
        message: '特典ランクを指定してください'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '画像ファイルをアップロードしてください'
      });
    }
    
    console.log(`📤 画像アップロード: ${benefitRank} - ${req.file.originalname}`);
    
    // データベースに保存
    await saveBenefitImage(
      benefitRank,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    
    console.log(`✅ 画像保存成功: ${benefitRank}`);
    
    res.json({
      success: true,
      message: '画像がアップロードされました',
      benefitRank,
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('画像アップロードエラー:', error);
    res.status(500).json({
      success: false,
      message: '画像アップロードでエラーが発生しました',
      error: error.message
    });
  }
});

// API: 画像取得（プレビュー用）
app.get('/api/image/:benefitRank', async (req, res) => {
  try {
    const { benefitRank } = req.params;
    const imageData = await getBenefitImage(benefitRank);
    
    if (!imageData || !imageData.image_data) {
      return res.status(404).json({
        success: false,
        message: '画像が見つかりません'
      });
    }
    
    res.set('Content-Type', imageData.image_mimetype);
    res.send(imageData.image_data);
  } catch (error) {
    console.error('画像取得エラー:', error);
    res.status(500).json({
      success: false,
      message: '画像取得でエラーが発生しました'
    });
  }
});

// API: 画像削除
app.delete('/api/image/:benefitRank', async (req, res) => {
  try {
    const { benefitRank } = req.params;
    
    await deleteBenefitImage(benefitRank);
    
    console.log(`🗑️ 画像削除成功: ${benefitRank}`);
    
    res.json({
      success: true,
      message: '画像が削除されました',
      benefitRank
    });
  } catch (error) {
    console.error('画像削除エラー:', error);
    res.status(500).json({
      success: false,
      message: '画像削除でエラーが発生しました',
      error: error.message
    });
  }
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
  // 環境変数で定期実行を制御（デフォルト: オフ）
  const enableCron = process.env.ENABLE_CRON === 'true';
  
  if (!enableCron) {
    console.log('⏸️  定期実行は無効化されています（環境変数 ENABLE_CRON=true で有効化）\n');
    return;
  }
  
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
