import { getI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { tmdbConfigured } from "@/lib/tmdb";
import { TitleCard } from "@/components/title-card";

export default async function Home() {
  const { t } = await getI18n();
  const supabase = await createClient();

  // Most recently voted titles.
  const { data: recentVotes } = await supabase
    .from("votes")
    .select("updated_at, titles(id, tmdb_id, media_type, name, year, poster_path)")
    .order("updated_at", { ascending: false })
    .limit(60);

  type T = { id: number; tmdb_id: number; media_type: "movie" | "tv"; name: string; year: number | null; poster_path: string | null };
  const seen = new Set<number>();
  const recent: T[] = [];
  for (const v of recentVotes ?? []) {
    const title = v.titles as unknown as T | null;
    if (title && !seen.has(title.id)) {
      seen.add(title.id);
      recent.push(title);
    }
    if (recent.length >= 12) break;
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-center gap-5 py-8 text-center">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{t.tagline}</h1>
        <form action="/search" className="flex w-full max-w-xl gap-2">
          <input name="q" className="input py-3 text-base" placeholder={t.searchPlaceholder} autoFocus />
          <button className="btn-primary px-5">{t.search}</button>
        </form>
        <p className="max-w-xl text-sm text-muted">{t.howItWorks}</p>
        {!tmdbConfigured && <p className="text-xs text-disputed">{t.mockNotice}</p>}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">{t.recentlyUpdated}</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">{t.nothingYet}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {recent.map((r) => (
              <TitleCard
                key={r.id}
                mediaType={r.media_type}
                tmdbId={r.tmdb_id}
                name={r.name}
                year={r.year}
                posterPath={r.poster_path}
                typeLabel={r.media_type === "movie" ? t.movie : t.tv}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
