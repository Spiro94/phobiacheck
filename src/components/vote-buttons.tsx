import { castVote } from "@/app/actions";
import type { Dictionary } from "@/lib/i18n";

export function VoteButtons(props: {
  mediaType: string;
  tmdbId: number;
  phobiaId: number;
  myVote: boolean | null;
  t: Dictionary;
}) {
  const { t, myVote } = props;
  const base = "btn px-3 py-1.5 text-xs border";
  return (
    <form action={castVote} className="flex items-center gap-1.5">
      <input type="hidden" name="media_type" value={props.mediaType} />
      <input type="hidden" name="tmdb_id" value={props.tmdbId} />
      <input type="hidden" name="phobia_id" value={props.phobiaId} />
      <button
        name="choice"
        value="yes"
        aria-pressed={myVote === true}
        className={`${base} ${myVote === true ? "border-present bg-present text-surface" : "border-border hover:border-present"}`}
      >
        {t.contains}
      </button>
      <button
        name="choice"
        value="no"
        aria-pressed={myVote === false}
        className={`${base} ${myVote === false ? "border-absent bg-absent text-surface" : "border-border hover:border-absent"}`}
      >
        {t.absent}
      </button>
      {myVote !== null && (
        <button name="choice" value="clear" className="px-1 text-xs text-muted hover:text-fg">
          {t.clearVote}
        </button>
      )}
    </form>
  );
}
