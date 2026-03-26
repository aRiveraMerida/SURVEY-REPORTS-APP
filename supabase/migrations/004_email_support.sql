-- ============================================
-- Email sending support
-- ============================================

-- Client: email recipients and file encryption password
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_emails text[] DEFAULT '{}';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS file_password text;

-- Emitter: SMTP configuration for sending emails
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_host text;
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_port integer DEFAULT 587;
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_user text;
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_pass text;
ALTER TABLE emitter_settings ADD COLUMN IF NOT EXISTS smtp_from text;
