-- 送信履歴管理テーブル
CREATE TABLE IF NOT EXISTS benefit_history (
  id SERIAL PRIMARY KEY,
  student_name VARCHAR(255) NOT NULL,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  plan_type VARCHAR(50) NOT NULL,
  last_benefit_rank VARCHAR(50),
  last_sent_at TIMESTAMP,
  pending_benefit_rank VARCHAR(50),
  pending_since TIMESTAMP,
  enrollment_date DATE,
  lesson_start_date DATE,
  discord_channel_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 送信ログテーブル（詳細履歴）
CREATE TABLE IF NOT EXISTS send_logs (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  benefit_rank VARCHAR(50) NOT NULL,
  plan_type VARCHAR(50) NOT NULL,
  message_content TEXT,
  discord_channel_url TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'success',
  error_message TEXT
);

-- ランク別画像管理テーブル
CREATE TABLE IF NOT EXISTS benefit_images (
  id SERIAL PRIMARY KEY,
  benefit_rank VARCHAR(50) NOT NULL UNIQUE,
  image_data BYTEA,
  image_filename VARCHAR(255),
  image_mimetype VARCHAR(100),
  image_size INTEGER,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_benefit_history_student_id ON benefit_history(student_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_student_id ON send_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_sent_at ON send_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_benefit_images_rank ON benefit_images(benefit_rank);

-- コメント追加
COMMENT ON TABLE benefit_history IS '生徒様の特典送信履歴を管理するテーブル（1生徒1レコード）';
COMMENT ON TABLE send_logs IS '特典送信の詳細ログを記録するテーブル';
COMMENT ON TABLE benefit_images IS 'ランク別の特典画像を管理するテーブル';
COMMENT ON COLUMN benefit_history.student_id IS '学籍番号';
COMMENT ON COLUMN benefit_history.plan_type IS 'スタンダードプラン or レギュラープラン or プレミアムプラン';
COMMENT ON COLUMN benefit_history.last_benefit_rank IS '最後に送信した特典ランク（10日達成、ビギナーⅠ等）';
COMMENT ON COLUMN benefit_history.pending_benefit_rank IS '支払い未完了でスキップした特典ランク';
COMMENT ON COLUMN benefit_history.pending_since IS 'スキップした日時';
COMMENT ON COLUMN benefit_images.benefit_rank IS '特典ランク（10日達成、ビギナーⅠ等）';
COMMENT ON COLUMN benefit_images.image_data IS '画像データ（BYTEA形式）';

-- ミッションメッセージ管理テーブル（ミッション1〜3のメッセージ本文を保存）
CREATE TABLE IF NOT EXISTS mission_messages (
  id SERIAL PRIMARY KEY,
  mission_no INTEGER NOT NULL UNIQUE CHECK (mission_no IN (1, 2, 3)),
  message_content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 初期データ（存在しない場合のみ挿入）
INSERT INTO mission_messages (mission_no, message_content)
  VALUES (1, ''), (2, ''), (3, '')
  ON CONFLICT (mission_no) DO NOTHING;

-- 生徒ミッション進捗テーブル（生徒×ミッション1レコード）
CREATE TABLE IF NOT EXISTS student_missions (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  student_name VARCHAR(255) NOT NULL,
  discord_channel_url TEXT,
  -- ミッション1
  mission1_sent_at TIMESTAMP,
  mission1_completed BOOLEAN DEFAULT FALSE,
  mission1_completed_at TIMESTAMP,
  -- ミッション2
  mission2_sent_at TIMESTAMP,
  mission2_completed BOOLEAN DEFAULT FALSE,
  mission2_completed_at TIMESTAMP,
  -- ミッション3
  mission3_sent_at TIMESTAMP,
  mission3_completed BOOLEAN DEFAULT FALSE,
  mission3_completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_student_missions_student_id ON student_missions(student_id);

COMMENT ON TABLE mission_messages IS 'ミッション1〜3のDiscord送信メッセージを管理するテーブル';
COMMENT ON TABLE student_missions IS '生徒ごとのミッション進捗を管理するテーブル（1生徒1レコード）';

-- student_missions にリマインド送信済みカラムを追加（既存テーブルへのALTER）
ALTER TABLE student_missions ADD COLUMN IF NOT EXISTS mission1_reminded_at TIMESTAMP;
ALTER TABLE student_missions ADD COLUMN IF NOT EXISTS mission2_reminded_at TIMESTAMP;
ALTER TABLE student_missions ADD COLUMN IF NOT EXISTS mission3_reminded_at TIMESTAMP;

-- リマインドメッセージ管理テーブル（ミッション1〜3それぞれのリマインド文）
CREATE TABLE IF NOT EXISTS reminder_messages (
  id SERIAL PRIMARY KEY,
  mission_no INTEGER NOT NULL UNIQUE CHECK (mission_no IN (1, 2, 3)),
  message_content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 初期データ（存在しない場合のみ挿入）
INSERT INTO reminder_messages (mission_no, message_content)
  VALUES (1, ''), (2, ''), (3, '')
  ON CONFLICT (mission_no) DO NOTHING;

COMMENT ON TABLE reminder_messages IS 'ミッション1〜3のリマインドメッセージを管理するテーブル（送付日3日後まで未完了時に自動送信）';
COMMENT ON COLUMN student_missions.mission1_reminded_at IS 'ミッション1リマインド送信日時（NULLなら未送信）';
COMMENT ON COLUMN student_missions.mission2_reminded_at IS 'ミッション2リマインド送信日時（NULLなら未送信）';
COMMENT ON COLUMN student_missions.mission3_reminded_at IS 'ミッション3リマインド送信日時（NULLなら未送信）';
