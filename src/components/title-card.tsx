import Link from "next/link";
import { posterUrl, type MediaType } from "@/lib/tmdb";

export function TitleCard(props: {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  year: number | null;
  posterPath: string | null;
  typeLabel: string;
  badge?: React.ReactNode;
}) {
  const src = posterUrl(props.posterPath, "w342");
  return (
    <Link
      href={`/title/${props.mediaType}/${props.tmdbId}`}
      className="card group flex flex-col overflow-hidden hover:border-accent"
    >
      <div className="aspect-[2/3] bg-border">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-sm text-muted">
            {props.name}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-semibold group-hover:text-accent">{props.name}</div>
        <div className="text-xs text-muted">
          {props.typeLabel}
          {props.year ? ` · ${props.year}` : ""}
        </div>
        {props.badge}
      </div>
    </Link>
  );
}
