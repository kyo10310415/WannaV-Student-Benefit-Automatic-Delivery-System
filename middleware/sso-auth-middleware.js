/**
 * WannaV Dashboard SSO認証ミドルウェア
 * 
 * 使い方:
 * 1. このファイルをプロジェクトに配置
 * 2. メインファイルで以下のようにインポート:
 *    const ssoAuth = require('./sso-auth-middleware');
 * 3. すべてのルートの前にミドルウェアを追加:
 *    app.use(ssoAuth);
 */

const jwt = require('jsonwebtoken');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://wannav-main.onrender.com';

function rejectAuthentication(req, res, message) {
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, message });
  }
  return res.redirect(DASHBOARD_URL);
}

function ssoAuthMiddleware(req, res, next) {
  // 認証トークンをチェック
  const tokenFromQuery = req.query.auth_token;
  const tokenFromCookie = req.cookies?.wannav_sso;

  const token = tokenFromQuery || tokenFromCookie;

  // トークンがない場合はダッシュボードにリダイレクト
  if (!token) {
    console.log('❌ SSO トークンなし → ダッシュボードにリダイレクト');
    return rejectAuthentication(req, res, '認証が必要です');
  }

  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || jwtSecret.trim().length < 32) {
      throw new Error('JWT_SECRETが設定されていません');
    }

    // トークンを検証
    const origin = new URL(process.env.APP_ORIGIN || 'https://wannav-benefit-system.onrender.com').origin;
    const requiredRole = process.env.SSO_REQUIRED_ROLE;
    const levels = { admin: 3, leader: 2, crew: 1 };
    if (!Object.hasOwn(levels, requiredRole)) throw new Error('SSO_REQUIRED_ROLE is required');
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'], issuer: 'https://wannav-main.onrender.com', audience: origin
    });
    
    // SSOトークンかチェック
    if (decoded.type !== 'sso') {
      console.log('❌ 無効なトークンタイプ');
      return rejectAuthentication(req, res, '無効な認証トークンです');
    }
    let target;
    try { target = new URL(decoded.targetUrl); } catch { throw new Error('Invalid SSO target'); }
    if (target.origin !== origin || target.protocol !== 'https:' || target.username || target.password) {
      throw new Error('Invalid SSO target');
    }
    if (!Object.hasOwn(levels, decoded.role) || levels[decoded.role] < levels[requiredRole]) {
      return res.status(403).json({ success: false, message: 'アクセス権限がありません' });
    }

    // ユーザー情報をrequestに追加
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      role: decoded.role
    };

    // クエリパラメータからトークンを取得した場合、Cookieに保存
    if (tokenFromQuery) {
      res.cookie('wannav_sso', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 1000, // 1時間
        sameSite: 'lax'
      });
      
      // トークンをURLから削除してリダイレクト
      const urlWithoutToken = req.originalUrl.split('?')[0];
      return res.redirect(urlWithoutToken);
    }

    next();
  } catch (error) {
    console.error('❌ SSO トークン検証エラー:', error.message);
    
    // トークンが期限切れの場合、Cookieをクリア
    res.clearCookie('wannav_sso');
    
    return rejectAuthentication(req, res, '認証トークンが無効または期限切れです');
  }
}

module.exports = ssoAuthMiddleware;
