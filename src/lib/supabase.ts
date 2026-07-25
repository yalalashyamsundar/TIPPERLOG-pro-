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
export const SUPABASE_SQL_SCRIPT = `-- Supabase SQL Setup for TipperLog App
-- Run this in your Supabase SQL Editor (Project: etpiikmfszmggjdppiua)

CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY DEFAULT 'main_state',
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable public read/write policy for dev
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public full access app_state" ON app_state;
CREATE POLICY "Allow public full access app_state" ON app_state
  FOR ALL USING (true) WITH CHECK (true);
`;

/**
 * Fetch remote state from Supabase 'app_state' table
 */
export async function loadStateFromSupabase(): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', 'main_state')
      .single();

    if (error) {
      console.log('Supabase fetch notice (table may not exist yet):', error.message);
      return null;
    }

    if (data && data.data) {
      return data.data;
    }
    return null;
  } catch (err) {
    console.warn('Error fetching from Supabase:', err);
    return null;
  }
}

/**
 * Save state to Supabase 'app_state' table
 */
export async function saveStateToSupabase(appData: any): Promise<boolean> {
  try {
    const { error } = await supabase.from('app_state').upsert(
      {
        id: 'main_state',
        data: appData,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Supabase save notice:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Error saving to Supabase:', err);
    return false;
  }
}
