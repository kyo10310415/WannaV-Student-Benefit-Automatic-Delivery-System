# WannaV 生徒様特典自動送付システム

## 📋 概要

WannaV VTuber育成スクールの生徒様が入会してから一定期間経過するごとにランクアップし、ランクに応じた特典メッセージを自動的にDiscordに送信するシステムです。

## ✨ 主な機能

### 1. 自動ランク判定
- **10日達成**: 入会日から10日経過時点
- **ビギナーⅠ**: レッスン開始月の月初
- **ビギナーⅡ**: レッスン2ヶ月目の月初
- **ビギナーⅢ**: レッスン3ヶ月目の月初
- **ブロンズ**: レッスン4ヶ月目の月初
- **シルバー**: レッスン7ヶ月目の月初
- **ゴールド**: レッスン13ヶ月目の月初
- **プラチナ**: レッスン19ヶ月目の月初（今後追加予定）
- **ブラック**: レッスン25ヶ月目の月初（今後追加予定）

### 2. プラン別メッセージ送信
- スタンダードプラン専用メッセージ
- レギュラープラン専用メッセージ（スタンダードプランと同じ）
- プレミアムプラン専用メッセージ

### 3. 支払い状況チェック & 即時送信
- **会員ステータスチェック**
  - D列が「アクティブ」の生徒のみ処理対象
  - 「アクティブ」以外は自動的にスキップ
- **前月の支払い状況を自動チェック**（月次ランクのみ）
  - スプレッドシート「RAW_支払い状況」から前月分の支払いステータスを取得
  - 「支払い完了」以外は送信をスキップ
  - **10日達成の送信時は支払い状況チェックをスキップ**（透過達成報酬）
  - **クレカ登録が「登録済み」の場合は支払い状況チェックをスキップ**（RAW_支払い状況 L列）
- **支払い完了後すぐに送信**（案1）
  - 例: 2026/2/1にビギナーⅡの送信予定だったが支払い未完了でスキップ
  - → 2026/2/5に支払い完了したら、次回バッチ実行時（毎日17時）に即座に送信
  - 該当月を過ぎている場合は月初を待たずに送信
- **Discordメンション機能**
  - G列にDiscordユーザーIDがある場合、メッセージ冒頭に `<@ID>` を自動追加
- **ランク別画像添付**
  - 管理画面から各ランクの画像をアップロード可能
  - メッセージ送信時に自動的に画像を添付

### 4. 定期実行
- 毎日午後5時（日本時間）に自動実行
- **環境変数 `ENABLE_CRON=true` で有効化**（デフォルト: 無効）
- 手動実行も可能

### 5. 管理画面
- 送信履歴の確認
- 生徒別の最新状態表示
- 送信ログの閲覧（直近50件）
- ランク別画像管理（アップロード・削除）
- テスト送信機能

## 🗂️ プロジェクト構成

```
webapp/
├── src/
│   ├── index.js                    # メインサーバー（Express + Cron）
│   ├── db/
│   │   ├── schema.sql              # データベーススキーマ
│   │   └── database.js             # データベース操作
│   ├── services/
│   │   ├── googleSheets.js         # Google Sheets連携
│   │   ├── discord.js              # Discord Bot連携
│   │   └── benefitService.js       # 特典送信ロジック
│   └── utils/
│       └── dateUtils.js            # 日付計算ユーティリティ
├── views/
│   └── index.ejs                   # 管理画面UI
├── public/                         # 静的ファイル（CSS/JS）
├── .env.example                    # 環境変数テンプレート
├── .gitignore                      # Git除外設定
├── package.json                    # 依存パッケージ
└── README.md                       # このファイル
```

## 🚀 セットアップ手順

### 1. 環境変数設定

`.env.example` を `.env` にコピーして、以下の情報を設定してください。

```bash
cp .env.example .env
```

#### 必要な環境変数

```env
# サーバーポート
PORT=3000

# Node環境
NODE_ENV=production

# 定期実行の有効化（true: 有効, false: 無効）
# ⚠️ システム完成前は false に設定してテストを推奨
ENABLE_CRON=false

# PostgreSQLデータベース接続URL（Render PostgreSQLから取得）
DATABASE_URL=postgresql://username:password@hostname:5432/database_name

# Discord Bot Token（Discord Developer Portalから取得）
DISCORD_BOT_TOKEN=your_discord_bot_token_here

# Google Service Account JSON（改行を\nに置き換えたJSON文字列）
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

### 2. Discord Bot設定

1. [Discord Developer Portal](https://discord.com/developers/applications) でBotを作成
2. Bot Tokenを取得して `.env` の `DISCORD_BOT_TOKEN` に設定
3. Botに以下の権限を付与:
   - `Send Messages`
   - `Attach Files`
   - `Read Message History`
4. BotをサーバーにInvite

### 3. Google Service Account設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Google Sheets APIを有効化
3. サービスアカウントを作成してJSONキーをダウンロード
4. JSONの内容を改行を `\n` に置き換えて `.env` に設定
5. スプレッドシートにサービスアカウントのメールアドレスを共有

### 4. Render PostgreSQLデータベース設定

1. Renderダッシュボードで PostgreSQL を作成
2. Internal Database URL をコピー
3. `.env` の `DATABASE_URL` に設定

### 5. 依存パッケージインストール

```bash
npm install
```

### 6. ローカル起動

```bash
npm start
```

ブラウザで `http://localhost:3000` にアクセスして管理画面を確認

## 🔧 データベース管理

### 既存生徒の履歴登録

既に10日達成報酬を送信済みの生徒様をデータベースに登録する場合:

```bash
# Render環境で実行
npm run register:10day
```

