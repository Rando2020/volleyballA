import { useState, useRef, useEffect } from "react";
import { Clip, Tag, time } from "../api/client";
export function Filmstrip({
  clips,
  current,
  checked,
  select,
  check,
  tags,
}: {
  clips: Clip[];
  current?: number;
  checked: number[];
  select: (c: Clip) => void;
  check: (id: number, shift: boolean) => void;
  tags: Tag[];
}) {
  const view = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0),
    [width, setWidth] = useState(800);
  useEffect(() => {
    if (!view.current) return;
    const obs = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    obs.observe(view.current);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    const idx = clips.findIndex((c) => c.id === current),
      el = view.current;
    if (!el || idx < 0) return;
    if (
      idx * 174 < el.scrollLeft ||
      idx * 174 + 174 > el.scrollLeft + el.clientWidth
    )
      el.scrollLeft = idx * 174;
  }, [current, clips]);
  const first = Math.max(0, Math.floor(offset / 174) - 2);
  return (
    <div
      className="film"
      ref={view}
      onScroll={(e) => setOffset(e.currentTarget.scrollLeft)}
    >
      <div
        style={{ position: "relative", width: clips.length * 174, height: 126 }}
      >
        {clips.slice(first, first + Math.ceil(width / 174) + 5).map((c, i) => (
          <article
            key={c.id}
            className={"card " + (c.id === current ? "selected" : "")}
            style={{ left: (first + i) * 174 }}
          >
            <button
              className="preview"
              aria-label={"Play clip at " + time(c.start_ts)}
              onClick={(e) => (e.shiftKey ? check(c.id, true) : select(c))}
            >
              <img src={"/api/clips/" + c.id + "/thumb"} alt="" />
              <span>{time(c.start_ts)}</span>
              <strong>
                {tags.find((t) => t.id === c.tags[0])?.name ?? "Untagged"}{" "}
                {c.starred ? "★" : ""}
              </strong>
            </button>
            <input
              type="checkbox"
              aria-label={"Select clip " + (i + first + 1)}
              checked={checked.includes(c.id)}
              onClick={(e) => check(c.id, e.shiftKey)}
              onChange={() => {}}
            />
          </article>
        ))}
      </div>
    </div>
  );
}
