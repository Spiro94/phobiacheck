import { getI18n } from "@/lib/i18n";
import { searchTitles, tmdbConfigured } from "@/lib/tmdb";
import { TitleCard } from "@/components/title-card";

export default async function SearchPage(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  const query = (typeof q === "string" ? q : "").trim();
  const { locale, t } = await getI18n();
  const results = query ? await searchTitles(query, locale) : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">
        {t.resultsFor} “{query}”
      </h1>
      {!tmdbConfigured && <p className="text-xs text-disputed">{t.mockNotice}</p>}
      {results.length === 0 ? (
        <p className="text-muted">{t.noResults}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
          {results.map((r) => (
            <TitleCard
              key={`${r.mediaType}-${r.tmdbId}`}
              {...r}
              typeLabel={r.mediaType === "movie" ? t.movie : t.tv}
            />
          ))}
        </div>
      )}
    </div>
  );
}
