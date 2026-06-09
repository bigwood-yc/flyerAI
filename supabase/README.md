# Supabase Setup

## Run the SQL Migration

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `migrations/001_auth_schema.sql`
4. Paste the contents and click **Run**

## Configure Environment Variables

Copy the example files and fill in your Supabase credentials:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Find your credentials at: Supabase Dashboard → **Settings** → **API**
- **Project URL** → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **service_role secret** key → `SUPABASE_SERVICE_KEY`
- **JWT Secret** (under Settings → API → JWT Settings) → `SUPABASE_JWT_SECRET`

## Whitelist a Beta User (Admin SQL)

```sql
-- Find user by email
SELECT id, email FROM auth.users WHERE email = 'user@example.com';

-- Grant beta access
UPDATE public.user_profiles
SET is_whitelisted = true
WHERE id = '<paste-uuid-here>';
```

## View Search Activity (Admin SQL)

```sql
SELECT
  u.email,
  l.postal_code,
  l.query_type,
  l.flyer_category,
  l.store_name,
  l.response_ms,
  l.searched_at
FROM search_logs l
JOIN auth.users u ON u.id = l.user_id
ORDER BY l.searched_at DESC
LIMIT 50;
```
