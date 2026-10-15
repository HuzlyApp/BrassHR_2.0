This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Redis Cache

Server-side Supabase read paths use `lib/cache.ts` for optional Redis caching. Redis failures are swallowed and the app falls back to Supabase, so missing or unavailable Redis should not break requests.

Required environment variables:

```bash
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=
CACHE_ENABLED=true
CACHE_DEFAULT_TTL_SECONDS=300
```

Use `REDIS_TOKEN` for HTTP Redis providers such as Upstash. For local development, a plain `redis://` or `rediss://` URL works without a token. Set `CACHE_ENABLED=false` or omit `REDIS_URL` to disable caching locally.

Connect to Redis Cloud from the command line:

```bash
npm run redis:cli
npm run redis:cli -- PING
```

This reads `REDIS_URL` from `.env`. If `redis-cli` is not installed, the script prints the equivalent `redis-cli -u "..."` command.

Cache keys follow `supabase:{table}:{scope}:{hash}`. Include the user or tenant in the scope for private data, for example `supabase:profiles:user:{userId}` or `supabase:projects:tenant:{tenantId}:{queryHash}`. Large query params are hashed deterministically so keys stay readable without leaking full payloads.

TTL strategy lives in `CACHE_TTL_SECONDS`:

- Search and highly dynamic dashboard reads: 60-120 seconds.
- Lists and user-scoped data: 5-10 minutes.
- Tenant configuration and templates: 15 minutes.
- Static tenant/reference data: 1 hour.

Mutation paths invalidate cache after successful Supabase writes using table, tenant, user, and resource helpers. Prefer targeted invalidation such as `invalidateTenantCache("email_templates", tenantId)`; use table-level patterns only when the affected scope is not known.

In development, cache hits, misses, and Redis errors are logged with a `[cache:*]` prefix. Production logging is quiet by default.
