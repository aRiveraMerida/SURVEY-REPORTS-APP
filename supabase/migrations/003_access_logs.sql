-- ============================================
-- Migration: Access logs for Kit Digital compliance
-- ============================================

CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'page_view',
  path TEXT NOT NULL DEFAULT '/',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX idx_access_logs_created_at ON access_logs(created_at DESC);
CREATE INDEX idx_access_logs_user_email ON access_logs(user_email);

-- RLS
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read access_logs"
  ON access_logs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert access_logs"
  ON access_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
