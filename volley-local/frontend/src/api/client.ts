export type Tag = {
  id: number;
  name: string;
  color: string;
  hotkey: string | null;
};
export type Player = { id: number; label: string; jersey_color: string | null };
export type Clip = {
  id: number;
  start_ts: number;
  end_ts: number;
  duration_s: number;
  confidence: number;
  ball_presence_score: number;
  tags: number[];
  players: { player_id: number; role: string | null }[];
  starred: boolean;
  flagged: boolean;
  notes: string;
};
export type Match = {
  id: number;
  filename: string;
  status: string;
  error: string | null;
  duration_s: number;
  progress: number;
  resolution: string;
  fps: number;
};
export type Filter = {
  include: number[];
  exclude: number[];
  logic: "any" | "all";
  min: number;
  max: number | null;
  low: number;
  high: number;
  star: boolean;
  player: number;
  search: string;
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers:
      body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw Error(
      typeof msg.detail === "string"
        ? msg.detail
        : "Request failed (" + res.status + ")",
    );
  }
  return res.json();
}
export const time = (n: number) =>
  Math.floor(n / 60) + ":" + String(Math.floor(n % 60)).padStart(2, "0");
export const pct = (n: number) => Math.round(100 * n) + "%";
export const toggle = (a: number[], id: number) =>
  a.includes(id) ? a.filter((x) => x !== id) : [...a, id];
