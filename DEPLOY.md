# WannaV 生徒様特典自動送付システム - デプロイ手順書

## 🎉 GitHub連携完了

✅ リポジトリURL: https://github.com/kyo10310415/WannaV-Student-Benefit-Automatic-Delivery-System

すべてのコードがGitHubにプッシュされました！

---

## 🚀 Renderデプロイ手順

### ステップ1: PostgreSQLデータベースの作成

1. **Render Dashboardにログイン**
   - https://dashboard.render.com/

2. **New PostgreSQL を作成**
   - 「New +」ボタン → 「PostgreSQL」を選択
   
3. **設定を入力**
   ```
   Name: wannav-benefits-db
   Database: wannav_benefits
   User: (自動生成)
   Region: Singapore (東京に最も近い)
   PostgreSQL Version: 16 (最新)
   Plan: 有料プランを選択
   ```

4. **Create Database をクリック**

5. **Internal Database URL をコピー**
   - ダッシュボードの「Connections」セクションから
   - 例: `postgresql://user:password@host/database`
   - これを後で環境変数に使用します

---

### ステップ2: Web Serviceの作成

1. **New Web Service を作成**
   - 「New +」ボタン → 「Web Service」を選択

2. **GitHubリポジトリを接続**
   - 「Connect」をクリック
   - `kyo10310415/WannaV-Student-Benefit-Automatic-Delivery-System` を選択

3. **基本設定を入力**
   ```
   Name: wannav-benefit-system
   Region: Singapore
   Branch: main
   Runtime: Node
   Build Command: npm install
   Start Command: npm start
   Plan: 有料プランを選択
   ```

4. **Environment Variables を追加**
   
   以下の環境変数を「Add Environment Variable」で1つずつ追加：

   | Key | Value |
   |-----|-------|
   | `PORT` | `3000` |
   | `NODE_ENV` | `production` |
   | `ENABLE_CRON` | `false` ⚠️ テスト段階では false |
   | `DATABASE_URL` | (ステップ1でコピーしたInternal Database URL) |
   | `DISCORD_BOT_TOKEN` | (後で設定) |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | (後で設定) |

5. **Create Web Service をクリック**

6. **デプロイ開始**
   - 自動的にビルドとデプロイが開始されます
   - 数分かかります

---

### ステップ3: 認証情報の準備と設定

#### 3-1. Discord Bot Token の取得

1. **Discord Developer Portal にアクセス**
   - https://discord.com/developers/applications

2. **New Application を作成**
   ```
   Application Name: WannaV Benefit Bot
   ```

3. **Bot を追加**
   - 左メニュー「Bot」を選択
   - 「Add Bot」をクリック
   - 「Reset Token」でTokenを取得してコピー

4. **必要な権限を有効化**
   - `Send Messages`
   - `Attach Files`
   - `Read Message History`

5. **Bot を Discord サーバーに招待**
   - 左メニュー「OAuth2」→「URL Generator」
   - SCOPES: `bot`
   - BOT PERMISSIONS: 上記の権限を選択
   - 生成されたURLをブラウザで開いてサーバーに追加

6. **Renderに環境変数を追加**
   - Render Dashboard → Service → Environment
   - `DISCORD_BOT_TOKEN` に取得したTokenを設定
   - 「Save Changes」

#### 3-2. Google Service Account の作成

1. **Google Cloud Console にアクセス**
   - https://console.cloud.google.com/

2. **新しいプロジェクトを作成**
   ```
   Project Name: WannaV Benefit System
   ```

3. **Google Sheets API を有効化**
   - 「APIとサービス」→「ライブラリ」
   - 「Google Sheets API」を検索
   - 「有効にする」をクリック

4. **サービスアカウントを作成**
   - 「APIとサービス」→「認証情報」
   - 「認証情報を作成」→「サービスアカウント」
   - サービスアカウント名: `wannav-sheets-access`
   - 「作成して続行」→「完了」

5. **JSONキーをダウンロード**
   - 作成したサービスアカウントをクリック
   - 「キー」タブ →「鍵を追加」→「新しい鍵を作成」
   - 形式: JSON
   - ダウンロードされたJSONファイルを保存

