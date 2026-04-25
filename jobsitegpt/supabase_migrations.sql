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
