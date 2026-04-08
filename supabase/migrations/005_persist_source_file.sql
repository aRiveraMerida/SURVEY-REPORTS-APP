-- ============================================
-- Persist original Excel/CSV file per report
-- ============================================

-- Link each report to its original data file stored in Supabase Storage
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_file_path text;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_file_name text;

-- Customizable email subject template per client.
-- Supports placeholders: {title}, {period}, {clientName}
-- Example: "Informe {title} - {period}"
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_subject_template text;

-- ============================================
-- Storage bucket for original source files
-- (private — only authenticated users can access)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('source-files', 'source-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload source files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'source-files' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can read source files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'source-files' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can update source files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'source-files' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Authenticated users can delete source files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'source-files' AND
    auth.role() = 'authenticated'
  );
