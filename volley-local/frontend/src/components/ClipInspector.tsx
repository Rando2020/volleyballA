import { ReactNode } from "react";
import { Clip, Match, pct } from "../api/client";
export function ClipInspector({
  clip,
  match,
  children,
}: {
  clip?: Clip;
  match?: Match;
  children: ReactNode;
}) {
  return (
    <aside className="inspector">
      <h2>Clip inspector</h2>
      {children}
      {clip && (
        <>
          <h2>Detection</h2>
          <dl>
            <dt>Confidence</dt>
            <dd>{pct(clip.confidence)}</dd>
            <dt>Ball presence</dt>
            <dd>{pct(clip.ball_presence_score)}</dd>
            <dt>Source</dt>
            <dd>{match?.resolution}</dd>
          </dl>
        </>
      )}
    </aside>
  );
}
