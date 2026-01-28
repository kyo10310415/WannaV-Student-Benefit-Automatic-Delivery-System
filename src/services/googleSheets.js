const { google } = require('googleapis');
const path = require('path');
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
    
    // スタンダードプラン、レギュラープラン、プレミアムプランが対象
    if (planType === 'スタンダードプラン' || planType === 'レギュラープラン' || planType === 'プレミアムプラン') {
      students.push({
        studentName: row[0] || '',           // A列: 生徒名
        studentId: row[1] || '',             // B列: 学籍番号
        planType: planType,                  // C列: プラン種別
        discordChannelUrl: row[12] || '',    // M列: Discordチャンネル URL
        lessonStartDate: row[20] || ''       // U列: レッスン開始日
      });
    }
  }
  
  return students;
}

// 入会日を取得（❸契約後チェックシート）
async function getEnrollmentDates() {
  const data = await getSheetData(STUDENT_INFO_SPREADSHEET_ID, '❸契約後チェックシート!B4:B');
  
  // B列のデータを配列として返す（4行目以降）
  return data.map(row => row[0] || '');
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

module.exports = {
  initializeGoogleSheets,
  getStudentInfo,
  getEnrollmentDates,
  getMessageForBenefit,
  STUDENT_INFO_SPREADSHEET_ID,
  BENEFIT_MESSAGE_SPREADSHEET_ID
};