6. **JSONを1行に変換**
   
   オンラインツールを使用（例: https://jsonformatter.org/json-minify）
   
   または、以下のコマンドで変換:
   ```bash
   cat downloaded-file.json | tr -d '\n' | tr -s ' '
   ```
   
   結果例:
   ```json
   {"type":"service_account","project_id":"wannav-benefit-system","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"wannav-sheets-access@wannav-benefit-system.iam.gserviceaccount.com",...}
   ```

7. **Renderに環境変数を追加**
   - Render Dashboard → Service → Environment
   - `GOOGLE_SERVICE_ACCOUNT_JSON` に1行に変換したJSONを設定
   - ⚠️ 改行は `\n` のまま残してください（private_key内）
   - 「Save Changes」

8. **スプレッドシートに共有権限を付与**
   
   以下の2つのスプレッドシートを開いて、サービスアカウントのメールアドレス（`wannav-sheets-access@wannav-benefit-system.iam.gserviceaccount.com`）を「閲覧者」として共有:
   
   - 生徒情報: https://docs.google.com/spreadsheets/d/1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM/
   - 特典メッセージ: https://docs.google.com/spreadsheets/d/1--uAzzz3QD8EOtCFYkMSYVnuK8KDRbPeJ38Y71ItE8Q/

---

### ステップ4: デプロイの確認

1. **Render Logsを確認**
   - Dashboard → Service → Logs
   - 以下のメッセージが表示されればOK:
   ```
   ✅ データベース初期化完了
   ✅ Google Sheets API初期化完了
   ✅ Discord Bot準備完了
   ⏸️  定期実行は無効化されています
   🌐 サーバー起動完了
   ```

2. **管理画面にアクセス**
   - RenderのURL（例: `https://wannav-benefit-system.onrender.com`）
   - 管理画面が表示されることを確認

3. **手動テスト実行**
   - 管理画面の「▶️ 手動実行」ボタンをクリック
   - エラーが出ないか確認
   - Discord に実際にメッセージが送信されるか確認

---

### ステップ5: 本番運用開始

テストが完了したら、定期実行を有効化します。

1. **Render Environment を更新**
   - Dashboard → Service → Environment
   - `ENABLE_CRON` を `false` から `true` に変更
   - 「Save Changes」

2. **サービスが再起動**
   - 自動的に再起動されます

3. **ログで確認**
   - Logsに以下のメッセージが表示されればOK:
   ```
   ⏰ 定期実行スケジュール設定完了: 毎日17時（日本時間）
   ```

4. **管理画面で確認**
   - 「✅ 定期実行: 有効（毎日17時自動実行）」と表示される

---

## 📊 運用時のチェックポイント

### 毎日のチェック
- 管理画面で「最終実行日時」を確認
- 送信成功件数・失敗件数を確認
- 失敗がある場合はログを確認

### 定期的なメンテナンス
- データベースの容量確認
- 送信ログの古いデータの削除（必要に応じて）
- スプレッドシートのデータ更新

---

## 🆘 トラブルシューティング

### データベース接続エラー
```
❌ データベース初期化エラー
```
→ `DATABASE_URL` が正しいか確認

### Google Sheets取得エラー
```
❌ スプレッドシート取得エラー
```
→ サービスアカウントがスプレッドシートに共有されているか確認
→ `GOOGLE_SERVICE_ACCOUNT_JSON` が正しく設定されているか確認

### Discord送信エラー
```
❌ Discordメッセージ送信エラー
```
→ `DISCORD_BOT_TOKEN` が正しいか確認
→ BotがDiscordサーバーに参加しているか確認
→ Botに必要な権限があるか確認

---

## 📝 重要なURL

- **GitHub リポジトリ**: https://github.com/kyo10310415/WannaV-Student-Benefit-Automatic-Delivery-System
- **Render Dashboard**: https://dashboard.render.com/
- **生徒情報スプレッドシート**: https://docs.google.com/spreadsheets/d/1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM/
- **特典メッセージスプレッドシート**: https://docs.google.com/spreadsheets/d/1--uAzzz3QD8EOtCFYkMSYVnuK8KDRbPeJ38Y71ItE8Q/

---

以上でデプロイ完了です！🎉
