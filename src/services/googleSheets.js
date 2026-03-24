const { google } = require('googleapis');
const path = require('path');
const { parseDate } = require('../utils/dateUtils');
require('dotenv').config();

// Google Sheets APIクライアント初期化
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

// スプレッドシートからデータを取得
async function getSheetData(spreadsheetId, range) {
  if (!sheetsClient) {
    initializeGoogleSheets();
  }

  try {
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range
    });
    return response.data.values || [];
  } catch (error) {
    console.error(`❌ スプレッドシート取得エラー (${range}):`, error.message);
    throw error;
  }
}

// 生徒情報スプレッドシートのID
const STUDENT_INFO_SPREADSHEET_ID = '1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM';
// 特典メッセージスプレッドシートのID
const BENEFIT_MESSAGE_SPREADSHEET_ID = '1--uAzzz3QD8EOtCFYkMSYVnuK8KDRbPeJ38Y71ItE8Q';

// 生徒情報を取得（❶RAW_生徒様情報シート）
async function getStudentInfo() {
  const data = await getSheetData(STUDENT_INFO_SPREADSHEET_ID, '❶RAW_生徒様情報!A2:U');
  
  const students = [];
  for (const row of data) {
    const planType = row[2]; // C列: プラン種別
    const memberStatus = row[3]; // D列: 会員ステータス
    
    // スタンダードプラン、レギュラープラン、プレミアムプランが対象
    // かつ会員ステータスが「アクティブ」または「レッスン準備中」の場合
    if ((planType === 'スタンダードプラン' || planType === 'レギュラープラン' || planType === 'プレミアムプラン') 
        && (memberStatus === 'アクティブ' || memberStatus === 'レッスン準備中')) {
      students.push({
        studentName: row[0] || '',           // A列: 生徒名
        studentId: (row[1] || '').trim(),    // B列: 学籍番号（前後の空白を除去）
        planType: planType,                  // C列: プラン種別
        memberStatus: memberStatus,          // D列: 会員ステータス
        discordUserId: row[6] || '',         // G列: DiscordユーザーID
        discordChannelUrl: row[12] || '',    // M列: Discordチャンネル URL
        lessonStartDate: row[20] || ''       // U列: レッスン開始日
      });
    }
  }
  
  return students;
}

// 入会日を取得（❸契約後チェックシート）- 削除予定
async function getEnrollmentDates() {
  const data = await getSheetData(STUDENT_INFO_SPREADSHEET_ID, '❸契約後チェックシート!B4:B');
  
  // B列のデータを配列として返す（4行目以降）
  return data.map(row => row[0] || '');
}

// 10日達成用の日付を取得（❹オンボーディングシート R列＋2日）
async function getTenDayAchievementDates() {
  try {
    // A列（学籍番号）とR列（日付）を取得（4行目以降）
    const data = await getSheetData(STUDENT_INFO_SPREADSHEET_ID, '❹オンボーディングシート!A4:R');
    
    // 学籍番号と10日達成日のマップを作成
    // { studentId: '2026/03/12' }
    const achievementDateMap = {};
    
    for (const row of data) {
      const studentId = (row[0] || '').trim(); // A列: 学籍番号（前後の空白を除去）
      const rColumnDate = (row[17] || '').trim(); // R列: 日付（0-indexed で17、前後の空白を除去）
      
      if (studentId && rColumnDate) {
        // R列の日付に2日を加算
        const baseDate = parseDate(rColumnDate);
        if (baseDate) {
          const achievementDate = new Date(baseDate);
          achievementDate.setDate(achievementDate.getDate() + 2); // +2日
          
          // YYYY/MM/DD 形式で保存
          const year = achievementDate.getFullYear();
          const month = achievementDate.getMonth() + 1;
          const day = achievementDate.getDate();
          achievementDateMap[studentId] = `${year}/${month}/${day}`;
        }
      }
    }
    
    console.log(`✅ 10日達成日を取得: ${Object.keys(achievementDateMap).length}件`);
    return achievementDateMap;
  } catch (error) {
    console.error('❌ 10日達成日取得エラー:', error);
    return {};
  }
}

// 特典メッセージを取得
async function getBenefitMessage(sheetName, cellAddress) {
  try {
    const range = `${sheetName}!${cellAddress}`;
    const data = await getSheetData(BENEFIT_MESSAGE_SPREADSHEET_ID, range);
    
    if (data.length > 0 && data[0].length > 0) {
      return data[0][0];
    }
    
    console.warn(`⚠️ メッセージが見つかりません: ${range}`);
    return null;
  } catch (error) {
    console.error(`❌ メッセージ取得エラー (${sheetName}!${cellAddress}):`, error.message);
    return null;
  }
}

