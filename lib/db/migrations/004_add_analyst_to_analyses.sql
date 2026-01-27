-- Add analyst column to asset_analyses table
ALTER TABLE asset_analyses ADD COLUMN IF NOT EXISTS analyst VARCHAR(100) NOT NULL DEFAULT 'Bilal Ashraf';
