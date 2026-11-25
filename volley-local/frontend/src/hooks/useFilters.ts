import { useMemo } from "react";
import { Clip, Filter } from "../api/client";
export function matchesFilter(c: Clip, f: Filter) {
  return (
    (!f.include.length ||
      (f.logic === "all"
        ? f.include.every((t) => c.tags.includes(t))
        : f.include.some((t) => c.tags.includes(t)))) &&
    !f.exclude.some((t) => c.tags.includes(t)) &&
    c.duration_s >= f.min &&
    (f.max === null || c.duration_s <= f.max) &&
    100 * c.confidence >= f.low &&
    100 * c.confidence <= f.high &&
    (!f.star || c.starred) &&
    (!f.player || c.players.some((p) => p.player_id === f.player)) &&
    c.notes.toLowerCase().includes(f.search.toLowerCase())
  );
}

export function useFilters(clips: Clip[], filter: Filter) {
  return useMemo(
    () => clips.filter((c) => matchesFilter(c, filter)),
    [clips, filter],
  );
}
