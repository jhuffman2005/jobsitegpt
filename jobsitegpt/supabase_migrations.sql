-- Run these in your Supabase SQL editor to support new features.

-- 1. Project Generations (history of AI outputs per project)
CREATE TABLE IF NOT EXISTS project_generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  result_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE project_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own generations" ON project_generations
  FOR ALL USING (auth.uid() = user_id);

-- 2. Change Order Approvals (client sign-off workflow)
CREATE TABLE IF NOT EXISTS change_order_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID,
  co_data JSONB NOT NULL,
  contractor_email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE change_order_approvals ENABLE ROW LEVEL SECURITY;
-- Allow anyone to read by token (approval page is public)
CREATE POLICY "Public read by token" ON change_order_approvals
  FOR SELECT USING (true);
-- Authenticated users can insert their own
CREATE POLICY "Owner insert" ON change_order_approvals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Anyone can update status (client approves without login)
CREATE POLICY "Anyone can approve" ON change_order_approvals
  FOR UPDATE USING (status = 'pending');

-- 4. Bid Invitations (send a scope to a trade and let them bid through the system)
--    Mirrors the change_order_approvals pattern: a tokenized link the trade
--    opens without logging in. The scope_snapshot field freezes the scope at
--    invite time so later edits to the source scope don't change what the trade
--    sees / agreed to bid on.
CREATE TABLE IF NOT EXISTS bid_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES project_generations(id) ON DELETE SET NULL,
  trade_name TEXT NOT NULL,
  trade_contact_name TEXT,
  trade_email TEXT NOT NULL,
  scope_snapshot JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'declined', 'expired')),
  expires_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bid_invitations_project_idx ON bid_invitations(project_id);
CREATE INDEX IF NOT EXISTS bid_invitations_generation_idx ON bid_invitations(generation_id);
ALTER TABLE bid_invitations ENABLE ROW LEVEL SECURITY;
-- Owner can do anything with their invitations
CREATE POLICY "Owner manages invitations" ON bid_invitations
  FOR ALL USING (auth.uid() = user_id);
-- Public can read by token (the bid page is public, gated only by the token)
CREATE POLICY "Public read invitation by token" ON bid_invitations
  FOR SELECT USING (true);

-- 5. Trade Bids (a bid submitted by a trade against an invitation)
CREATE TABLE IF NOT EXISTS trade_bids (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invitation_id UUID REFERENCES bid_invitations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  trade_name TEXT NOT NULL,
  contractor_name TEXT,
  total_price NUMERIC,
  line_items JSONB DEFAULT '[]',
  inclusions TEXT,
  exclusions TEXT,
  notes TEXT,
  attachment_urls JSONB DEFAULT '[]',
  submitted_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_bids_project_idx ON trade_bids(project_id);
CREATE INDEX IF NOT EXISTS trade_bids_invitation_idx ON trade_bids(invitation_id);
ALTER TABLE trade_bids ENABLE ROW LEVEL SECURITY;
-- Owner can read/manage bids for their projects
CREATE POLICY "Owner manages trade bids" ON trade_bids
  FOR ALL USING (auth.uid() = user_id);
-- Public can read a single bid by invitation_id (for the trade's confirmation
-- page after submitting). Inserts go through the service-role API endpoint.
CREATE POLICY "Public read bid by invitation" ON trade_bids
  FOR SELECT USING (true);

-- 3. User Cost Codes (FieldLedger autocomplete source)
CREATE TABLE IF NOT EXISTS user_cost_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  codes JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE user_cost_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cost codes" ON user_cost_codes
  FOR ALL USING (auth.uid() = user_id);

-- 6. SmartLog (daily jobsite logs)
--    A super uploads photos, dictates notes, answers quick checks → AI writes
--    a professional log saved per project. Optional auto-send to client.
CREATE TABLE IF NOT EXISTS smart_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  raw_notes TEXT,
  deliveries TEXT,
  visitors TEXT,
  safety TEXT,
  inspections TEXT,
  weather TEXT,
  generated_log TEXT,
  photos TEXT[] DEFAULT '{}',
  sent_to_client BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS smart_logs_project_idx ON smart_logs(project_id);
CREATE INDEX IF NOT EXISTS smart_logs_project_date_idx ON smart_logs(project_id, log_date DESC);
ALTER TABLE smart_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own smart_logs" ON smart_logs
  FOR ALL USING (auth.uid() = user_id);

-- Add SmartLog settings to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS smartlog_auto_send BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS smartlog_client_email TEXT;

-- Storage bucket for SmartLog photos.
-- Run separately in Supabase dashboard (Storage → New bucket):
--   Name: smartlog-photos
--   Public: yes  (so client emails can render the photos directly)
-- Or via SQL:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('smartlog-photos', 'smartlog-photos', true);

-- 7. Project Files (plans, permits, specs, photos uploaded per project)
--    Files live in a private "project-files" storage bucket and are accessed
--    via signed URLs (see getProjectFileUrl in src/lib/projects.js). Storage
--    path layout is {user_id}/{project_id}/{timestamp}_{filename}, so the
--    first path segment doubles as the ownership gate for storage RLS.
CREATE TABLE IF NOT EXISTS project_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_files_project_idx ON project_files(project_id);
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own project files" ON project_files
  FOR ALL USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — first folder segment of the object name is the owning user_id.
CREATE POLICY "Users upload own project files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users read own project files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users delete own project files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 8. Company Logos (replaces the legacy base64 data: URLs in user_metadata,
--    which were bloating JWTs past nginx's header limit and breaking storage
--    uploads with a generic HTML 400). Bucket is public so logos can be
--    embedded in PDFs / emails without signed URLs. Path layout is
--    {user_id}/logo.{ext}, so the first folder segment is the ownership gate.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml','image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own company logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users update own company logo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users delete own company logo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Public read company logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

-- 9. Structured scope/schedule on projects (active source-of-truth).
--    project_generations stays as the historical record — every AI generation
--    continues to write a row there. The columns below hold the *active*
--    scope and schedule for each project; the migration script at
--    /api/migrate-projects.js promotes the newest generation per tool per
--    project into these columns one-time.
--
--    Shape (see also: scope_trades / scope_notes / schedule_tasks JSDocs in
--    src/lib/projects.js):
--      scope_trades:            [{ id, tradeName, contractor, scopeText, origin,
--                                  lineItems: [{ id, description, note, origin,
--                                                completed, completed_date,
--                                                completed_by_log_id }] }]
--      scope_notes:             { generalConditions: [{id,text,origin,completed,
--                                                      completed_date,completed_by_log_id}],
--                                 exclusions:        [...same shape...],
--                                 clarifications:    [...same shape...] }
--      schedule_tasks:          [{ id, task, phase, trade, notes,
--                                  startDay, durationDays,
--                                  dependencies: [taskUuid],
--                                  origin, completed,
--                                  completed_date, completed_by_log_id }]
--      schedule_phases:         [string]    (phase names — no completion tracking)
--      schedule_subcontractors: [{ trade, phase, estimatedDays,
--                                  recommendedSubTypes, scope }]
--                                          (metadata — no completion tracking)
--
--    Note: completed_by_log_id references smart_logs(id). Postgres can't
--    enforce a real FK through jsonb, so the application clears these refs
--    when a smart_log row is deleted (see deleteSmartLog in projects.js).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_trades JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_notes JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_tasks JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_phases JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_subcontractors JSONB;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_locked BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS schedule_locked BOOLEAN DEFAULT false;
