-- 送信履歴管理テーブル
CREATE TABLE IF NOT EXISTS benefit_history (
  id SERIAL PRIMARY KEY,
  student_name VARCHAR(255) NOT NULL,
  student_id VARCHAR(50) NOT NULL UNIQUE,
  plan_type VARCHAR(50) NOT NULL,
  last_benefit_rank VARCHAR(50),
  last_sent_at TIMESTAMP,
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

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_benefit_history_student_id ON benefit_history(student_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_student_id ON send_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_sent_at ON send_logs(sent_at);

-- コメント追加
COMMENT ON TABLE benefit_history IS '生徒様の特典送信履歴を管理するテーブル（1生徒1レコード）';
COMMENT ON TABLE send_logs IS '特典送信の詳細ログを記録するテーブル';
COMMENT ON COLUMN benefit_history.student_id IS '学籍番号';
COMMENT ON COLUMN benefit_history.plan_type IS 'スタンダードプラン or プレミアムプラン';
COMMENT ON COLUMN benefit_history.last_benefit_rank IS '最後に送信した特典ランク（10日達成、ビギナーⅠ等）';
