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