// ランクに応じたメッセージ取得設定
const BENEFIT_MESSAGE_CONFIG = {
  'スタンダードプラン': {
    '10日達成': { sheet: '10日', cell: 'A3' },
    'ビギナーⅠ': { sheet: 'ビギナーl', cell: 'A2' },
    'ビギナーⅡ': { sheet: 'ビギナーll', cell: 'A2' },
    'ビギナーⅢ': { sheet: 'ビギナーlll', cell: 'A2' },
    'ブロンズ': { sheet: 'ブロンズ', cell: 'A2' },
    'シルバー': { sheet: 'シルバー', cell: 'A2' },
    'ゴールド': { sheet: 'ゴールド', cell: 'A2' }
  },
  'レギュラープラン': {
    '10日達成': { sheet: '10日', cell: 'A3' },
    'ビギナーⅠ': { sheet: 'ビギナーl', cell: 'A2' },
    'ビギナーⅡ': { sheet: 'ビギナーll', cell: 'A2' },
    'ビギナーⅢ': { sheet: 'ビギナーlll', cell: 'A2' },
    'ブロンズ': { sheet: 'ブロンズ', cell: 'A2' },
    'シルバー': { sheet: 'シルバー', cell: 'A2' },
    'ゴールド': { sheet: 'ゴールド', cell: 'A2' }
  },
  'プレミアムプラン': {
    '10日達成': { sheet: '10日', cell: 'A6' },
    'ビギナーⅠ': { sheet: 'ビギナーl', cell: 'A4' },
    'ビギナーⅡ': { sheet: 'ビギナーll', cell: 'A5' },
    'ビギナーⅢ': { sheet: 'ビギナーlll', cell: 'A5' },
    'ブロンズ': { sheet: 'ブロンズ', cell: 'A5' },
    'シルバー': { sheet: 'シルバー', cell: 'A5' },
    'ゴールド': { sheet: 'ゴールド', cell: 'A5' }
  }
};

// プランとランクに応じたメッセージを取得
async function getMessageForBenefit(planType, benefitRank) {
  const config = BENEFIT_MESSAGE_CONFIG[planType];
  
  if (!config || !config[benefitRank]) {
    console.warn(`⚠️ メッセージ設定が見つかりません: ${planType} - ${benefitRank}`);
    return null;
  }
  
  const { sheet, cell } = config[benefitRank];
  return await getBenefitMessage(sheet, cell);
}

// 支払い状況を取得（RAW_支払い状況シート）
async function getPaymentStatus() {
  try {
    // ヘッダー行（13行目）を取得
    const headerData = await getSheetData(STUDENT_INFO_SPREADSHEET_ID, 'RAW_支払い状況!A13:ZZ13');
    const headers = headerData[0] || [];
    
    // データ行（14行目以降）を取得
    const paymentData = await getSheetData(STUDENT_INFO_SPREADSHEET_ID, 'RAW_支払い状況!A14:ZZ');
    
    // 現在の年月を取得（前月）※日本時間基準で計算
    const nowJst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const lastMonth = new Date(nowJst.getFullYear(), nowJst.getMonth() - 1, 1);
    const targetYearMonth = `${lastMonth.getFullYear()}/${lastMonth.getMonth() + 1}`; // 0埋めなし
    
    console.log(`💰 支払い状況チェック: 前月 ${targetYearMonth}`);
    
    // 前月の列インデックスを検索
    let targetColumnIndex = -1;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] && headers[i].includes(targetYearMonth)) {
        targetColumnIndex = i;
        break;
      }
    }
    
    if (targetColumnIndex === -1) {
      console.warn(`⚠️ 前月（${targetYearMonth}）の支払い状況列が見つかりません`);
      return {};
    }
    
    console.log(`✅ 前月の支払い状況列を検出: ${headers[targetColumnIndex]} (列インデックス: ${targetColumnIndex})`);
    
    // 学籍番号と支払い状況のマップを作成
    const paymentStatusMap = {};
    for (const row of paymentData) {
      const studentId = (row[2] || '').trim(); // C列: 学籍番号（前後の空白を除去）
      const paymentStatus = row[targetColumnIndex] || '';
      
      if (studentId) {
        paymentStatusMap[studentId] = paymentStatus;
      }
    }
    
    return paymentStatusMap;
  } catch (error) {
    console.error('❌ 支払い状況取得エラー:', error);
    return {};
  }
}

module.exports = {
  initializeGoogleSheets,
  getStudentInfo,
  getEnrollmentDates,
  getTenDayAchievementDates,
  getMessageForBenefit,
  getPaymentStatus,
  STUDENT_INFO_SPREADSHEET_ID,
  BENEFIT_MESSAGE_SPREADSHEET_ID
};
