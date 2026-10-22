"use client";

import { useMemo, useState } from "react";
import { castVote } from "@/app/actions";

interface Item {
  id: number;
  name: string;
  description: string | null;
}

export function OtherPhobias(props: {
  items: Item[];
  mediaType: string;
  tmdbId: number;
  canVote: boolean;
  labels: { filter: string; question: string; yes: string; no: string };
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return props.items.filter((i) =>
      i.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(needle),
    );
  }, [q, props.items]);

  return (
    <div className="flex flex-col gap-3">
      <input className="input" placeholder={props.labels.filter} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {filtered.map((item) => (
          <li key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{item.name}</div>
              {item.description && <div className="truncate text-xs text-muted">{item.description}</div>}
            </div>
            {props.canVote && (
              <form action={castVote} className="flex shrink-0 gap-1" aria-label={props.labels.question}>
                <input type="hidden" name="media_type" value={props.mediaType} />
                <input type="hidden" name="tmdb_id" value={props.tmdbId} />
                <input type="hidden" name="phobia_id" value={item.id} />
                <button name="choice" value="yes" className="btn border border-border px-2.5 py-1 text-xs hover:border-present">
                  {props.labels.yes}
                </button>
                <button name="choice" value="no" className="btn border border-border px-2.5 py-1 text-xs hover:border-absent">
                  {props.labels.no}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
