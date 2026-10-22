# PhobiaCheck

Viewers report whether a movie or series contains a phobia trigger (cats, trypophobia, needles, spiders…) and add timestamps so others know when to look away.

- **Stack:** Next.js 16 (App Router, server actions) · Supabase (Postgres, Auth, RLS) · Tailwind v4
- **Catalog:** TMDB (search and details on the server), with a small demo catalog when no key is set
- **UI:** English and Spanish (cookie-based; defaults to the browser language)

## How the data works

| Table | What it holds |
| --- | --- |
| `phobias` | ~40 seeded phobias (EN/ES). Users suggest new ones (`pending`); admins approve or reject. |
| `titles` | TMDB metadata cache, created the first time someone votes on a title. |
| `votes` | One yes/no per user × title × phobia. Series are voted on as a whole. |
| `occurrences` | Timestamps (season/episode for series, time, short note). Hidden behind a spoiler reveal. |
| `title_phobia_summary` | View that aggregates yes/no counts. The verdict is Yes, No, or Disputed. |

Anyone can browse. Voting, timestamps and suggestions require an account. Row-level security makes users write only their own rows, stops them from self-approving phobias, and lets only admins moderate.

## Run locally

```bash
npm install
npx supabase start          # needs Docker; applies supabase/migrations
cp .env.example .env.local  # fill NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from `npx supabase status`
                            # and TMDB_API_KEY (v3 key or v4 read token)
npm run dev
```

Make yourself an admin after signing up:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "update profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');"
```

## Deploying

Create a Supabase project, run `npx supabase link && npx supabase db push`, set the three env vars on your host (e.g. Vercel), and add your production URL to Supabase Auth → URL configuration.
