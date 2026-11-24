'use strict';
const BallTracking = (() => {
  // Compare successive frames, then measure each connected patch of bright motion.
  // A continuity prior helps when several similar patches appear near a player.
  function observe(frame, previous, width, height, time, prior) {
    const mask = new Uint8Array(width * height);
    let changed = 0;
    for (let i=0; i<mask.length; i++) {
      const j=i*4;
      const delta=Math.abs(frame[j]-previous[j])+Math.abs(frame[j+1]-previous[j+1])+Math.abs(frame[j+2]-previous[j+2]);
      if (delta<75) continue;
      changed++;
      if (Math.max(frame[j],frame[j+1],frame[j+2])>145 && frame[j]+frame[j+1]+frame[j+2]>340) mask[i]=1;
    }
    const motion=changed/mask.length;
    if (motion>0.36) return {motion};
    const stack=new Int32Array(mask.length);
    let best=null, runner=0;
    for (let i=0;i<mask.length;i++) {
      if (!mask[i]) continue;
      let size=1,count=0,sx=0,sy=0,left=width,right=0,top=height,bottom=0;
      stack[0]=i; mask[i]=0;
      while(size) {
        const k=stack[--size], x=k%width, y=Math.floor(k/width);
        count++; sx+=x; sy+=y;
        left=Math.min(left,x); right=Math.max(right,x);
        top=Math.min(top,y); bottom=Math.max(bottom,y);
        for(const n of [x>0?k-1:-1,x+1<width?k+1:-1,k-width,k+width]) {
          if(n>=0 && n<mask.length && mask[n]) {mask[n]=0;stack[size++]=n;}
        }
      }
      const w=right-left+1,h=bottom-top+1;
      if(count<3 || w>14 || h>14 || Math.min(w,h)/Math.max(w,h)<0.45) continue;
      const x=sx/count/width,y=sy/count/height;
      const near=prior && time-prior.time<0.5;
      const distance=near?Math.hypot(x-prior.x,y-prior.y):0;
      if(near && distance>0.34) continue;
      const score=count/(w*h)*Math.min(w,h)/Math.max(w,h)+Math.min(count,12)/45+(near?0.55-distance*2:0);
      if (!best || score>best.score) {runner=best?.score||0;best={x,y,time,score};}
      else runner=Math.max(runner,score);
    }
    return {motion,point:best && best.score>0.85 && best.score-runner>0.07?best:null};
  }
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
        if(c.time-a.time>0.8 || b.time-(contacts.at(-1)?.at??-10)<0.85) continue;
        const fall=b.y-a.y,rise=b.y-c.y;
        if(fall>0.025 && rise>0.025) contacts.push({type:'Pass',at:b.time});
      }
      const first=slice[0],next=slice[3];
      if(first && next && next.time-first.time<=0.65 && (first.x<0.22||first.x>0.78) &&
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
  return {observe,extract,bounds};
})();
