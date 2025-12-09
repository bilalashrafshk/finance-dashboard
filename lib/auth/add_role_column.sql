-- Add role column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'tier_1_customer';

-- Update existing users to have a default role if they are null (though default handles new inserts)
UPDATE users SET role = 'tier_1_customer' WHERE role IS NULL;
