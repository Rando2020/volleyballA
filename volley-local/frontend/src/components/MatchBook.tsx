import { useState, FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, time } from "../api/client";
import { Game } from "./Coaching";
export function MatchBook({
  matchId,
  duration,
  games,
  changed,
}: {
  matchId: number;
  duration: number;
  games: Game[];
  changed: () => Promise<unknown>;
}) {
  const [edit, setEdit] = useState<Game | null>(null);
  const channel = useQuery({
    queryKey: ["channel"],
    queryFn: () => api<{ url: string }>("/channel"),
  });
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    try {
      await api(
        edit ? "/games/" + edit.id : "/matches/" + matchId + "/games",
        edit ? "PUT" : "POST",
        {
          name: String(f.get("name")),
          stage: String(f.get("stage")),
          number: Number(f.get("number")),
          start_ts: Number(f.get("start")),
          url: String(f.get("url")),
        },
      );
      setEdit(null);
      form.reset();
      await changed();
      toast.success("Game boundary saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <details>
      <summary>Games and YouTube bookmarks</summary>
      <p>Clips follow the latest game boundary at their contact time.</p>
      {games.map((g) => (
        <div key={g.id} className="sectionTitle">
          <span>
            {g.stage} · Game {g.number} · {g.name} · {time(g.start_ts)}{" "}
            {g.url && (
              <a href={g.url} target="_blank" rel="noreferrer">
                YouTube
              </a>
            )}
          </span>
          <button onClick={() => setEdit(g)}>Edit</button>
          <button
            onClick={async () => {
              try {
                await api("/games/" + g.id, "DELETE");
                await changed();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Remove boundary
          </button>
        </div>
      ))}
      <form key={edit?.id ?? "new"} onSubmit={save}>
        <label>
          Opponent / game name
          <input required name="name" defaultValue={edit?.name} />
        </label>
        <div className="actions">
          <label>
            Game number
            <input
              required
              type="number"
              min="1"
              max="999"
              name="number"
              defaultValue={edit?.number ?? games.length + 1}
            />
          </label>
          <label>
            Starts at (seconds)
            <input
              required
              type="number"
              min="0"
              max={Math.max(0, duration - 0.001)}
              step=".01"
              name="start"
              defaultValue={edit?.start_ts ?? 0}
            />
          </label>
        </div>
        <label>
          Competition stage
          <select name="stage" defaultValue={edit?.stage ?? "Pool play"}>
            {["Pool play", "Bracket play", "Friendly", "Practice"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          YouTube game link
          <input type="url" name="url" defaultValue={edit?.url} />
        </label>
        <button>{edit ? "Save boundary" : "Add game"}</button>
        {edit && (
          <button type="button" onClick={() => setEdit(null)}>
            Cancel
          </button>
        )}
      </form>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/channel", "PUT", {
              url: String(new FormData(e.currentTarget).get("channel")),
            });
            await channel.refetch();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <label>
          Personal YouTube channel
          <input
            type="url"
            name="channel"
            key={channel.data?.url}
            defaultValue={channel.data?.url}
          />
        </label>
        <button>Save channel</button>
        {channel.data?.url && (
          <a href={channel.data.url} target="_blank" rel="noreferrer">
            Open channel
          </a>
        )}
      </form>
      <small>
        These links are bookmarks. Analysis uses your local video file.
      </small>
    </details>
  );
}
type Backup = {
  plays?: { mediaId?: string; mediaName?: string }[];
  sample?: boolean;
};
export function ImportCourtSense({
  matchId,
  changed,
}: {
  matchId: number;
  changed: () => Promise<unknown>;
}) {
  const [backup, setBackup] = useState<Backup | null>(null),
    [media, setMedia] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const sources = [
    ...new Map(
      (backup?.plays ?? []).map((p) => [
        String(p.mediaId ?? ""),
        p.mediaName ?? String(p.mediaId),
      ]),
    ).entries(),
  ];
  return (
    <details>
      <summary>Import earlier CourtSense analysis</summary>
      <a
        href={"/api/matches/" + matchId + "/courtsense-backup"}
        download="courtsense-backup.json"
      >
        Download coaching backup
      </a>
      <p>
        In CourtSense, export your analysis JSON. Choose the matching original
        video here before importing.
      </p>
      <input
        aria-label="CourtSense backup"
        type="file"
        accept=".json"
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f) return;
            const b = JSON.parse(await f.text());
            if (!Array.isArray(b.plays))
              throw Error("Select a CourtSense analysis backup");
            setBackup(b);
            setMedia(String(b.plays[0]?.mediaId ?? ""));
            setConfirmed(false);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
      {backup && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await api<{ imported: number; skipped: number }>(
                "/matches/" + matchId + "/import-courtsense",
                "POST",
                { backup, media_id: media, confirm_mapping: confirmed },
              );
              await changed();
              toast.success(
                r.imported +
                  " clips imported; " +
                  r.skipped +
                  " already present",
              );
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Recording in backup
            <select
              value={media}
              onChange={(e) => {
                setMedia(e.target.value);
                setConfirmed(false);
              }}
            >
              {sources.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />{" "}
            This recording is the selected match video
          </label>
          <button disabled={busy || !confirmed}>
            {busy ? "Importing…" : "Import saved plays"}
          </button>
        </form>
      )}
    </details>
  );
}
