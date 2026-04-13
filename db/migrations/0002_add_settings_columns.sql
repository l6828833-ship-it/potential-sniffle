-- ─── Migration 0002: Add missing ad slot and analytics columns to site_settings ─
-- These columns are referenced in the admin settings UI but were missing from
-- the initial schema, causing the admin settings page to crash when saving.

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS analytics_id           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ad_slot_leaderboard    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ad_slot_rectangle      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ad_slot_large_rectangle TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ad_slot_banner         TEXT NOT NULL DEFAULT '';
