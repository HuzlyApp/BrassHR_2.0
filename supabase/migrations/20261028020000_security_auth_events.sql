-- Server-only log of unauthenticated and forbidden requests.
-- Written by the app with the service role. No session tokens are stored.

CREATE TABLE IF NOT EXISTS public.security_auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL,
  http_status integer NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ip_hash text NOT NULL,
  reason text NOT NULL,
  CONSTRAINT security_auth_events_event_check CHECK (event IN ('unauthenticated', 'forbidden', 'rate_limited')),
  CONSTRAINT security_auth_events_status_check CHECK (http_status IN (401, 403, 429)),
  CONSTRAINT security_auth_events_method_check CHECK (char_length(method) BETWEEN 1 AND 16),
  CONSTRAINT security_auth_events_path_check CHECK (char_length(path) BETWEEN 1 AND 200),
  CONSTRAINT security_auth_events_reason_check CHECK (char_length(reason) BETWEEN 1 AND 80),
  CONSTRAINT security_auth_events_ip_hash_check CHECK (char_length(ip_hash) = 64)
);

CREATE INDEX IF NOT EXISTS security_auth_events_created_at_idx
  ON public.security_auth_events (created_at DESC);

CREATE INDEX IF NOT EXISTS security_auth_events_ip_hash_created_at_idx
  ON public.security_auth_events (ip_hash, created_at DESC);

ALTER TABLE public.security_auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_auth_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.security_auth_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.security_auth_events TO service_role;

COMMENT ON TABLE public.security_auth_events IS
  'Server-written log of unauthenticated, forbidden, and rate-limited requests. Service role only. Does not store tokens or raw IP addresses.';
