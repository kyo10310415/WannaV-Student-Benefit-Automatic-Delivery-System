-- カラム追加マイグレーション
-- pending_benefit_rank と pending_since カラムが存在しない場合に追加

DO $$ 
BEGIN
    -- pending_benefit_rank カラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'benefit_history' 
        AND column_name = 'pending_benefit_rank'
    ) THEN
        ALTER TABLE benefit_history 
        ADD COLUMN pending_benefit_rank VARCHAR(50);
        
        COMMENT ON COLUMN benefit_history.pending_benefit_rank IS '支払い未完了でスキップした特典ランク';
    END IF;
    
    -- pending_since カラムの追加
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'benefit_history' 
        AND column_name = 'pending_since'
    ) THEN
        ALTER TABLE benefit_history 
        ADD COLUMN pending_since TIMESTAMP;
        
        COMMENT ON COLUMN benefit_history.pending_since IS 'スキップした日時';
    END IF;
END $$;
