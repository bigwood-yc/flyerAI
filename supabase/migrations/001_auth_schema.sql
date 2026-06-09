-- ── user_profiles ────────────────────────────────────────────────────────────
-- Extends the built-in auth.users table (Supabase manages auth.users).
-- One row per user, created automatically on signup via trigger.
CREATE TABLE public.user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone                 TEXT,                              -- optional
  preferred_postal_code TEXT,                              -- optional, e.g. 'L3R 0B1'
  is_whitelisted        BOOLEAN NOT NULL DEFAULT FALSE,    -- beta gate
  onboarding_done       BOOLEAN NOT NULL DEFAULT FALSE,    -- redirects to /onboarding on first login
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: insert a skeleton profile row whenever a new auth.users row is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles(id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- RLS: each user can only read/update their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON public.user_profiles
  FOR ALL USING (auth.uid() = id);

-- ── search_logs ──────────────────────────────────────────────────────────────
-- One row per API call. Written server-side by FastAPI (service role key).
CREATE TABLE public.search_logs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  postal_code     TEXT NOT NULL,
  -- 'flyers' | 'flyer_detail' | 'recommendations'
  query_type      TEXT NOT NULL CHECK (query_type IN ('flyers', 'flyer_detail', 'recommendations')),
  -- 'groceries' today; extend to 'hardware', 'electronics', etc. later
  flyer_category  TEXT NOT NULL DEFAULT 'groceries',
  store_name      TEXT,         -- only for query_type='flyer_detail'
  response_ms     INTEGER,      -- API wall-clock time in milliseconds
  searched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for admin analytics queries
CREATE INDEX idx_search_logs_user    ON public.search_logs(user_id, searched_at DESC);
CREATE INDEX idx_search_logs_postal  ON public.search_logs(postal_code);
CREATE INDEX idx_search_logs_cat     ON public.search_logs(flyer_category);

-- RLS: users can read their own logs; admin uses service role key (bypasses RLS)
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_logs" ON public.search_logs
  FOR SELECT USING (auth.uid() = user_id);
