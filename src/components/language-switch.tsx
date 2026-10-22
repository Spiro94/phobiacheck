"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { setLocale } from "@/app/actions";

export function LanguageSwitch({ locale }: { locale: "en" | "es" }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const other = locale === "en" ? "es" : "en";
  return (
    <form action={setLocale}>
      <input type="hidden" name="locale" value={other} />
      <input type="hidden" name="path" value={search ? `${pathname}?${search}` : pathname} />
      <button className="rounded-md border border-border px-2 py-1 text-xs font-semibold uppercase hover:border-accent" aria-label="Change language">
        {other}
      </button>
    </form>
  );
}