このスクリプトは `scripts/register-10day-completed.js` で定義された生徒リストを一括登録します。

**処理内容:**
- 既存レコードがない場合: 新規作成して `last_benefit_rank = '10日達成'` を設定
- 既存レコードがあり10日達成未登録: `last_benefit_rank` を更新
- 既に10日達成が登録済み: スキップ

**注意事項:**
- このスクリプトは一度だけ実行してください
- 実行後、次回バッチ処理時に月次ランク（ビギナーⅠなど）の判定が開始されます

## 📊 データソース

### 生徒情報スプレッドシート
**ID**: `1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM`

- **❶RAW_生徒様情報シート**
  - A列: 生徒名
  - B列: 学籍番号
  - C列: プラン種別（スタンダードプラン / レギュラープラン / プレミアムプラン）
  - M列: DiscordチャンネルURL
  - U列: レッスン開始日

- **❸契約後チェックシート**
  - B列: 入会日（4行目以降）

### 特典メッセージスプレッドシート
**ID**: `1--uAzzz3QD8EOtCFYkMSYVnuK8KDRbPeJ38Y71ItE8Q`

各シートの指定セルからメッセージを取得

## 🗄️ データベース構造

### benefit_history テーブル
生徒様の最新送信状態（1生徒1レコード）

| カラム | 型 | 説明 |
|--------|------|------|
| id | SERIAL | 主キー |
| student_name | VARCHAR(255) | 生徒名 |
| student_id | VARCHAR(50) | 学籍番号（UNIQUE） |
| plan_type | VARCHAR(50) | プラン種別 |
| last_benefit_rank | VARCHAR(50) | 最後に送信した特典ランク |
| last_sent_at | TIMESTAMP | 最後の送信日時 |
| enrollment_date | DATE | 入会日 |
| lesson_start_date | DATE | レッスン開始日 |
| discord_channel_url | TEXT | DiscordチャンネルURL |

### send_logs テーブル
送信の詳細ログ（全送信履歴）

| カラム | 型 | 説明 |
|--------|------|------|
| id | SERIAL | 主キー |
| student_id | VARCHAR(50) | 学籍番号 |
| student_name | VARCHAR(255) | 生徒名 |
| benefit_rank | VARCHAR(50) | 送信した特典ランク |
| plan_type | VARCHAR(50) | プラン種別 |
| message_content | TEXT | 送信したメッセージ内容 |
| discord_channel_url | TEXT | 送信先URL |
| sent_at | TIMESTAMP | 送信日時 |
| status | VARCHAR(20) | 送信状態（success/failed） |
| error_message | TEXT | エラーメッセージ |

## 🎯 Renderデプロイ方法

### 1. GitHubにプッシュ

```bash
git add .
git commit -m "Initial commit: WannaV Benefit System"
git remote add origin https://github.com/YOUR_USERNAME/wannav-benefit-system.git
git push -u origin main
```

### 2. Renderでデプロイ

1. [Render Dashboard](https://dashboard.render.com/) にログイン
2. **New PostgreSQL** でデータベース作成
   - Database Name: `wannav_benefits_db`
   - Internal Database URL をコピー

3. **New Web Service** でWebサービス作成
   - Connect Repository: GitHubリポジトリを選択
   - Name: `wannav-benefit-system`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   
4. **Environment Variables** を設定
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
   - `ENABLE_CRON`: `false` (⚠️ テスト完了後に `true` に変更)
   - `DATABASE_URL`: PostgreSQLのInternal Database URL
   - `DISCORD_BOT_TOKEN`: Discord BotのToken
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: Google Service AccountのJSON（改行を `\n` に置き換え）

5. **Deploy** をクリック

### 3. 動作確認

デプロイ完了後、RenderのURLにアクセスして管理画面が表示されることを確認

## 📅 定期実行スケジュール

- **実行時刻**: 毎日午後5時（日本時間）
- **処理内容**: 全生徒の特典送信状態をチェックし、該当者に自動送信
- **有効化方法**: 環境変数 `ENABLE_CRON=true` を設定

### 定期実行の有効化

**デフォルトでは定期実行は無効です。** システムのテストが完了してから有効化してください。

1. **Renderの環境変数設定**
   - Dashboard → Service → Environment
   - `ENABLE_CRON` を `true` に設定
   - 「Save Changes」をクリック

2. **有効化の確認**
   - 管理画面のシステム状態に「✅ 定期実行: 有効」と表示される
   - ログに「⏰ 定期実行スケジュール設定完了」と表示される

## 🛠️ トラブルシューティング

### データベース接続エラー
- `DATABASE_URL` が正しく設定されているか確認
- RenderのPostgreSQLが起動しているか確認

### Discord送信エラー
- `DISCORD_BOT_TOKEN` が正しいか確認
- BotがDiscordサーバーに参加しているか確認
- Botに必要な権限が付与されているか確認

### Google Sheets取得エラー
- `GOOGLE_SERVICE_ACCOUNT_JSON` が正しく設定されているか確認
- スプレッドシートにサービスアカウントが共有されているか確認
- Google Sheets APIが有効化されているか確認

### タイムゾーンの問題
- Renderのサーバーは UTC なので、cron設定は `Asia/Tokyo` を指定

## 📝 今後の拡張予定

- [ ] プラチナランク・ブラックランクのメッセージ設定
- [ ] 画像付きメッセージ送信機能
- [ ] メール通知機能
- [ ] より詳細な統計レポート

## 📄 ライセンス

ISC License

## 👥 開発者

WannaV VTuber育成スクール システム開発チーム

---

**最終更新日**: 2025年1月27日
