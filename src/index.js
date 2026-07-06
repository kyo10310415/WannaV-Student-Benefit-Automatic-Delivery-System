const express = require('express');
const cron = require('node-cron');
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { initializeDatabase, getAllBenefitHistory, getSendLogs, saveBenefitImage, getBenefitImage, getAllBenefitImages, deleteBenefitImage,
  getAllMissionMessages, updateMissionMessage, getAllStudentMissions, getStudentMission, startMission, setMissionCompleted, setMissionSentAt,
  getAllReminderMessages, updateReminderMessage,
  getSetting, setSetting
} = require('./db/database');
const { initializeGoogleSheets, getMessageForBenefit, getMissionStudentList } = require('./services/googleSheets');
const { initializeDiscordBot, sendDiscordMessage } = require('./services/discord');
const { processAllBenefits } = require('./services/benefitService');
const { sendMission1, sendMissionN, processMissionCompletionCheck, processMission1AutoSend, processMissionAutoSend, processReminderAutoSend, replaceDatePlaceholder, getTomorrowLabel, isEntryPlan } = require('./services/missionService');
const { formatDateTime } = require('./utils/dateUtils');
const ssoAuth = require('../middleware/sso-auth-middleware');

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
app.use(cookieParser());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// SSO認証ミドルウェア（APIルートは除外）
app.use((req, res, next) => {
  // APIルートはSSO認証をスキップ
  if (req.path.startsWith('/api/')) {
    return next();
  }
  // その他のルートはSSO認証を適用
  return ssoAuth(req, res, next);
});

// バッチ処理の実行状態
let isProcessing = false;
let lastRunTime = null;
let lastRunResult = null;

// ミッション機能ON/OFF（DBに永続化。起動時にDBから復元するためまず false で初期化）
let missionEnabled = false;

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

// ========================================
// ミッション管理ページ
// ========================================
app.get('/mission', async (req, res) => {
  try {
    const [messages, reminderMessages, sheetStudents, dbMissions] = await Promise.all([
      getAllMissionMessages(),
      getAllReminderMessages(),
      getMissionStudentList(),
      getAllStudentMissions()
    ]);

    // DBのミッション進捗をstudentIdで引けるMapに変換
    const missionMap = {};
    for (const m of dbMissions) {
      missionMap[m.student_id] = m;
    }

    res.render('mission', {
      messages,
      reminderMessages,
      sheetStudents,
      missionMap,
      missionEnabled,
      formatDateTime
    });
  } catch (error) {
    console.error('ミッション管理画面エラー:', error);
    res.status(500).send('ミッション管理画面の表示に失敗しました');
  }
});

// API: ミッション機能ON/OFFトグル
app.post('/api/mission/toggle', async (req, res) => {
  try {
    missionEnabled = !missionEnabled;
    await setSetting('mission_enabled', missionEnabled ? 'true' : 'false');
    console.log(`🎯 ミッション機能: ${missionEnabled ? 'ON' : 'OFF'}（DB保存済み）`);
    res.json({ success: true, missionEnabled });
  } catch (error) {
    console.error('ミッション機能トグルエラー:', error);
    // DB保存失敗時はメモリ上の変更を元に戻す
    missionEnabled = !missionEnabled;
    res.status(500).json({ success: false, message: 'DB保存に失敗しました: ' + error.message });
  }
});

