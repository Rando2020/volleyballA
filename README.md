# CourtSense

Browser-local volleyball review and coaching dashboard. Static HTML/CSS/JS, no build dependencies. Serve `dist` using an HTTP server.

## Included
- Import browser-playable video; persist original files in IndexedDB when quota permits.
- Player/position tagging, setter placement/tempo/quality, attack outcome, mishit, incoming pass, blockers and notes.
- Clip boundaries, bounded playback, editable plays, screen-space timestamped trajectory points.
- Dashboard filters, known-outcome denominators, outcome-to-clip drilldown, clip search.
- Real-time trimmed clip export via MediaRecorder/captureStream on compatible desktop browsers. Re-encoded output is not frame-accurate. Original audio capture depends on browser support. Trace overlays are not burned into exports.
- Analysis metadata JSON backup. Video remains separate. Browser storage is device-specific and can be cleared; retain original videos and exported metadata.
- Separate, clearly labeled illustrative sample data.

## Deliberate limits
No automatic player identity, ball tracking, rally detection, calibrated 3D trajectory, AI advice, cloud video storage or cross-device sync. Manual trajectory points use normalized coordinates of the video stage including letterboxing. Ratings are coach judgments. Browser clip export is intended for short moments and runs in real time with the tab visible. Safari can review video and use tagged clips but may not support captureStream export.

## UI principles
- Hick's law: position-specific fields; secondary context lives in disclosure.
- Fitts's law: primary controls use at least 44px targets.
- Gestalt proximity: footage/trim controls are grouped; classification has its own panel.
- Recognition over recall: explicit outcome labels, visible clip boundaries and player names.
- Progressive disclosure: notes and blockers are available without crowding the main workflow.
- Feedback and error prevention: range validation, save feedback, delete confirmation, edit cancellation.
- Evidence-first analytics: each outcome bar links to underlying clips; missing grades do not silently count as failures.
- Responsive layout: sidebar becomes top navigation; studio stacks on narrower screens; text and labels accompany color.

## Metrics
Kill rate off sets = kills / setter plays with known attack outcomes (kill, dug, blocked back, blocked for point, attack error). Setter faults and unknown outcomes are excluded.

Hittable sets = in rhythm + hittable with adjustment / setter plays with known quality.

These metrics describe tagged clips, not necessarily a complete match. Other positions support contact/action tags and outcome counts; their advanced metrics are not yet implemented.

## Video analysis and rule references

Load video and choose Analyze video. CourtSense samples up to about 1,800 small frames in a separate decoder and groups motion into candidate clips. This works best with fixed cameras. Camera movement, warmups, or a distant ball can produce extra or missed suggestions. Confirm Point, Error and Pass while reviewing each clip. These are overlapping labels. Point means a point for either team and does not identify the winner. Clips retain their selected event tags and optional 5–1 setter zone after saving. The clip library filters both. The scan queue is temporary.

The contextual rule lookup retrieves short, locally authored summaries by keyword and links to the FIVB indoor 2025–2028 edition and a coaching resource. It does not run a generative model. The Hudl Explore interaction reference is https://www.hudl.com/support/hudl-volleyball/guides/explore.
