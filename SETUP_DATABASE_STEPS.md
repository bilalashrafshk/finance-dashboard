# Database Setup - Step by Step Guide

## What You Need

You already have:
- ✅ Neon PostgreSQL database created
- ✅ Database connection string (from your earlier message)

## Step 1: Create `.env.local` File

### What is `.env.local`?
This is a file where you store secret information (like database passwords) that should NOT be committed to git. It's automatically ignored by git.

### How to Create It:

1. **In your project root** (`/Users/bilalashraf/Risk Metric Dashboard/`), create a new file called `.env.local`

2. **Add your database connection string** to this file:

```bash
DATABASE_URL=postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

**OR** you can also use:

```bash
POSTGRES_URL=postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

### Visual Guide:
```
Risk Metric Dashboard/
├── .env.local          ← CREATE THIS FILE
├── package.json
├── app/
└── ...
```

**File contents of `.env.local`:**
```
DATABASE_URL=postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

---

## Step 2: Run SQL Schema in Neon Database

### What is the SQL Schema?
The SQL schema file (`lib/portfolio/db-schema.sql`) contains commands to create the database tables. You need to run this ONCE in your Neon database to create the tables.

### Option A: Using Neon Web Console (Easiest) ⭐ RECOMMENDED

1. **Go to Neon Console:**
   - Visit: https://console.neon.tech
   - Log in to your account
   - Select your project (the one with database `neondb`)

2. **Open SQL Editor:**
   - Click on "SQL Editor" in the left sidebar
   - Or click "Query" button

3. **Copy the SQL Schema:**
   - Open the file: `lib/portfolio/db-schema.sql` in your code editor
   - Copy ALL the contents (Ctrl+C / Cmd+C)

4. **Paste and Run:**
   - Paste the SQL into the Neon SQL Editor
   - Click "Run" or press Ctrl+Enter / Cmd+Enter
   - You should see "Success" message

**Visual Guide:**
```
Neon Console
├── Your Project
    ├── SQL Editor
        ├── Paste SQL from db-schema.sql
        ├── Click "Run"
        └── ✅ Success!
```

### Option B: Using Command Line (psql)

If you have `psql` installed:

```bash
cd "/Users/bilalashraf/Risk Metric Dashboard"
psql "postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" -f lib/portfolio/db-schema.sql
```

### Option C: Using a Database Client

If you use a database client like:
- **pgAdmin**
- **DBeaver**
- **TablePlus**
- **Postico** (Mac)

1. Connect to your Neon database using the connection string
2. Open the SQL file: `lib/portfolio/db-schema.sql`
3. Execute/Run the SQL

---

## Step 3: Verify Setup

### Check if Tables Were Created:

In Neon SQL Editor, run this query:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

You should see:
- `historical_price_data`
- `historical_data_metadata`

### Test the Connection:

1. **Restart your Next.js dev server:**
   ```bash
   npm run dev
   ```

2. **Load a portfolio chart** (PK Equities, US Equities, or Crypto)

3. **Check the browser console** - you should see logs about fetching/storing data

4. **Check Neon Console** - go to "Tables" and you should see data being inserted

---

## Troubleshooting

### "Cannot find module 'pg'"
Run:
```bash
npm install pg @types/pg --legacy-peer-deps
```

### "DATABASE_URL is not defined"
- Make sure `.env.local` file exists in project root
- Make sure it contains `DATABASE_URL=...`
- Restart your dev server after creating `.env.local`

### "relation does not exist" or "table does not exist"
- The SQL schema wasn't run successfully
- Go back to Step 2 and run the SQL schema again
- Make sure you see "Success" message

### Connection timeout
- Check your Neon database is active (not paused)
- Verify the connection string is correct
- Make sure `sslmode=require` is in the connection string

---

## What Happens Next?

Once setup is complete:

1. **First time loading a chart:**
   - Fetches full history from external API
   - Stores all data in database
   - Shows chart

2. **Subsequent loads:**
   - Reads from database (fast!)
   - Only fetches new dates (incremental update)
   - Updates database with new data

3. **Result:**
   - 99%+ reduction in API calls
   - Much faster chart loading
   - Data persists across sessions

---

## Quick Checklist

- [ ] Created `.env.local` file in project root
- [ ] Added `DATABASE_URL=...` to `.env.local`
- [ ] Opened Neon Console SQL Editor
- [ ] Copied SQL from `lib/portfolio/db-schema.sql`
- [ ] Pasted and ran SQL in Neon Console
- [ ] Saw "Success" message
- [ ] Verified tables exist (optional check)
- [ ] Restarted dev server
- [ ] Tested by loading a chart

---

## Need Help?

If you're stuck:
1. Check the error message in browser console
2. Check Neon Console for database errors
3. Verify `.env.local` file exists and has correct connection string
4. Make sure SQL schema was run successfully

