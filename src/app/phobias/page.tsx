import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { getUser } from "@/lib/supabase/server";
import { moderatePhobia, suggestPhobia } from "@/app/actions";

interface Row {
  id: number;
  name_en: string;
  name_es: string;
  description_en: string | null;
  description_es: string | null;
  status: "approved" | "pending" | "rejected";
  suggested_by: string | null;
}

export default async function PhobiasPage(props: PageProps<"/phobias">) {
  const sp = await props.searchParams;
  const { locale, t } = await getI18n();
  const { supabase, user } = await getUser();

  const [{ data }, { data: profile }] = await Promise.all([
    supabase.from("phobias").select("id, name_en, name_es, description_en, description_es, status, suggested_by"),
    user
      ? supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const rows = (data ?? []) as Row[];
  const name = (r: Row) => (locale === "es" ? r.name_es : r.name_en);
  const desc = (r: Row) => (locale === "es" ? r.description_es : r.description_en);
  const approved = rows.filter((r) => r.status === "approved").sort((a, b) => name(a).localeCompare(name(b), locale));
  const pending = rows.filter((r) => r.status === "pending");
  const isAdmin = !!profile?.is_admin;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-4 text-2xl font-bold">{t.phobias}</h1>
        <ul className="grid gap-2 sm:grid-cols-2">
          {approved.map((r) => (
            <li key={r.id} className="card px-4 py-3">
              <div className="text-sm font-semibold">{name(r)}</div>
              {desc(r) && <div className="text-xs text-muted">{desc(r)}</div>}
            </li>
          ))}
        </ul>
      </section>

      <aside className="flex flex-col gap-6">
        <div className="card flex flex-col gap-3 p-4">
          <h2 className="font-semibold">{t.suggestPhobia}</h2>
          <p className="text-xs text-muted">{t.suggestHelp}</p>
          {sp.suggested && <p className="text-sm text-absent">{t.suggestedThanks}</p>}
          {sp.error && <p className="text-sm text-present">{t.errorGeneric}</p>}
          {user ? (
            <form action={suggestPhobia} className="flex flex-col gap-2">
              <input name="name_en" required minLength={2} maxLength={80} placeholder={t.nameEn} className="input" />
              <input name="name_es" maxLength={80} placeholder={t.nameEs} className="input" />
              <textarea name="description" maxLength={300} rows={2} placeholder={t.description} className="input" />
              <button className="btn-primary">{t.submit}</button>
            </form>
          ) : (
            <Link href="/login?next=/phobias" className="text-sm font-medium text-accent hover:underline">
              {t.signIn}
            </Link>
          )}
        </div>

        {pending.length > 0 && (
          <div className="card flex flex-col gap-3 p-4">
            <h2 className="font-semibold">{isAdmin ? t.moderation : t.yourSuggestions}</h2>
            <ul className="flex flex-col gap-2">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{r.name_en} / {r.name_es}</div>
                    {r.description_en && <div className="text-xs text-muted">{r.description_en}</div>}
                    {!isAdmin && <div className="text-xs text-disputed">{t.pending}</div>}
                  </div>
                  {isAdmin && (
                    <form action={moderatePhobia} className="flex gap-2">
                      <input type="hidden" name="phobia_id" value={r.id} />
                      <button name="status" value="approved" className="btn-primary px-2 py-1 text-xs">{t.approve}</button>
                      <button name="status" value="rejected" className="btn-ghost px-2 py-1 text-xs">{t.reject}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
