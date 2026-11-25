import { Filter, Tag, Player, toggle } from "../api/client";
import { empty, useStudio } from "../store/studio";
type Props = {
  tags: Tag[];
  players: Player[];
  max: number;
  presets: { id: number; name: string; json_query: Filter }[];
  save: () => void;
};
export function FilterPanel({ tags, players, max, presets, save }: Props) {
  const { filter: f, setFilter: set } = useStudio();
  const change = (v: Partial<Filter>) => set({ ...f, ...v });
  return (
    <section>
      <div className="sectionTitle">
        <h2>Filters</h2>
        <button onClick={() => set(empty)}>Reset</button>
      </div>
      <label>
        Search notes
        <input
          type="search"
          value={f.search}
          onChange={(e) => change({ search: e.target.value })}
          placeholder="Search clip notes"
        />
      </label>
      <label>
        Tag matching
        <select
          value={f.logic}
          onChange={(e) => change({ logic: e.target.value as Filter["logic"] })}
        >
          <option value="any">Any included tag</option>
          <option value="all">All included tags</option>
        </select>
      </label>
      <div className="legendTitle">
        Tag legend <span>Include / exclude</span>
      </div>
      {tags.map((t) => (
        <div className="legend" key={t.id}>
          <i style={{ background: t.color }} />
          {t.name}
          <button
            aria-label={"Include " + t.name}
            aria-pressed={f.include.includes(t.id)}
            onClick={() =>
              change({
                include: toggle(f.include, t.id),
                exclude: f.exclude.filter((x) => x !== t.id),
              })
            }
          >
            +
          </button>
          <button
            aria-label={"Exclude " + t.name}
            aria-pressed={f.exclude.includes(t.id)}
            onClick={() =>
              change({
                exclude: toggle(f.exclude, t.id),
                include: f.include.filter((x) => x !== t.id),
              })
            }
          >
            −
          </button>
        </div>
      ))}
      {(
        [
          [
            "Minimum duration",
            f.min,
            max,
            (v: number) =>
              change({
                min: v,
                max: f.max === null ? null : Math.max(v, f.max),
              }),
          ],
          [
            "Maximum duration",
            f.max ?? max,
            max,
            (v: number) => change({ max: v, min: Math.min(v, f.min) }),
          ],
          [
            "Minimum confidence",
            f.low,
            100,
            (v: number) => change({ low: v, high: Math.max(v, f.high) }),
          ],
          [
            "Maximum confidence",
            f.high,
            100,
            (v: number) => change({ high: v, low: Math.min(v, f.low) }),
          ],
        ] as [string, number, number, (v: number) => void][]
      ).map(([label, v, limit, fn]) => (
        <label key={label}>
          {label}
          <b>
            {v}
            {label.includes("duration") ? "s" : "%"}
          </b>
          <input
            type="range"
            max={limit}
            value={v}
            onChange={(e) => fn(+e.target.value)}
          />
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={f.star}
          onChange={(e) => change({ star: e.target.checked })}
        />{" "}
        Starred only
      </label>
      <label>
        Player
        <select
          value={f.player}
          onChange={(e) => change({ player: +e.target.value })}
        >
          <option value="0">All players</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Smart filters
        <select
          value=""
          onChange={(e) => {
            const p = presets.find((p) => p.id === +e.target.value);
            if (p) set({ ...empty, ...p.json_query });
          }}
        >
          <option value="">Load preset…</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={save}>Save current filters</button>
    </section>
  );
}
export function FilterChips({
  tags,
  players,
}: {
  tags: Tag[];
  players: Player[];
}) {
  const { filter: f, setFilter: set } = useStudio();
  const parts: [string, Partial<Filter>][] = [];
  for (const k of ["include", "exclude"] as const)
    for (const id of f[k])
      parts.push([
        (k === "include" ? "+ " : "− ") +
          (tags.find((t) => t.id === id)?.name ?? id),
        { [k]: toggle(f[k], id) },
      ]);
  if (f.min || f.max !== null)
    parts.push([f.min + "–" + (f.max ?? "∞") + "s", { min: 0, max: null }]);
  if (f.low || f.high !== 100)
    parts.push([f.low + "–" + f.high + "%", { low: 0, high: 100 }]);
  if (f.star) parts.push(["Starred", { star: false }]);
  if (f.search) parts.push([f.search, { search: "" }]);
  if (f.player)
    parts.push([
      players.find((p) => p.id === f.player)?.label ?? "Player",
      { player: 0 },
    ]);
  if (!parts.length) return null;
  return (
    <div className="chiprow">
      {parts.map(([s, v], i) => (
        <button key={i} onClick={() => set({ ...f, ...v })}>
          {s} ×
        </button>
      ))}
      <button onClick={() => set(empty)}>Clear all</button>
    </div>
  );
}
