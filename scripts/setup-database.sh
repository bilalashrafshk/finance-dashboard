#!/bin/bash
# Database Setup Script
# This script runs the SQL schema in your Neon database

set -e

echo "🚀 Setting up database schema..."

# Get the database URL from .env.local
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local file not found!"
    echo "Please create .env.local with your DATABASE_URL"
    exit 1
fi

# Source the .env.local file to get DATABASE_URL
export $(grep -v '^#' .env.local | xargs)

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env.local"
    exit 1
fi

echo "✅ Found DATABASE_URL"
echo "📋 Running SQL schema..."

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo ""
    echo "⚠️  psql is not installed. Please run the SQL manually:"
    echo ""
    echo "1. Go to: https://console.neon.tech"
    echo "2. Open your project"
    echo "3. Click 'SQL Editor'"
    echo "4. Copy the contents of: lib/portfolio/db-schema.sql"
    echo "5. Paste and run in Neon SQL Editor"
    echo ""
    exit 1
fi

# Run the SQL schema
psql "$DATABASE_URL" -f lib/portfolio/db-schema.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database schema created successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Restart your dev server: npm run dev"
    echo "2. Load a portfolio chart to test"
    echo ""
else
    echo ""
    echo "❌ Error running SQL schema"
    echo "Please check the error above and try running manually in Neon Console"
    exit 1
fi



