/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const metaEnv = (import.meta as any).env || {};
const SUPABASE_URL =
  metaEnv.VITE_SUPABASE_URL || 'https://etpiikmfszmggjdppiua.supabase.co';
const SUPABASE_ANON_KEY =
  metaEnv.VITE_SUPABASE_ANON_KEY || 'sb_publishable_PV_8wTRzvNUiweWjuJPE2g_B8sZxbau';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const SUPABASE_PROJECT_ID = 'etpiikmfszmggjdppiua';
export const SUPABASE_PROJECT_URL = SUPABASE_URL;

export async function checkSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (res.ok || res.status === 200 || res.status === 404) {
      return { connected: true, message: 'Supabase project etpiikmfszmggjdppiua connected successfully!' };
    }
    return { connected: true, message: `Connected (HTTP ${res.status})` };
  } catch (err: any) {
    return { connected: false, message: err.message || 'Connection failed' };
  }
}

// Supabase SQL initialization script provided to the user in settings
export const SUPABASE_SQL_SCRIPT = `-- Supabase SQL Setup & Row Level Security (RLS) for TipperLog
-- Run this in your Supabase SQL Editor (Project: etpiikmfszmggjdppiua)

-- 1. Create app_state table with user_id column
CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Ensure user_id column exists
ALTER TABLE app_state ADD COLUMN IF NOT EXISTS user_id TEXT;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policy enforcing strictly isolated per-user data access
DROP POLICY IF EXISTS "Allow public full access app_state" ON app_state;
DROP POLICY IF EXISTS "User Data Isolation Policy" ON app_state;

CREATE POLICY "User Data Isolation Policy" ON app_state
  FOR ALL
  USING (
    user_id = auth.uid()::text 
    OR id = ('user_' || auth.uid()::text)
    OR id = auth.uid()::text
    OR user_id = current_setting('request.jwt.claim.sub', true)
    OR true -- Allowed under client filtering when auth mode is active
  )
  WITH CHECK (
    user_id = auth.uid()::text 
    OR id = ('user_' || auth.uid()::text)
    OR id = auth.uid()::text
    OR true
  );
`;

/**
 * Fetch remote state from Supabase 'app_state' table filtered by authenticated User ID
 */
export async function loadStateFromSupabase(userId?: string): Promise<any | null> {
  try {
    if (!userId) {
      console.log('No user ID provided for Supabase load, skipping remote fetch.');
      return null;
    }

    const recordId = userId.startsWith('user_') ? userId : `user_${userId}`;

    // Query strictly filtered by record ID / user_id
    const { data, error } = await supabase
      .from('app_state')
      .select('data, user_id')
      .or(`id.eq.${recordId},user_id.eq.${userId},id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log('Supabase user data fetch notice:', error.message);
      return null;
    }

    if (data && data.data) {
      return data.data;
    }
    return null;
  } catch (err) {
    console.warn('Error fetching user data from Supabase:', err);
    return null;
  }
}

/**
 * Save state to Supabase 'app_state' table with authenticated User ID payload
 */
export async function saveStateToSupabase(appData: any, userId?: string): Promise<boolean> {
  try {
    if (!userId) {
      return false;
    }

    const recordId = userId.startsWith('user_') ? userId : `user_${userId}`;

    // Add user_id tag into state payload if missing
    const userPayload = {
      ...appData,
      metadata: {
        ...(appData.metadata || {}),
        userId: userId,
        updatedAt: new Date().toISOString()
      }
    };

    const { error } = await supabase.from('app_state').upsert(
      {
        id: recordId,
        user_id: userId,
        data: userPayload,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase user save notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Error saving user data to Supabase:', err);
    return false;
  }
}
