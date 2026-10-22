import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getI18n } from "@/lib/i18n";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { LanguageSwitch } from "@/components/language-switch";

export const metadata: Metadata = {
  title: "PhobiaCheck",
  description: "Community reports of phobia triggers in movies and series.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, t } = await getI18n();
  const { user } = await getUser();

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              <span className="text-accent">●</span> {t.appName}
            </Link>
            <form action="/search" className="order-last w-full sm:order-none sm:ml-4 sm:w-auto sm:flex-1">
              <input name="q" className="input" placeholder={t.searchPlaceholder} aria-label={t.search} />
            </form>
            <nav className="ml-auto flex items-center gap-3 text-sm">
              <Link href="/phobias" className="hover:text-accent">{t.phobias}</Link>
              {user ? (
                <form action={signOut}>
                  <button className="hover:text-accent">{t.signOut}</button>
                </form>
              ) : (
                <Link href="/login" className="hover:text-accent">{t.signIn}</Link>
              )}
              <LanguageSwitch locale={locale} />
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-border py-6 text-center text-xs text-muted">
          {t.appName} · Metadata from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
        </footer>
      </body>
    </html>
  );
}