// API: ミッションメッセージ保存
app.post('/api/mission/message', async (req, res) => {
  const { missionNo, messageContent } = req.body;
  if (!missionNo || messageContent === undefined) {
    return res.status(400).json({ success: false, message: 'missionNo と messageContent は必須です' });
  }
  try {
    await updateMissionMessage(parseInt(missionNo), messageContent);
    res.json({ success: true });
  } catch (error) {
    console.error('ミッションメッセージ保存エラー:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: リマインドメッセージ保存
app.post('/api/mission/reminder-message', async (req, res) => {
  const { missionNo, messageContent } = req.body;
  if (!missionNo || messageContent === undefined) {
    return res.status(400).json({ success: false, message: 'missionNo と messageContent は必須です' });
  }
  try {
    await updateReminderMessage(parseInt(missionNo), messageContent);
    res.json({ success: true });
  } catch (error) {
    console.error('リマインドメッセージ保存エラー:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: ミッション開始（ミッション1送信）
app.post('/api/mission/start', async (req, res) => {
  const { studentId, studentName, discordChannelUrl, planType } = req.body;
  if (!studentId || !studentName || !discordChannelUrl) {
    return res.status(400).json({ success: false, message: '必須パラメータが不足しています' });
  }
  try {
    const result = await sendMission1(studentId, studentName, discordChannelUrl, planType);
    res.json(result);
  } catch (error) {
    console.error('ミッション開始エラー:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: ミッション完了チェック更新
app.post('/api/mission/complete', async (req, res) => {
  const { studentId, missionNo, completed } = req.body;
  if (!studentId || !missionNo) {
    return res.status(400).json({ success: false, message: '必須パラメータが不足しています' });
  }
  try {
    await setMissionCompleted(studentId, parseInt(missionNo), !!completed);
    res.json({ success: true });
  } catch (error) {
    console.error('ミッション完了更新エラー:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: ミッション進捗取得（1生徒）
app.get('/api/mission/progress/:studentId', async (req, res) => {
  try {
    const record = await getStudentMission(req.params.studentId);
    res.json({ success: true, record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: ミッションテスト送信
// 固定テスト送信先へ指定ミッション番号のメッセージを送信（DBへの記録なし）
app.post('/api/mission/test-send', async (req, res) => {
  const { missionNo } = req.body;
  const no = parseInt(missionNo);
  if (!no || no < 1 || no > 3) {
    return res.status(400).json({ success: false, message: 'missionNo は 1〜3 で指定してください' });
  }

  // 固定テスト送信先
  const TEST_CHANNEL_URL = 'https://discord.com/channels/1176426605309083678/1293539258069417994';
  const TEST_USER_ID     = '766666980086120470';

  try {
    // メッセージ取得
    const messages = await getAllMissionMessages();
    const msg = messages.find(m => m.mission_no === no);
    if (!msg || !msg.message_content.trim()) {
      return res.status(404).json({ success: false, message: `ミッション${no}のメッセージが未設定です` });
    }

    // ◯月◯日を翌日に置換
    const sendDate = new Date();
    const tomorrowLabel = getTomorrowLabel(sendDate);
    let content = replaceDatePlaceholder(msg.message_content, sendDate);

    // テスト用メンションをメッセージ先頭に追加
    content = `<@${TEST_USER_ID}>\n【⚡ テスト送信 / ミッション${no}】\n` + content;

    console.log(`🧪 ミッションテスト送信: ミッション${no} → ${TEST_CHANNEL_URL}`);
    const result = await sendDiscordMessage(TEST_CHANNEL_URL, content);

    if (result.success) {
      console.log(`✅ ミッションテスト送信成功: ミッション${no}`);
      res.json({
        success: true,
        message: `ミッション${no}のテスト送信が完了しました`,
        missionNo: no,
        channelUrl: TEST_CHANNEL_URL,
        tomorrowLabel
      });
    } else {
      console.error(`❌ ミッションテスト送信失敗: ${result.error}`);
      res.status(500).json({ success: false, message: 'Discord送信に失敗しました', error: result.error });
    }
  } catch (error) {
    console.error('ミッションテスト送信エラー:', error);
    res.status(500).json({ success: false, message: 'テスト送信でエラーが発生しました', error: error.message });
  }
});

// ========================================
// ヘルスチェック
// ========================================
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
    
    // ミッション機能ON/OFF状態をDBから復元
    console.log('⚙️  システム設定復元中...');
    const savedMissionEnabled = await getSetting('mission_enabled', 'false');
    missionEnabled = savedMissionEnabled === 'true';
    console.log(`⚙️  ミッション機能: ${missionEnabled ? 'ON' : 'OFF'}（DB復元）`);

    console.log('\n✅ すべての初期化が完了しました\n');
  } catch (error) {
    console.error('\n❌ 初期化エラー:', error);
    console.error('環境変数を確認してください\n');
  }
}

// 定期実行スケジュール設定
function setupCronJob() {
  const enableCron = process.env.ENABLE_CRON === 'true';

  if (!enableCron) {
    console.log('⏸️  定期実行は無効化されています（環境変数 ENABLE_CRON=true で有効化）\n');
    return;
  }

  // 特典自動送信: 毎日17時（JST）
  cron.schedule('0 17 * * *', async () => {
    if (isProcessing) {
      console.log('⚠️ 前回のバッチ処理がまだ実行中のため、スキップします');
      return;
    }
    try {
      isProcessing = true;
      console.log(`\n⏰ 特典定期実行開始: ${formatDateTime(new Date())}`);
      const result = await processAllBenefits();
      lastRunTime = new Date();
      lastRunResult = result;
      isProcessing = false;
      console.log(`✅ 特典定期実行完了: ${formatDateTime(lastRunTime)}\n`);
    } catch (error) {
      console.error('❌ 特典定期実行エラー:', error);
      isProcessing = false;
    }
  }, { timezone: 'Asia/Tokyo' });

  // ミッション自動送信: 毎日15時（JST）
  cron.schedule('0 15 * * *', async () => {
    if (!missionEnabled) {
      console.log('⏸️  ミッション機能がOFFのため自動送信をスキップ');
      return;
    }
    try {
      console.log(`\n🎯 ミッション定期実行開始: ${formatDateTime(new Date())}`);
      // ① 提出チェック自動化（スプレッドシートとDB照合）
      await processMissionCompletionCheck();
      // ② ミッション1自動送信（スプレッドシートの条件を満たす未送信生徒）
      await processMission1AutoSend();
      // ③ ミッション2・3自動送信（完了チェック翌日）
      await processMissionAutoSend();
      console.log(`✅ ミッション定期実行完了: ${formatDateTime(new Date())}\n`);
    } catch (error) {
      console.error('❌ ミッション定期実行エラー:', error);
    }
  }, { timezone: 'Asia/Tokyo' });

  // リマインド自動送信: 毎日15時30分（JST）
  cron.schedule('30 15 * * *', async () => {
    if (!missionEnabled) {
      console.log('⏸️  ミッション機能がOFFのためリマインド自動送信をスキップ');
      return;
    }
    try {
      console.log(`\n🔔 リマインド定期実行開始: ${formatDateTime(new Date())}`);
      await processReminderAutoSend();
      console.log(`✅ リマインド定期実行完了: ${formatDateTime(new Date())}\n`);
    } catch (error) {
      console.error('❌ リマインド定期実行エラー:', error);
    }
  }, { timezone: 'Asia/Tokyo' });

  console.log('⏰ 定期実行スケジュール設定完了: 特典=毎日17時 / ミッション=毎日15時 / リマインド=毎日15時30分（日本時間）\n');
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
