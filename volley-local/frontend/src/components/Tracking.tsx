import { RefObject, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, Clip } from "../api/client";
type Obj = { box: [number, number, number, number]; id: number; cls: number };
type Frame = { t: number; objects: Obj[] };
export default function Tracking({
  clip,
  video,
}: {
  clip: Clip;
  video: RefObject<HTMLVideoElement>;
}) {
  const q = useQuery({
    queryKey: ["tracking", clip.id],
    queryFn: () => api<Frame[]>("/clips/" + clip.id + "/tracking"),
  });
  const [at, setAt] = useState(0);
  useEffect(() => {
    let handle = 0;
    function tick() {
      setAt((video.current?.currentTime ?? 0) + clip.start_ts);
      handle = requestAnimationFrame(tick);
    }
    tick();
    return () => cancelAnimationFrame(handle);
  }, [clip, video]);
  const frames = q.data ?? [];
  let lo = 0,
    hi = frames.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (frames[m].t <= at) lo = m + 1;
    else hi = m;
  }
  const frame = frames[lo - 1];
  if (!frame || at - frame.t > 0.35) return null;
  const ball = frame.objects.find((o) => o.cls === 32);
  const trail: string[] = [];
  if (ball) {
    let last = at;
    for (let i = lo - 1; i >= 0 && at - frames[i].t <= 0.8; i--) {
      const o = frames[i].objects.find((o) => o.cls === 32 && o.id === ball.id);
      if (!o || last - frames[i].t > 0.3) break;
      const [x, y, r, b] = o.box;
      trail.push((x + r) * 500 + "," + (y + b) * 500);
      last = frames[i].t;
    }
  }
  return (
    <svg
      className="overlay"
      aria-label="Tracked ball and players"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="#fff589"
        strokeWidth="3"
        points={trail.join(" ")}
      />
      {frame.objects.map((o) => {
        const [x, y, r, b] = o.box;
        return (
          <g key={o.cls + "-" + o.id}>
            <rect
              x={x * 1000}
              y={y * 1000}
              width={(r - x) * 1000}
              height={(b - y) * 1000}
              fill="none"
              stroke={o.cls === 32 ? "#fff589" : "#a9c9ff"}
              strokeWidth="2"
            />
            {o.cls === 0 && (
              <text
                x={x * 1000}
                y={Math.max(16, y * 1000 - 3)}
                fill="white"
                stroke="#121722"
                paintOrder="stroke"
                strokeWidth="3"
                fontSize="16"
              >
                P{o.id}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
