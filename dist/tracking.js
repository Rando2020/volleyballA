'use strict';
const BallTracking = (() => {
  // Input is ordered, normalized ball detections. A segment change is a
  // tracking break. A new flight must earn its own evidence after each break.
  function rallyWindows(points) {
    const windows = [];
    const lookback = 0.20, settle = 0.35;
    let anchor = 0, start = null, lastMoving = null;
    function close() {
      if (start !== null) windows.push({start, end: lastMoving});
      start = null;
      lastMoving = null;
    }
    for (let i = 0; i < points.length; i++) {
      const point = points[i], previous = points[i - 1];
      if (!previous || point.segment !== previous.segment ||
          point.time - previous.time > 0.081 || point.time <= previous.time) {
        close();
        anchor = i;
      }
      while (anchor + 1 < i && points[anchor + 1].time <= point.time - lookback) anchor++;
      const first = points[anchor];
      if (point.time - first.time < lookback - 1e-6) continue;
      const distance = Math.hypot(point.x - first.x, point.y - first.y);
      // Require progress across both halves. A one-frame coordinate glitch
      // can exceed the endpoint threshold, but has no intermediate flight.
      const middle = points[Math.floor((anchor + i) / 2)];
      const dx = point.x - first.x, dy = point.y - first.y;
      const progress = (middle.x - first.x) * dx + (middle.y - first.y) * dy;
      if (distance >= 0.055 && progress > .12 * distance ** 2 && progress < .88 * distance ** 2) {
        if (start === null) start = first.time;
        lastMoving = point.time;
      } else if (lastMoving !== null && point.time - lastMoving > settle) {
        close();
      }
    }
    close();
    return windows;
  }

  function extract(points, windows) {
    const events=[];
    let cursor=0;
    for(const window of windows) {
      while(cursor<points.length && points[cursor].time<window.start) cursor++;
      const slice=[];
      while(cursor<points.length && points[cursor].time<=window.end) slice.push(points[cursor++]);
      const contacts=[];
      for(let i=2;i<slice.length-2;i++){
        const a=slice[i-2],b=slice[i],c=slice[i+2];
        if(c.segment!==a.segment || c.time-a.time>0.8 || b.time-(contacts.at(-1)?.at??-10)<0.85) continue;
        const fall=b.y-a.y,rise=b.y-c.y;
        if(fall>0.025 && rise>0.025){
          contacts.push({type:'Pass',at:b.time});
          continue;
        }
        // A lateral reversal or sharp redirection can be a touch of several kinds.
        const dx1=b.x-a.x,dy1=b.y-a.y,dx2=c.x-b.x,dy2=c.y-b.y;
        const before=Math.hypot(dx1,dy1),after=Math.hypot(dx2,dy2);
        if(before>0.025 && after>0.025 && (dx1*dx2+dy1*dy2)<0.25*before*after &&
          Math.abs(dx2-dx1)>0.025)contacts.push({type:'Unclassified play',at:b.time});
      }
      const first=slice[0],next=slice[3];
      if(first && next && first.segment===next.segment && next.time-first.time<=0.65 && (first.x<0.22||first.x>0.78) &&
        (next.x-first.x)*(0.5-first.x)>0.018 && first.y-next.y>0.025)
        contacts.unshift({type:'Serve',at:first.time});
      // A flight is reviewable even when the contact itself was obscured.
      // Require appreciable displacement and speed within a continuous track.
      if(!contacts.length && slice.length>=4){
        const origin=slice[0];
        const flight=slice.find(point=>{
          const dt=point.time-origin.time;
          const distance=Math.hypot(point.x-origin.x,point.y-origin.y);
          return point.segment===origin.segment && dt>=0.12 && distance>=0.055 && distance/dt>=0.20;
        });
        if(flight)contacts.push({type:'Unclassified play',at:flight.time});
      }
      for(const contact of contacts) events.push({...contact,start:Math.max(window.start,contact.at-0.6),end:Math.min(window.end,contact.at+1.2)});
    }
    return events;
  }
  function bounds(play,duration,before,after) {
    const limit=n=>Math.min(5,Math.max(0,Number(n)||0));
    return [Math.max(0,play.start-limit(before)),Math.min(duration,play.end+limit(after))];
  }
  return {extract,bounds,rallyWindows};
})();
