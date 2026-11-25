import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, Clip, Player, time } from "../api/client";
export type CoachingRecord = {
  player_id: number | null;
  event_time: number;
  confirmed: boolean;
  position: string;
  action: string;
  quality: string;
  destination: string;
  tempo: string;
  placement: string;
  outcome: string;
  mishit: boolean;
  incoming_pass: string;
  blockers: string;
  setter_zone: number | null;
};
export type Game = {
  id: number;
  name: string;
  number: number;
  stage: string;
  start_ts: number;
  url: string;
};
export type CoachedClip = Clip & {
  coaching: CoachingRecord;
  game_id: number | null;
};
const options: Record<string, string[]> = {
  position: [
    "Unassigned",
    "Setter",
    "Outside hitter",
    "Middle blocker",
    "Opposite",
    "Libero",
    "Defensive specialist",
  ],
  action: ["Unknown", "Serve", "Pass", "Set", "Attack", "Block", "Dig"],
  quality: ["Unknown", "In rhythm", "Hittable with adjustment", "Unattackable"],
  destination: ["Unknown", "Outside", "Middle", "Opposite", "Back row", "Dump"],
  tempo: ["Unknown", "Quick", "Medium", "High arc"],
  placement: ["Unknown", "On target", "Tight", "Off net", "Inside", "Wide"],
  outcome: [
    "Unknown",
    "Kill",
    "Dug by opponent",
    "Blocked back",
    "Blocked for point",
    "Attack error",
    "Setter fault",
    "Ace",
    "Serve in play",
    "Serve error",
  ],
  incoming_pass: ["Unknown", "In system", "Off net", "Scramble"],
  blockers: ["Unknown", "0", "1", "2", "3"],
};
const labels: Record<string, string> = {
  position: "Playing position",
  action: "Contact",
  quality: "Set quality",
  destination: "Set destination",
  tempo: "Set tempo",
  placement: "Set placement",
  outcome: "Outcome",
  incoming_pass: "Incoming ball",
  blockers: "Opposing blockers",
};
export function CoachingEditor({
  clip,
  players,
  changed,
}: {
  clip: CoachedClip;
  players: Player[];
  changed: () => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(clip.coaching),
    [busy, setBusy] = useState(false);
  useEffect(() => setDraft(clip.coaching), [clip.id, clip.coaching]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { game_id, ...body } = draft as CoachingRecord & {
        game_id?: number;
      };
      await api("/clips/" + clip.id + "/coaching", "PUT", body);
      await changed();
      toast.success("Coaching record saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <h2>Describe the contact</h2>
      <label>
        Who made this contact?
        <select
          value={draft.player_id ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              player_id: e.target.value ? +e.target.value : null,
            })
          }
        >
          <option value="">Unknown / unassigned</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Contact time in match (seconds)
        <input
          type="number"
          min={clip.start_ts}
          max={clip.end_ts}
          step=".01"
          value={draft.event_time}
          onChange={(e) => setDraft({ ...draft, event_time: +e.target.value })}
        />
      </label>
      {Object.entries(options)
        .filter(
          ([k]) =>
            !["quality", "destination", "tempo", "placement"].includes(k) ||
            draft.position === "Setter",
        )
        .map(([k, values]) => (
          <label key={k}>
            {labels[k]}
            <select
              aria-label={labels[k]} value={String(draft[k as keyof CoachingRecord])}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
            >
              {[
                ...new Set([
                  ...values,
                  String(draft[k as keyof CoachingRecord]),
                ]),
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
      <label>
        5–1 setter starting zone
        <select
          value={draft.setter_zone ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              setter_zone: e.target.value ? +e.target.value : null,
            })
          }
        >
          <option value="">Unknown / other system</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.mishit}
          onChange={(e) => setDraft({ ...draft, mishit: e.target.checked })}
        />{" "}
        Mishit on following attack
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.confirmed}
          onChange={(e) => setDraft({ ...draft, confirmed: e.target.checked })}
        />{" "}
        Reviewed and confirmed
      </label>
      <button className="primary" disabled={busy}>
        Save coaching
      </button>
      <p>
        <small>
          Confirm the contact before including it in coaching rates.
        </small>
      </p>
    </form>
  );
}
type Stats = {
  confirmed: number;
  unconfirmed: number;
  kill_rate: { numerator: number; denominator: number };
  hittable_sets: { numerator: number; denominator: number };
  outcomes: Record<string, number[]>;
  mishits: number;
};
export function CoachingStats({
  matchId,
  game,
  players,
  onEvidence,
}: {
  matchId: number;
  game: number;
  players: Player[];
  onEvidence: (ids: number[]) => void;
}) {
  const [person, setPerson] = useState(0);
  const query = useQuery({
    queryKey: ["coaching-stats", matchId, game, person],
    queryFn: () =>
      api<Stats>(
        "/matches/" +
          matchId +
          "/coaching-stats?" +
          new URLSearchParams({
            ...(game ? { game_id: String(game) } : {}),
            ...(person ? { player_id: String(person) } : {}),
          }),
      ),
    enabled: !!matchId,
  });
  const s = query.data;
  if (!s) return null;
  const rate = (v: { numerator: number; denominator: number }) =>
    v.denominator
      ? Math.round((100 * v.numerator) / v.denominator) +
        "% (" +
        v.numerator +
        "/" +
        v.denominator +
        ")"
      : "No graded contacts";
  return (
    <section>
      <h2>Coaching dashboard</h2>
      <label>
        Contact player
        <select value={person} onChange={(e) => setPerson(+e.target.value)}>
          <option value="0">All players</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <dl>
        <dt>Kill rate off sets</dt>
        <dd>{rate(s.kill_rate)}</dd>
        <dt>Hittable sets</dt>
        <dd>{rate(s.hittable_sets)}</dd>
        <dt>Confirmed contacts</dt>
        <dd>{s.confirmed}</dd>
        <dt>Awaiting review</dt>
        <dd>{s.unconfirmed}</dd>
        <dt>Mishits</dt>
        <dd>{s.mishits}</dd>
      </dl>
      <div className="chiprow">
        {Object.entries(s.outcomes).map(([outcome, ids]) => (
          <button key={outcome} onClick={() => onEvidence(ids)}>
            {outcome} · {ids.length}
          </button>
        ))}
      </div>
    </section>
  );
}
export function IdentifyPlayer({
  players,
  changed,
}: {
  players: Player[];
  changed: () => Promise<unknown>;
}) {
  const [source, setSource] = useState(""),
    [target, setTarget] = useState("");
  return (
    <details>
      <summary>Link an unknown to a known player</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/players/" + source + "/identify", "POST", {
              target_id: +target,
            });
            setSource("");
            setTarget("");
            await changed();
            toast.success("Linked contacts to player");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <label>
          Unknown or duplicate
          <select
            required
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Choose player</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Identify as
          <select
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Choose player</option>
            {players
              .filter((p) => String(p.id) !== source)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
          </select>
        </label>
        <p>
          All contacts assigned to the first player will follow the second name.
        </p>
        <button>Link player</button>
      </form>
    </details>
  );
}
