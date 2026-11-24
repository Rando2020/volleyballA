'use strict';
const FilmAnalysis = (() => {
  const rulebook = 'https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN.pdf';
  const references = [
    ['Point and side-out', 'point scoring win rally side out serve error', 'The rally winner earns a point. A receiving team that wins also gains service.', 'FIVB indoor 2025–2028, §6.1', rulebook],
    ['Service rotation', 'rotation zones formation service order side out', 'Start from the submitted lineup. When the receiving team gains service, zone 2 moves to 1, then 1 to 6, 6 to 5, 5 to 4, 4 to 3, and 3 to 2.', 'FIVB indoor 2025–2028, §7.6', rulebook],
    ['Positions at service', 'position front back row formation zone starting setter', 'Zones 2, 3 and 4 form the front row. Zones 1, 6 and 5 form the back row. After service contact players can move into their playing positions.', 'FIVB indoor 2025–2028, §7.4', rulebook],
    ['First contact and team hits', 'pass reception receive dig contacts touch error', 'A team has up to three hits to return the ball, in addition to a block contact. Record pass quality from the footage as a coaching judgment.', 'FIVB indoor 2025–2028, §9.1 and §14.4', rulebook],
    ['Reviewing a 5–1', '5-1 51 formation setter front back row rotations offense', 'For a team using one setter across all six rotations, record the setter’s zone at service contact. Compare clips within that zone. A team’s chosen receive pattern is a coaching decision.', 'Coaching context · The Art of Coaching Volleyball, The 5-1', 'https://courses.theartofcoachingvolleyball.com/course/head-coach-level-one-certification/curriculum/']
  ];
  function retrieve(query) {
    const tokens = query.toLowerCase().replace(/[–−]/g, '-').match(/[a-z0-9-]+/g) || [];
    return references.map(row => {
      const terms = (row[0] + ' ' + row[1]).toLowerCase().replace(/–/g, '-').split(/\s+/);
      return {row, score: tokens.filter(token => terms.includes(token)).length};
    }).filter(item => !tokens.length || item.score).sort((a,b) => b.score-a.score).map(item => item.row);
  }
  function segments(samples, step, duration) {
    if (!samples.length) return [];
    const sorted = samples.map(sample => sample.motion).sort((a,b) => a-b);
    const threshold = Math.max(0.012, Math.min(0.12, sorted[Math.floor(sorted.length*0.2)]*1.8));
    const windows = [];
    for (const {at,motion} of samples) {
      if (motion < threshold) continue;
      const start = Math.max(0, at-step-1);
      const end = Math.min(duration, at+1.5);
      const last = windows.at(-1);
      if (last && start <= last.end && end-last.start <= 24) last.end = end;
      else windows.push({start:last ? Math.max(start,last.end) : start,end});
    }
    return windows.filter(window => window.end>window.start);
  }
  return {retrieve,segments};
})();
