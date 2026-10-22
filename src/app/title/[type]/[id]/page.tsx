import Link from "next/link";
import { notFound } from "next/navigation";
import { getI18n, type Dictionary } from "@/lib/i18n";
import { getUser } from "@/lib/supabase/server";
import { getTitle, posterUrl, tmdbConfigured, type MediaType } from "@/lib/tmdb";
import { addOccurrence, deleteOccurrence } from "@/app/actions";
import { Spoiler } from "@/components/spoiler";
import { VoteButtons } from "@/components/vote-buttons";
import { OtherPhobias } from "@/components/other-phobias";

interface Phobia {
  id: number;
  name_en: string;
  name_es: string;
  description_en: string | null;
  description_es: string | null;
}
interface Occurrence {
  id: number;
  phobia_id: number;
  user_id: string;
  season: number | null;
  episode: number | null;
  time_seconds: number | null;
  note: string | null;
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

function Verdict({ yes, no, t }: { yes: number; no: number; t: Dictionary }) {
  const [label, cls] =
    yes > no
      ? [t.contains, "bg-present-bg text-present"]
      : no > yes
        ? [t.absent, "bg-absent-bg text-absent"]
        : [t.disputed, "bg-disputed-bg text-disputed"];
  return <span className={`rounded-md px-2 py-0.5 text-xs font-bold uppercase ${cls}`}>{label}</span>;
}

export default async function TitlePage(props: PageProps<"/title/[type]/[id]">) {
  const { type, id } = await props.params;
  const tmdbId = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(tmdbId)) notFound();
  const mediaType = type as MediaType;

  const { locale, t } = await getI18n();
  const details = await getTitle(mediaType, tmdbId, locale);
  if (!details) notFound();

  const { supabase, user } = await getUser();
  const [{ data: phobiaRows }, { data: titleRow }] = await Promise.all([
    supabase
      .from("phobias")
      .select("id, name_en, name_es, description_en, description_es")
      .eq("status", "approved"),
    supabase.from("titles").select("id").eq("media_type", mediaType).eq("tmdb_id", tmdbId).maybeSingle(),
  ]);

  let summary: { phobia_id: number; yes_count: number; no_count: number }[] = [];
  let occurrences: Occurrence[] = [];
  const myVotes = new Map<number, boolean>();
  if (titleRow) {
    const [s, o, v] = await Promise.all([
      supabase.from("title_phobia_summary").select("phobia_id, yes_count, no_count").eq("title_id", titleRow.id),
      supabase
        .from("occurrences")
        .select("id, phobia_id, user_id, season, episode, time_seconds, note")
        .eq("title_id", titleRow.id)
        .order("season", { nullsFirst: true })
        .order("episode", { nullsFirst: true })
        .order("time_seconds", { nullsFirst: true }),
      user
        ? supabase.from("votes").select("phobia_id, present").eq("title_id", titleRow.id).eq("user_id", user.id)
        : Promise.resolve({ data: [] as { phobia_id: number; present: boolean }[] }),
    ]);
    summary = s.data ?? [];
    occurrences = (o.data ?? []) as Occurrence[];
    for (const row of v.data ?? []) myVotes.set(row.phobia_id, row.present);
  }

  const phobias = ((phobiaRows ?? []) as Phobia[]).map((p) => ({
    id: p.id,
    name: locale === "es" ? p.name_es : p.name_en,
    description: locale === "es" ? p.description_es : p.description_en,
  }));
  const byId = new Map(phobias.map((p) => [p.id, p]));

