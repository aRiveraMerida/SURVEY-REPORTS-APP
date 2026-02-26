-- ============================================
-- Migration: Simplify schema for AI-driven analysis
-- ============================================

-- Add notes column to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;

-- Modify reports table: add new columns
ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_type TEXT CHECK (report_type IN ('charts', 'table', 'flowchart'));
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}';

-- Make config_id optional (will be removed later)
ALTER TABLE reports ALTER COLUMN config_id DROP NOT NULL;

-- Drop client_configs table and its dependencies
DROP INDEX IF EXISTS idx_client_configs_client_id;
DROP INDEX IF EXISTS idx_reports_config_id;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_config_id_fkey;
ALTER TABLE reports DROP COLUMN IF EXISTS config_id;
DROP TABLE IF EXISTS client_configs;
