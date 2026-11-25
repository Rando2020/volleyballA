import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import { toast } from "sonner";
import {
  Clip,
  Filter,
  Match,
  Player,
  Tag,
  api,
  pct,
  time,
  toggle,
} from "./api/client";
import { FilterPanel, FilterChips } from "./components/FilterPanel";
import { Filmstrip } from "./components/Filmstrip";
import Modal from "./components/Modal";
import { Player as ClipPlayer } from "./components/Player";

import { Timeline } from "./components/Timeline";
import { TagChips } from "./components/TagChips";
import { BulkBar } from "./components/BulkBar";
import { ShortcutModal } from "./components/ShortcutModal";
import { ClipInspector } from "./components/ClipInspector";
import { useClips, useList } from "./hooks/useClips";
import { useTags } from "./hooks/useTags";
import { useFilters } from "./hooks/useFilters";
import { useKeyboard } from "./hooks/useKeyboard";
import { empty, useStudio } from "./store/studio";

type ActionSample = {
  start_ts: number;
  t: number;
  action: string;
  confidence: number;
};
type ActionReport = { status: string; samples: ActionSample[] };
type Change = { id: number; previous: number[]; next: number[] };
type Job = {
  status: string;
  progress: number;
  error?: string;
  download_url?: string;
};
import {
  CoachingEditor,
  CoachingStats,
  IdentifyPlayer,
  CoachedClip,
  Game,
} from "./components/Coaching";
import { MatchBook, ImportCourtSense } from "./components/MatchBook";
export default function Studio() {
  const qc = useQueryClient();
  const [courtKeys, setCourtKeys] = useState(
    () => localStorage.getItem("volley-local.keys") === "courtsense",
  );
  const ms = useList<Match>("/matches", true, true),
    tags = useTags().data ?? [];
  const [mid, setMid] = useState(0),
    [active, setActive] = useState(0),
    [checked, setChecked] = useState<number[]>([]),
    [panel, setPanel] = useState(true),
    [modal, setModal] = useState(""),
    [job, setJob] = useState(0),
    [at, setAt] = useState(0),
    [busy, setBusy] = useState(false);
  const { filter, setFilter } = useStudio();
  const match = ms.data?.find((m) => m.id === mid) ?? ms.data?.[0],
    id = match?.id ?? 0;
  const base = "/matches/" + id;
  const clipQuery = useClips(id),
    all = clipQuery.data ?? [];
  const players = useList<Player>(base + "/players", !!id).data ?? [];
  const presets =
    useList<{ id: number; name: string; json_query: Filter }>("/presets")
      .data ?? [];
  const [game, setGame] = useState(0),
    [evidence, setEvidence] = useState<number[] | null>(null);
  const games = useList<Game>(base + "/games", !!id).data ?? [];
  const filtered = useFilters(all, filter);
  const items = filtered.filter(
    (c) =>
      (!game || (c as CoachedClip).game_id === game) &&
      (!evidence || evidence.includes(c.id)),
  );
  async function refreshCoaching() {
    await Promise.all([
      refresh(),
      qc.invalidateQueries({ queryKey: [base + "/games"] }),
      qc.invalidateQueries({ queryKey: [base + "/players"] }),
      qc.invalidateQueries({ queryKey: ["coaching-stats"] }),
    ]);
  }
  const c = items.find((c) => c.id === active) ?? items[0];
  const proposals = useQuery({
    queryKey: [base, "action-suggestions"],
    queryFn: () => api<ActionReport>(base + "/action-suggestions"),
    enabled: match?.status === "ready",
  });
  const strongest = useMemo(() => {
    const byAction = new Map<string, ActionSample>();
    for (const sample of proposals.data?.samples ?? []) {
      if (sample.start_ts !== c?.start_ts) continue;
      const previous = byAction.get(sample.action);
      if (!previous || previous.confidence < sample.confidence)
        byAction.set(sample.action, sample);
    }
    return [...byAction.values()].sort((a, b) => a.t - b.t);
  }, [proposals.data, c?.start_ts]);
  const selected = checked.filter((k) => items.some((c) => c.id === k));
  const targets = selected.length ? selected : c ? [c.id] : [];
  const video = useRef<HTMLVideoElement>(null),
    reverse = useRef<ReturnType<typeof setInterval>>(),
    upload = useRef<HTMLInputElement>(null),
    anchor = useRef(0),
    undo = useRef<Change[][]>([]),
    redo = useRef<Change[][]>([]),
    lock = useRef(false);
  const [notes, setNotes] = useState(""),
    [tracing, setTracing] = useState(false);
  useEffect(() => {
    setNotes(c?.notes ?? "");
  }, [c?.id, c?.notes]);
  useEffect(() => {
    setActive(0);
    setGame(0);
    setEvidence(null);
    setChecked([]);
    undo.current = [];
    redo.current = [];
    anchor.current = 0;
    setFilter(empty);
  }, [id, setFilter]);
  useEffect(() => {
    if (match?.status === "ready")
      qc.invalidateQueries({ queryKey: [base + "/clips"] });
  }, [match?.status, base, qc]);
  useEffect(() => {
    setAt(0);
    return () => clearInterval(reverse.current);
  }, [c?.id]);
  const exp = useQuery({
    queryKey: ["export", job],
    queryFn: () => api<Job>("/exports/" + job),
    enabled: !!job,
    refetchInterval: (q) =>
      ["ready", "failed"].includes(q.state.data?.status ?? "") ? false : 500,
  });
  async function task(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    await qc.invalidateQueries({ queryKey: [base + "/clips"] });
    await qc.invalidateQueries({ queryKey: ["coaching-stats"] });
  }
  async function update(ids: number[], body: Record<string, unknown>) {
    await task(async () => {
      await api("/bulk/clips", "PATCH", {
        changes: ids.map((id) => ({ id, ...body })),
      });
      await refresh();
    });
  }
  async function editTags(tag: number, ids: number[]) {
    const add = ids.some(
      (k) => !all.find((c) => c.id === k)?.tags.includes(tag),
    );
    await task(async () => {
      const changes = ids.map((id) => {
        const previous = all.find((c) => c.id === id)!.tags;
        const next = add
          ? [...new Set([...previous, tag])]
          : previous.filter((t) => t !== tag);
        return { id, previous, next };
      });
      await api("/bulk/clips", "PATCH", {
        changes: changes.map((v) => ({ id: v.id, tags: v.next })),
      });
      undo.current.push(changes);
      redo.current = [];
      await refresh();
    });
  }
  async function history(back: boolean) {
    const src = back ? undo : redo,
      dest = back ? redo : undo,
      changes = src.current.at(-1);
    if (!changes) return;
    await task(async () => {
      await api("/bulk/clips", "PATCH", {
        changes: changes.map((v) => ({
          id: v.id,
          tags: back ? v.previous : v.next,
        })),
      });
      src.current.pop();
      dest.current.push(changes);
      await refresh();
    });
  }
  function mark(k: number, shift: boolean) {
    const i = items.findIndex((c) => c.id === k),
      j = items.findIndex((c) => c.id === anchor.current);
    if (shift && j >= 0)
      setChecked([
        ...new Set([
          ...selected,
          ...items.slice(Math.min(i, j), Math.max(i, j) + 1).map((c) => c.id),
        ]),
      ]);
    else setChecked(toggle(selected, k));
    anchor.current = k;
  }
  function choose(clip: Clip) {
    setActive(clip.id);
    anchor.current = clip.id;
  }
  function shuttle(key: string) {
    const v = video.current;
    if (!v) return;
    clearInterval(reverse.current);
    if (key === "j") {
      v.pause();
      reverse.current = setInterval(() => {
        v.currentTime = Math.max(0, v.currentTime - 0.2);
        if (v.currentTime === 0) clearInterval(reverse.current);
      }, 100);
    } else if (key === "k") v.pause();
    else if (key === "l") {
      v.playbackRate = v.paused ? 1 : Math.min(4, v.playbackRate * 2);
      void v.play().catch((e) => toast.error(e.message));
    } else if (v.paused) {
      v.playbackRate = 1;
      void v.play().catch((e) => toast.error(e.message));
    } else v.pause();
  }
  useKeyboard((e: KeyboardEvent) => {
    if (
      modal ||
      e.altKey ||
      (e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)))
    )
      return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === "z" || k === "y") {
        e.preventDefault();
        void history(k === "z" && !e.shiftKey);
      }
      return;
    }
    if (k === "?") setModal("Keyboard shortcuts");
    else if (k === "escape") setChecked([]);
    else if (k === "f") setPanel(!panel);
    else if (!c) return;
    else if (k === " " && e.target instanceof HTMLButtonElement) return;
    else if ([" ", "j", "k", "l"].includes(k)) shuttle(k);
    else if (
      ["arrowright", "arrowleft", "q"].includes(k) ||
      (k === "e" && (courtKeys || e.shiftKey))
    ) {
      const next =
        items[items.indexOf(c) + (["arrowright", "e"].includes(k) ? 1 : -1)];
      if (next) choose(next);
    } else if (k === "s") void update([c.id], { starred: !c.starred });
    else if (k === "e" || (courtKeys && k === "x")) setModal("Export clips");
    else {
      const t = tags.find((t) => t.hotkey === k);
      if (!t) return;
      void editTags(t.id, targets);
    }
    e.preventDefault();
  });
  async function load(file?: File) {
    if (!file) return;
    await task(async () => {
      const f = new FormData();
      f.set("file", file);
      const r = await api<{ match_id: number }>("/matches", "POST", f);
      await qc.invalidateQueries({ queryKey: ["/matches"] });
      setMid(r.match_id);
      toast.success("Video queued for analysis");
    });
  }
  const [statPlayer, setStatPlayer] = useState(0);
  const chosenPlayer = players.find((p) => p.id === statPlayer);
  const counted = chosenPlayer
    ? all.filter((clip) =>
        clip.players.some((p) => p.player_id === chosenPlayer.id),
      )
    : all;
  const chart = tags
    .map((t) => ({
      ...t,
      count: counted.filter((c) => c.tags.includes(t.id)).length,
    }))
    .filter((t) => t.count);
  const tagButtons = (ids: number[]) => (
    <TagChips ids={ids} all={all} tags={tags} busy={busy} editTags={editTags} />
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      val = (k: string) => String(f.get(k) ?? "");
    await task(async () => {
      if (modal === "Create tag") {
        await api("/tags", "POST", {
          name: val("name"),
          color: val("color"),
          hotkey: val("hotkey") || null,
        });
        await qc.invalidateQueries({ queryKey: ["/tags"] });
      }
      if (modal === "Save filter") {
        await api("/presets", "POST", {
          name: val("name"),
          json_query: filter,
        });
        await qc.invalidateQueries({ queryKey: ["/presets"] });
      }
      if (modal === "Add player" || modal === "Rename player") {
        await api(
          modal === "Add player"
            ? base + "/players"
            : "/players/" + val("person"),
          modal === "Add player" ? "POST" : "PATCH",
          { label: val("name"), jersey_color: val("color") || null },
        );
        await qc.invalidateQueries({ queryKey: [base + "/players"] });
      }
      if (modal === "Export clips") {
        const r = await api<{ job_id: number }>(
          "/clips/" + targets[0] + "/export",
          "POST",
          {
            clip_ids: targets,
            mode: val("mode"),
            before: +val("before"),
            after: +val("after"),
          },
        );
        setJob(r.job_id);
      }
      if (modal === "Delete clips") {
        await api("/bulk/delete", "POST", { ids: targets });
        setChecked([]);
        undo.current = [];
        redo.current = [];
        await refresh();
      }
      setModal("");
    });
  }
  return (
    <>
      <header>
        <div className="brand">
          <span className="mark">◒</span> CourtSense <small>Match studio</small>
        </div>
        <div className="actions">
          <button
            aria-label="Keyboard shortcuts"
            onClick={() => setModal("Keyboard shortcuts")}
          >
            ?
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => upload.current?.click()}
          >
            ＋ Load video
          </button>
          <input
            ref={upload}
            hidden
            type="file"
            accept="video/*,.mkv"
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      <main className={panel ? "workspace" : "workspace collapsed"}>
        {panel && (
          <aside>
            <h2>Matches</h2>
            {ms.data?.map((m) => (
              <button
                className={"match " + (m.id === id ? "current" : "")}
                key={m.id}
                onClick={() => setMid(m.id)}
              >
                {m.filename}
                <small>
                  {time(m.duration_s)} · {m.status}
                </small>
              </button>
            ))}
            <FilterPanel
              tags={tags}
              players={players}
              max={Math.ceil(Math.max(1, ...all.map((c) => c.duration_s)))}
              presets={presets}
              save={() => setModal("Save filter")}
            />
          </aside>
        )}
        <div className="center">
          <div className="sectionTitle">
            <div>
              <small>Match review</small>
              <h1>{match?.filename ?? "Match studio"}</h1>
            </div>
            <button onClick={() => setPanel(!panel)} aria-expanded={panel}>
              Filters
            </button>
          </div>
          <FilterChips tags={tags} players={players} />
          <label>
            Game filter
            <select
              aria-label="Game filter"
              value={game}
              onChange={(e) => {
                setGame(+e.target.value);
                setEvidence(null);
              }}
            >
              <option value="0">All games</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.stage} · Game {g.number} · {g.name}
                </option>
              ))}
            </select>
          </label>
          {evidence && (
            <button onClick={() => setEvidence(null)}>
              Clear outcome evidence ({evidence.length} clips)
            </button>
          )}
          {!!id && (
            <MatchBook
              key={id}
              matchId={id}
              duration={match?.duration_s ?? 0}
              games={games}
              changed={refreshCoaching}
            />
          )}
          {!!id && (
            <ImportCourtSense
              key={"import-" + id}
              matchId={id}
              changed={refreshCoaching}
            />
          )}
          {match && match.status !== "ready" && (
            <div role="status" className="status">
              <strong>
                {match.status === "needs_manual_review"
                  ? "Needs manual review"
                  : match.status}
              </strong>{" "}
              {match.error ??
                (match.status === "needs_manual_review"
                  ? "No qualifying ball movement was found."
                  : match.progress + "%")}{" "}
              {["failed", "needs_manual_review"].includes(match.status) && (
                <button
                  onClick={() =>
                    task(async () => {
                      await api(base + "/retry", "POST");
                      await ms.refetch();
                    })
                  }
                >
                  Retry analysis
                </button>
              )}
            </div>
          )}
          {clipQuery.isLoading || ms.isLoading ? (
            <div className="screen skeleton" aria-label="Loading clips" />
          ) : c ? (
            <ClipPlayer
              c={c}
              match={match}
              video={video}
              tracing={tracing}
              setAt={setAt}
            />
          ) : (
            <div
              className={
                match?.status === "needs_manual_review"
                  ? "reviewOriginal"
                  : "screen empty"
              }
            >
              {match?.status === "needs_manual_review" && (
                <video
                  className="screen"
                  controls
                  preload="metadata"
                  aria-label="Original match for manual review"
                  src={"/api/matches/" + id + "/video"}
                />
              )}
              <h2>
                {all.length
                  ? "No clips match these filters"
                  : "No rallies to review"}
              </h2>
              {all.length ? (
                <button onClick={() => setFilter(empty)}>Clear filters</button>
              ) : (
                <p>
                  {["ready", "needs_manual_review"].includes(
                    match?.status ?? "",
                  )
                    ? "Analysis found no qualifying ball movement."
                    : "Rally clips appear when analysis finishes."}
                </p>
              )}
            </div>
          )}
          {c && (
            <label>
              <input
                type="checkbox"
                checked={tracing}
                onChange={(e) => setTracing(e.target.checked)}
              />{" "}
              Show ball trail and player tracks
            </label>
          )}
          <Timeline
            all={all}
            c={c}
            at={at}
            match={match}
            tags={tags}
            choose={(clip) => {
              if (!items.includes(clip)) {
                setFilter(empty);
                setGame(0);
                setEvidence(null);
              }
              choose(clip);
            }}
          />
          <section>
            <div className="sectionTitle">
              <h2>
                Clips{" "}
                <small>
                  {items.length} of {all.length}
                </small>
              </h2>
              <button
                disabled={!targets.length}
                onClick={() => setModal("Export clips")}
              >
                Export
              </button>
            </div>
            {selected.length > 1 && (
              <BulkBar
                selected={selected}
                setModal={setModal}
                update={update}
                setChecked={setChecked}
              />
            )}
            {c && proposals.data?.status === "complete" && (
              <section aria-label="Suggested actions">
                <h3>Suggested actions</h3>
                {strongest.length ? (
                  <>
                    <p>
                      Review the strongest detection for each action before
                      tagging the clip.
                    </p>
                    {strongest.map((s) => (
                      <button
                        key={s.action}
                        onClick={() => {
                          if (video.current) {
                            video.current.pause();
                            video.current.currentTime = s.t - c.start_ts;
                          }
                        }}
                      >
                        {s.action} · {(s.t - c.start_ts).toFixed(2)}s ·{" "}
                        {pct(s.confidence)}
                      </button>
                    ))}
                  </>
                ) : (
                  <p>No action suggestions for this rally.</p>
                )}
              </section>
            )}
            <Filmstrip
              clips={items}
              current={c?.id}
              checked={selected}
              select={choose}
              check={mark}
              tags={tags}
            />
          </section>
          {exp.data && (
            <div role="status" className="status">
              Export · {exp.data.status}{" "}
              <progress max="100" value={exp.data.progress} />
              {exp.data.error}
              {exp.data.download_url && (
                <a href={exp.data.download_url} download>
                  Download export
                </a>
              )}
            </div>
          )}
        </div>
        <ClipInspector clip={c} match={match}>
          {c && (c as CoachedClip).coaching && (
            <CoachingEditor
              clip={c as CoachedClip}
              players={players}
              changed={refreshCoaching}
            />
          )}
          {!!id && (
            <IdentifyPlayer players={players} changed={refreshCoaching} />
          )}
          {!!id && (
            <CoachingStats
              matchId={id}
              game={game}
              players={players}
              onEvidence={(ids) => {
                setFilter(empty);
                setEvidence(ids);
                if (ids.length) setActive(ids[0]);
              }}
            />
          )}
          {c ? (
            <>
              <div className="sectionTitle">
                <h3>Rally {all.indexOf(c) + 1}</h3>
                <button
                  aria-label="Star clip"
                  aria-pressed={c.starred}
                  onClick={() => update([c.id], { starred: !c.starred })}
                >
                  {c.starred ? "★" : "☆"}
                </button>
              </div>
              <small>
                {time(c.start_ts)} to {time(c.end_ts)} ·{" "}
                {c.duration_s.toFixed(1)}s
              </small>
              <div className="sectionTitle">
                <h2>Tags</h2>
                <button onClick={() => setModal("Create tag")}>＋ New</button>
              </div>
              {tagButtons([c.id])}
              <div className="actions">
                <button
                  disabled={!undo.current.length}
                  onClick={() => history(true)}
                >
                  Undo
                </button>
                <button
                  disabled={!redo.current.length}
                  onClick={() => history(false)}
                >
                  Redo
                </button>
              </div>
              <label>
                Clip notes
                <textarea
                  key={c.id}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </label>
              <button
                disabled={busy || notes === c.notes}
                onClick={() => update([c.id], { notes })}
              >
                Save notes
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={c.flagged}
                  onChange={(e) =>
                    update([c.id], { flagged: e.target.checked })
                  }
                />{" "}
                Flag for review
              </label>
              <div className="sectionTitle">
                <h2>Players</h2>
                <button onClick={() => setModal("Add player")}>＋ Add</button>
              </div>
              {players.map((p) => {
                const a = c.players.find((a) => a.player_id === p.id);
                return (
                  <div key={p.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!a}
                        onChange={() =>
                          update([c.id], {
                            players: a
                              ? c.players.filter((v) => v !== a)
                              : [...c.players, { player_id: p.id, role: null }],
                          })
                        }
                      />{" "}
                      {p.label}
                    </label>
                    {a && (
                      <select
                        aria-label={"Position for " + p.label}
                        value={a.role ?? ""}
                        onChange={(e) =>
                          update([c.id], {
                            players: c.players.map((v) =>
                              v === a
                                ? { ...v, role: e.target.value || null }
                                : v,
                            ),
                          })
                        }
                      >
                        <option value="">Unknown position</option>
                        {[
                          "Setter",
                          "Outside",
                          "Middle",
                          "Opposite",
                          "Libero",
                          "Defensive specialist",
                        ].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
              {players.length > 0 && (
                <button onClick={() => setModal("Rename player")}>
                  Identify / rename player
                </button>
              )}

              <button
                onClick={() => {
                  setChecked([c.id]);
                  setModal("Delete clips");
                }}
              >
                Delete clip
              </button>
            </>
          ) : (
            <p>Select a rally to inspect it.</p>
          )}
          {all.length > 0 && (
            <>
              <h2>Tag counts</h2>
              <label>
                Stats for
                <select
                  aria-label="Stats for"
                  value={chosenPlayer?.id ?? 0}
                  onChange={(e) => setStatPlayer(+e.target.value)}
                >
                  <option value="0">Entire match</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                aria-label={chart.map((t) => t.name + " " + t.count).join(", ")}
              >
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(90, chart.length * 26)}
                >
                  <BarChart
                    data={chart}
                    layout="vertical"
                    margin={{ left: 0, right: 12, top: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={66}
                      tick={{ fill: "#bac0cf", fontSize: 11 }}
                    />
                    <Tooltip />
                    <Bar dataKey="count">
                      {chart.map((t) => (
                        <Cell key={t.id} fill={t.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </ClipInspector>
      </main>
      {modal && (
        <Modal title={modal} close={() => setModal("")}>
          {modal === "Keyboard shortcuts" ? (
            <ShortcutModal
              courtKeys={courtKeys}
              change={(v) => {
                setCourtKeys(v);
                localStorage.setItem(
                  "volley-local.keys",
                  v ? "courtsense" : "studio",
                );
              }}
            />
          ) : modal === "Bulk tag" ? (
            tagButtons(targets)
          ) : (
            <form onSubmit={submit}>
              {[
                "Create tag",
                "Save filter",
                "Add player",
                "Rename player",
              ].includes(modal) && (
                <>
                  {modal === "Rename player" && (
                    <label>
                      Current player
                      <select name="person">
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Name
                    <input name="name" required maxLength={80} autoFocus />
                  </label>
                </>
              )}
              {modal === "Create tag" && (
                <>
                  <label>
                    Tag color
                    <input type="color" name="color" defaultValue="#c5baff" />
                  </label>
                  <label>
                    Shortcut
                    <select name="hotkey" aria-label="Shortcut">
                      <option value="">None</option>
                      {"123456789"
                        .split("")
                        .filter((k) => !tags.some((t) => t.hotkey === k))
                        .map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              {modal.includes("player") && (
                <label>
                  Jersey color
                  <input name="color" placeholder="e.g. Navy" />
                </label>
              )}
              {modal === "Export clips" && (
                <>
                  <p>{targets.length} selected · chronological order</p>
                  <label>
                    Format
                    <select name="mode" aria-label="Format">
                      <option value="individual">Individual clips</option>
                      <option value="reel">Stitched highlight reel</option>
                    </select>
                  </label>
                  {["before", "after"].map((k) => (
                    <label key={k}>
                      Extra seconds {k}
                      <input
                        name={k}
                        type="number"
                        min="0"
                        max="5"
                        step=".1"
                        defaultValue="0"
                        required
                      />
                    </label>
                  ))}
                </>
              )}
              {modal === "Delete clips" && (
                <p>Hide {targets.length} selected clip(s) from this match?</p>
              )}
              <button className="primary" disabled={busy}>
                {modal === "Export clips"
                  ? "Start export"
                  : modal === "Delete clips"
                    ? "Delete"
                    : "Save"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
