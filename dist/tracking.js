'use strict';
const BallTracking = (() => {
  function extract(points, windows) {
    const events=[];
    let cursor=0;
    for(const window of windows) {
      while(cursor<points.length && points[cursor].time<window.start) cursor++;
      const slice=[];
      while(cursor<points.length && points[cursor].time<window.end) slice.push(points[cursor++]);
      const contacts=[];
      for(let i=2;i<slice.length-2;i++){
        const a=slice[i-2],b=slice[i],c=slice[i+2];
        if(c.segment!==a.segment || c.time-a.time>0.8 || b.time-(contacts.at(-1)?.at??-10)<0.85) continue;
        const fall=b.y-a.y,rise=b.y-c.y;
        if(fall>0.025 && rise>0.025) contacts.push({type:'Pass',at:b.time});
      }
      const first=slice[0],next=slice[3];
      if(first && next && first.segment===next.segment && next.time-first.time<=0.65 && (first.x<0.22||first.x>0.78) &&
        (next.x-first.x)*(0.5-first.x)>0.018 && first.y-next.y>0.025)
        contacts.unshift({type:'Serve',at:first.time});
      if(!contacts.length) events.push({...window,type:'Activity',at:window.start});
      for(const contact of contacts) events.push({...contact,start:Math.max(window.start,contact.at-0.6),end:Math.min(window.end,contact.at+1.2)});
    }
    return events;
  }
  function bounds(play,duration,before,after) {
    const limit=n=>Math.min(5,Math.max(0,Number(n)||0));
    return [Math.max(0,play.start-limit(before)),Math.min(duration,play.end+limit(after))];
  }
  return {extract,bounds};
})();
