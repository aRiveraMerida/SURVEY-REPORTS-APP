-- ============================================
-- APPLY ALL MIGRATIONS AT ONCE
-- ============================================
-- Run this in the Supabase SQL Editor if you haven't applied
-- migrations 004, 005 and 006 individually. It's safe to run
-- multiple times — all statements use IF NOT EXISTS / ON CONFLICT.
-- ============================================

-- Migration 004: Email sending support
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_emails text[] DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS file_password text;

ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_host text;
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_port integer DEFAULT 587;
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_user text;
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_pass text;
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_from text;

-- Migration 005: Persist source files per report
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_file_path text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_file_name text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_subject_template text;

-- Storage bucket for original source files (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('source-files', 'source-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for source-files bucket (safe to re-create)
DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload source files"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'source-files' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read source files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'source-files' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can update source files"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'source-files' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete source files"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'source-files' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration 006: Declarative email config (subject + HTML body)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_subject_config jsonb;

-- Add notes column to clients if missing (from migration 002)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes text;
