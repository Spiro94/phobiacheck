"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getTitle, type MediaType } from "@/lib/tmdb";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optInt(form: FormData, key: string) {
  const v = str(form, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Parses "1:02:03", "62:03" or "45" (minutes) into seconds. */
function parseTime(input: string): number | null {
  if (!input) return null;
  const parts = input.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isInteger(p) || p < 0)) return null;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function parseMedia(form: FormData) {
  const mediaType = str(form, "media_type");
  const tmdbId = Number(str(form, "tmdb_id"));
  if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isInteger(tmdbId)) {
    throw new Error("Invalid title");
  }
  return { mediaType: mediaType as MediaType, tmdbId };
}

const titlePath = (m: { mediaType: MediaType; tmdbId: number }) =>
  `/title/${m.mediaType}/${m.tmdbId}`;

async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Returns the local title id, caching TMDB metadata on first use. */
async function ensureTitle(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  m: { mediaType: MediaType; tmdbId: number },
) {
  const existing = await supabase
    .from("titles")
    .select("id")
    .eq("media_type", m.mediaType)
    .eq("tmdb_id", m.tmdbId)
    .maybeSingle();
  if (existing.data) return existing.data.id as number;

  // Metadata comes from TMDB on the server, never from the form.
  const details = await getTitle(m.mediaType, m.tmdbId, "en");
  if (!details) throw new Error("Unknown title");
  await supabase.from("titles").upsert(
    {
      media_type: m.mediaType,
      tmdb_id: m.tmdbId,
      name: details.name,
      year: details.year,
      poster_path: details.posterPath,
    },
    { onConflict: "media_type,tmdb_id", ignoreDuplicates: true },
  );
  const created = await supabase
    .from("titles")
    .select("id")
    .eq("media_type", m.mediaType)
    .eq("tmdb_id", m.tmdbId)
    .single();
  if (created.error) throw created.error;
  return created.data.id as number;
}

export async function castVote(form: FormData) {
  const { supabase, user } = await requireUser();
  const m = parseMedia(form);
  const phobiaId = Number(str(form, "phobia_id"));
  const choice = str(form, "choice"); // "yes" | "no" | "clear"
  const titleId = await ensureTitle(supabase, m);

  if (choice === "clear") {
    await supabase
      .from("votes")
      .delete()
      .match({ title_id: titleId, phobia_id: phobiaId, user_id: user.id });
  } else if (choice === "yes" || choice === "no") {
    const { error } = await supabase.from("votes").upsert({
      title_id: titleId,
      phobia_id: phobiaId,
      user_id: user.id,
      present: choice === "yes",
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
  revalidatePath(titlePath(m));
  revalidatePath("/");
}

export async function addOccurrence(form: FormData) {
  const { supabase, user } = await requireUser();
  const m = parseMedia(form);
  const phobiaId = Number(str(form, "phobia_id"));
  const timeSeconds = parseTime(str(form, "time"));
  const note = str(form, "note").slice(0, 280) || null;
  if (timeSeconds === null && !note) return;

  const titleId = await ensureTitle(supabase, m);
  const { error } = await supabase.from("occurrences").insert({
    title_id: titleId,
    phobia_id: phobiaId,
    user_id: user.id,
    season: m.mediaType === "tv" ? optInt(form, "season") : null,
    episode: m.mediaType === "tv" ? optInt(form, "episode") : null,
    time_seconds: timeSeconds,
    note,
  });
  if (error) throw error;

  // Adding a timestamp implies the trigger is present.
  await supabase.from("votes").upsert({
    title_id: titleId,
    phobia_id: phobiaId,
    user_id: user.id,
    present: true,
    updated_at: new Date().toISOString(),
  });
  revalidatePath(titlePath(m));
}

export async function deleteOccurrence(form: FormData) {
  const { supabase } = await requireUser();
  const m = parseMedia(form);
  await supabase.from("occurrences").delete().eq("id", Number(str(form, "occurrence_id")));
  revalidatePath(titlePath(m));
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function suggestPhobia(form: FormData) {
  const { supabase, user } = await requireUser();
  const nameEn = str(form, "name_en").slice(0, 80);
  const nameEs = str(form, "name_es").slice(0, 80) || nameEn;
  const description = str(form, "description").slice(0, 300) || null;
  if (nameEn.length < 2) redirect("/phobias?error=1");

  const base = slugify(nameEn) || "phobia";
  const slug = `${base}-${Date.now().toString(36)}`.slice(0, 60);
  const { error } = await supabase.from("phobias").insert({
    slug,
    name_en: nameEn,
    name_es: nameEs,
    description_en: description,
    description_es: description,
    status: "pending",
    suggested_by: user.id,
  });
  revalidatePath("/phobias");
  redirect(error ? "/phobias?error=1" : "/phobias?suggested=1");
}

export async function moderatePhobia(form: FormData) {
  const { supabase } = await requireUser();
  const status = str(form, "status");
  if (status !== "approved" && status !== "rejected") return;
  // RLS restricts this update to admins.
  await supabase.from("phobias").update({ status }).eq("id", Number(str(form, "phobia_id")));
  revalidatePath("/phobias");
}

export async function signIn(form: FormData) {
  const { supabase } = await getUser();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(form, "email"),
    password: str(form, "password"),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  const next = str(form, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signUp(form: FormData) {
  const { supabase } = await getUser();
  const { data, error } = await supabase.auth.signUp({
    email: str(form, "email"),
    password: str(form, "password"),
  });
  if (error) redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
  redirect(data.session ? "/" : "/login?created=1");
}

export async function signOut() {
  const { supabase } = await getUser();
  await supabase.auth.signOut();
  redirect("/");
}

export async function setLocale(form: FormData) {
  const next = str(form, "locale") === "es" ? "es" : "en";
  (await cookies()).set("locale", next, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const back = str(form, "path");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