  const reported = summary
    .filter((s) => byId.has(s.phobia_id))
    .map((s) => ({ ...s, phobia: byId.get(s.phobia_id)! }))
    // Confirmed triggers first, then by total participation.
    .sort((a, b) => b.yes_count - b.no_count - (a.yes_count - a.no_count) || b.yes_count + b.no_count - (a.yes_count + a.no_count));
  const reportedIds = new Set(reported.map((r) => r.phobia_id));
  const others = phobias
    .filter((p) => !reportedIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  const poster = posterUrl(details.posterPath, "w500");
  const hidden = { media_type: mediaType, tmdb_id: String(tmdbId) };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-6 sm:flex-row">
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="" className="w-40 self-start rounded-xl border border-border sm:w-48" />
        )}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            {mediaType === "movie" ? t.movie : t.tv}
            {details.year ? ` · ${details.year}` : ""}
            {details.seasons ? ` · ${details.seasons} ${t.seasons}` : ""}
            {details.runtimeMinutes ? ` · ${details.runtimeMinutes} ${t.minutes}` : ""}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{details.name}</h1>
          <p className="max-w-2xl text-sm text-muted">{details.overview}</p>
          {!tmdbConfigured && <p className="text-xs text-disputed">{t.mockNotice}</p>}
          {!user && (
            <p className="mt-2 text-sm">
              <Link href={`/login?next=/title/${mediaType}/${tmdbId}`} className="font-medium text-accent hover:underline">
                {t.signInToVote}
              </Link>
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.reported}</h2>
        {reported.length === 0 && <p className="text-sm text-muted">{t.notReported}</p>}
        {reported.map((r) => {
          const occ = occurrences.filter((o) => o.phobia_id === r.phobia_id);
          return (
            <article key={r.phobia_id} className="card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Verdict yes={r.yes_count} no={r.no_count} t={t} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{r.phobia.name}</h3>
                  <p className="text-xs text-muted">
                    {r.yes_count} {t.yesVotes} · {r.no_count} {t.noVotes}
                  </p>
                </div>
                {user && (
                  <VoteButtons
                    mediaType={mediaType}
                    tmdbId={tmdbId}
                    phobiaId={r.phobia_id}
                    myVote={myVotes.get(r.phobia_id) ?? null}
                    t={t}
                  />
                )}
              </div>

              <Spoiler showLabel={`${t.showDetails} (${occ.length})`} hideLabel={t.hideDetails}>
                {occ.length === 0 ? (
                  <p className="text-xs text-muted">{t.noOccurrences}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {occ.map((o) => (
                      <li key={o.id} className="flex items-start gap-3 rounded-md bg-bg px-3 py-2 text-sm">
                        <span className="shrink-0 font-mono text-xs font-semibold text-accent">
                          {o.season !== null ? `S${o.season}` : ""}
                          {o.episode !== null ? `E${o.episode} ` : o.season !== null ? " " : ""}
                          {o.time_seconds !== null ? formatTime(o.time_seconds) : "—"}
                        </span>
                        <span className="flex-1">{o.note}</span>
                        {user?.id === o.user_id && (
                          <form action={deleteOccurrence}>
                            <input type="hidden" name="media_type" value={hidden.media_type} />
                            <input type="hidden" name="tmdb_id" value={hidden.tmdb_id} />
                            <input type="hidden" name="occurrence_id" value={o.id} />
                            <button className="text-xs text-muted hover:text-present">{t.delete}</button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {user && (
                  <form action={addOccurrence} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="media_type" value={hidden.media_type} />
                    <input type="hidden" name="tmdb_id" value={hidden.tmdb_id} />
                    <input type="hidden" name="phobia_id" value={r.phobia_id} />
                    {mediaType === "tv" && (
                      <>
                        <label className="flex w-20 flex-col gap-1 text-xs text-muted">
                          {t.season}
                          <input name="season" type="number" min={0} className="input" />
                        </label>
                        <label className="flex w-20 flex-col gap-1 text-xs text-muted">
                          {t.episode}
                          <input name="episode" type="number" min={0} className="input" />
                        </label>
                      </>
                    )}
                    <label className="flex w-32 flex-col gap-1 text-xs text-muted">
                      {t.time}
                      <input name="time" pattern="\d{1,2}(:\d{1,2}){0,2}" placeholder="1:02:30" className="input" />
                    </label>
                    <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
                      {t.note}
                      <input name="note" maxLength={280} className="input" />
                    </label>
                    <button className="btn-ghost">{t.addOccurrence}</button>
                  </form>
                )}
              </Spoiler>
            </article>
          );
        })}
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">{t.otherPhobias}</h2>
        <OtherPhobias
          items={others}
          mediaType={mediaType}
          tmdbId={tmdbId}
          canVote={!!user}
          labels={{ filter: t.filterPhobias, question: t.isItPresent, yes: t.contains, no: t.absent }}
        />
      </section>
    </div>
  );
}
