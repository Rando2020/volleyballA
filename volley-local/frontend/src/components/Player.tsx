import { RefObject } from "react";
import { Clip, Match } from "../api/client";
import Tracking from "./Tracking";
export function Player({
  c,
  match,
  video,
  tracing,
  setAt,
}: {
  c: Clip;
  match?: Match;
  video: RefObject<HTMLVideoElement>;
  tracing: boolean;
  setAt: (n: number) => void;
}) {
  return (
    <div
      className="videoFrame"
      style={{
        aspectRatio: (match?.resolution ?? "16x9").replace("x", " / "),
        width:
          "min(100%, calc(60vh * " +
          Number(match?.resolution.split("x")[0] ?? 16) /
            Number(match?.resolution.split("x")[1] ?? 9) +
          "))",
      }}
    >
      <video
        className="screen"
        key={c.id}
        ref={video}
        src={"/api/clips/" + c.id + "/video"}
        poster={"/api/clips/" + c.id + "/thumb"}
        controls
        preload="metadata"
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
      />
      {tracing && <Tracking clip={c} video={video} />}
    </div>
  );
}
