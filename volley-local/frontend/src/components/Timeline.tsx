import { Clip, Match, Tag, pct, time } from "../api/client";
export function Timeline({
  all,
  c,
  at,
  match,
  tags,
  choose,
}: {
  all: Clip[];
  c?: Clip;
  at: number;
  match?: Match;
  tags: Tag[];
  choose: (c: Clip) => void;
}) {
  return (
    <section className="timeline">
      <div className="sectionTitle">
        <h2>Match timeline</h2>
        <small>
          {time(c ? c.start_ts + at : 0)} / {time(match?.duration_s ?? 0)}
        </small>
      </div>
      <div className="track">
        {all.map((clip, i) => (
          <button
            key={clip.id}
            className={clip.id === c?.id ? "focusClip" : ""}
            title={"Rally " + (i + 1) + " · " + time(clip.start_ts)}
            aria-label={"Jump to rally " + (i + 1)}
            style={{
              left: pct(clip.start_ts / (match?.duration_s || 1)),
              width: (100 * clip.duration_s) / (match?.duration_s || 1) + "%",
              background:
                tags.find((t) => t.id === clip.tags[0])?.color ?? "#ab9ff2",
            }}
            onClick={() => {
              choose(clip);
            }}
          />
        ))}
        {c && (
          <i
            style={{
              left: pct((c.start_ts + at) / (match?.duration_s || 1)),
            }}
          />
        )}
      </div>
      <div className="ticks">
        <span>0:00</span>
        <span>{time((match?.duration_s ?? 0) / 2)}</span>
        <span>{time(match?.duration_s ?? 0)}</span>
      </div>
    </section>
  );
}
