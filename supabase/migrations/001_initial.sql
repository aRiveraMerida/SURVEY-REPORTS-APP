-- ============================================
-- Survey Reports App - Initial Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: emitter_settings
-- Company that emits the reports (e.g. Movimer World)
-- ============================================
CREATE TABLE emitter_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  footer_phones TEXT[] DEFAULT '{}',
  footer_emails TEXT[] DEFAULT '{}',
  footer_web TEXT,
  footer_linkedin TEXT,
  footer_addresses TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Table: clients
-- Companies that receive reports (SEAT, Citroën, etc.)
-- ============================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- Table: client_configs
-- How to interpret Excel data for a client campaign
-- ============================================
CREATE TABLE client_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('charts', 'table', 'flowchart')),
  column_mapping JSONB NOT NULL DEFAULT '{}',
  contact_funnel JSONB NOT NULL DEFAULT '{}',
  questions JSONB,
  flowchart_pages JSONB,
  table_config JSONB,
  style JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- Table: reports
-- Generated reports
-- ============================================
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES client_configs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  period TEXT NOT NULL,
  report_html TEXT NOT NULL,
  report_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_client_configs_client_id ON client_configs(client_id);
CREATE INDEX idx_reports_client_id ON reports(client_id);
CREATE INDEX idx_reports_config_id ON reports(config_id);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);

-- ============================================
-- Row Level Security (RLS)
-- All authenticated users have full access (shared team)
-- ============================================
ALTER TABLE emitter_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Emitter settings
CREATE POLICY "Authenticated users can read emitter_settings"
  ON emitter_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert emitter_settings"
  ON emitter_settings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update emitter_settings"
  ON emitter_settings FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Clients
CREATE POLICY "Authenticated users can read clients"
  ON clients FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert clients"
  ON clients FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update clients"
  ON clients FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete clients"
  ON clients FOR DELETE
  USING (auth.role() = 'authenticated');

-- Client configs
CREATE POLICY "Authenticated users can read client_configs"
  ON client_configs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert client_configs"
  ON client_configs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update client_configs"
  ON client_configs FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete client_configs"
  ON client_configs FOR DELETE
  USING (auth.role() = 'authenticated');

-- Reports
CREATE POLICY "Authenticated users can read reports"
  ON reports FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert reports"
  ON reports FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update reports"
  ON reports FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete reports"
  ON reports FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================
-- Storage bucket for logos
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Anyone can view logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can update logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can delete logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logos' AND
    auth.role() = 'authenticated'
  );

-- ============================================
-- Insert default emitter_settings row
-- ============================================
INSERT INTO emitter_settings (company_name, footer_phones, footer_emails, footer_web)
VALUES (
  'Movimer World',
  ARRAY['973 22 87 05 (LLEIDA)', '918 31 20 28 (MADRID)'],
  ARRAY['movimer@movimer.com'],
  'www.movimer.com'
);
