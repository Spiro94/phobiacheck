import Link from "next/link";
import { getI18n } from "@/lib/i18n";
import { signIn, signUp } from "@/app/actions";

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const { t } = await getI18n();
  const signup = sp.mode === "signup";
  const next = typeof sp.next === "string" ? sp.next : "/";

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-bold">{signup ? t.signUp : t.signIn}</h1>
      {typeof sp.error === "string" && <p className="text-sm text-present">{sp.error}</p>}
      {sp.created && <p className="text-sm text-absent">{t.checkEmail}</p>}
      <form action={signup ? signUp : signIn} className="card flex flex-col gap-3 p-4">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          {t.email}
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t.password}
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={signup ? "new-password" : "current-password"}
            className="input"
          />
        </label>
        <button className="btn-primary">{signup ? t.signUp : t.signIn}</button>
      </form>
      <p className="text-sm text-muted">
        {signup ? t.haveAccount : t.noAccount}{" "}
        <Link
          href={signup ? `/login?next=${encodeURIComponent(next)}` : `/login?mode=signup&next=${encodeURIComponent(next)}`}
          className="font-medium text-accent hover:underline"
        >
          {signup ? t.signIn : t.signUp}
        </Link>
      </p>
    </div>
  );
}
