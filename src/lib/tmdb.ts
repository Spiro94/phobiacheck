import "server-only";
import type { Locale } from "./i18n";

export type MediaType = "movie" | "tv";

export interface TitleSummary {
  tmdbId: number;
  mediaType: MediaType;
  name: string;
  year: number | null;
  posterPath: string | null;
  overview: string;
}

export interface TitleDetails extends TitleSummary {
  seasons: number | null;
  runtimeMinutes: number | null;
}

const API = "https://api.themoviedb.org/3";
const KEY = process.env.TMDB_API_KEY ?? "";

export const tmdbConfigured = KEY.length > 0;

export function posterUrl(path: string | null, size: "w185" | "w342" | "w500" = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

const tmdbLanguage = (locale: Locale) => (locale === "es" ? "es-MX" : "en-US");

async function tmdbFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: "application/json" };
  // Accept either a v4 read access token (JWT) or a v3 API key.
  if (KEY.startsWith("eyJ")) headers.authorization = `Bearer ${KEY}`;
  else url.searchParams.set("api_key", KEY);

  const res = await fetch(url, { headers, next: { revalidate: 60 * 60 * 24 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

interface RawItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview: string;
  number_of_seasons?: number;
  runtime?: number;
  episode_run_time?: number[];
}

function toSummary(raw: RawItem, mediaType: MediaType): TitleSummary {
  const date = mediaType === "movie" ? raw.release_date : raw.first_air_date;
  return {
    tmdbId: raw.id,
    mediaType,
    name: (mediaType === "movie" ? raw.title : raw.name) ?? "Untitled",
    year: date ? Number(date.slice(0, 4)) || null : null,
    posterPath: raw.poster_path,
    overview: raw.overview ?? "",
  };
}

export async function searchTitles(query: string, locale: Locale): Promise<TitleSummary[]> {
  if (!tmdbConfigured) return searchMock(query);
  const data = await tmdbFetch<{ results: RawItem[] }>("/search/multi", {
    query,
    language: tmdbLanguage(locale),
    include_adult: "false",
  });
  return (data?.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => toSummary(r, r.media_type as MediaType));
}

export async function getTitle(
  mediaType: MediaType,
  tmdbId: number,
  locale: Locale,
): Promise<TitleDetails | null> {
  if (!tmdbConfigured) {
    const m = MOCK.find((t) => t.mediaType === mediaType && t.tmdbId === tmdbId);
    return m ? { ...m, seasons: mediaType === "tv" ? 3 : null, runtimeMinutes: 120 } : null;
  }
  const raw = await tmdbFetch<RawItem>(`/${mediaType}/${tmdbId}`, {
    language: tmdbLanguage(locale),
  });
  if (!raw) return null;
  return {
    ...toSummary(raw, mediaType),
    seasons: raw.number_of_seasons ?? null,
    runtimeMinutes: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
  };
}

// Offline catalog so the app is usable before a TMDB key is configured.
const MOCK: TitleSummary[] = [
  { tmdbId: 9552, mediaType: "movie", name: "The Exorcist", year: 1973, posterPath: null, overview: "A girl is possessed by a mysterious entity." },
  { tmdbId: 6488, mediaType: "movie", name: "Arachnophobia", year: 1990, posterPath: null, overview: "A deadly spider species invades a small town." },
  { tmdbId: 578, mediaType: "movie", name: "Jaws", year: 1975, posterPath: null, overview: "A great white shark terrorizes a beach town." },
  { tmdbId: 346364, mediaType: "movie", name: "It", year: 2017, posterPath: null, overview: "Kids face a shape-shifting clown." },
  { tmdbId: 66732, mediaType: "tv", name: "Stranger Things", year: 2016, posterPath: null, overview: "A boy vanishes and a small town uncovers a mystery." },
  { tmdbId: 1399, mediaType: "tv", name: "Game of Thrones", year: 2011, posterPath: null, overview: "Noble families fight for the Iron Throne." },
];

function searchMock(query: string) {
  const q = query.toLowerCase();
  return MOCK.filter((t) => t.name.toLowerCase().includes(q));
}
