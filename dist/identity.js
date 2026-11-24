'use strict';
// Provisional clothing tracks are local to one recording. Short gaps and
// ambiguous matches deliberately start a new track.
const PlayerIdentity = (() => {
  const colorDistance=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]));
  function createTracker(){
    let active=[], next=1;
    function observe(pixels,prev,w,h,t,ball){
      const candidates=[];
      const stride=Math.max(4,Math.round(w/35));
      for(let y=stride;y<h-stride*2;y+=stride) for(let x=stride;x<w-stride;x+=stride){
        let changed=0,count=0,r=0,g=0,b=0;
        for(let dy=0;dy<stride*2;dy+=2)for(let dx=0;dx<stride;dx+=2){
          const i=((y+dy)*w+x+dx)*4;
          const difference=Math.abs(pixels[i]-prev[i])+Math.abs(pixels[i+1]-prev[i+1])+Math.abs(pixels[i+2]-prev[i+2]);
          count++;
          if(difference<=80 || Math.max(pixels[i],pixels[i+1],pixels[i+2])<45)continue;
          changed++;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];
        }
        if(changed/count<0.2)continue;
        candidates.push({x:(x+stride/2)/w,y:(y+stride)/h,color:[r/changed,g/changed,b/changed],motion:changed/count});
      }
      if(candidates.length>100){active=[];observe.visible=[];return null;}
      const bodies=[];
      for(const c of candidates.sort((a,b)=>b.motion-a.motion)){
        if(!bodies.some(p=>Math.hypot(c.x-p.x,c.y-p.y)<0.09))bodies.push(c);
        if(bodies.length===16)break;
      }
      const used=new Set();
      const recent=active.filter(p=>t-p.time<0.7);
      for(const c of bodies){
        const matches=recent.filter(p=>!used.has(p.id)).map(p=>({p,dist:Math.hypot(c.x-p.x,c.y-p.y),color:colorDistance(c.color,p.color)}))
          .filter(m=>m.dist<0.1 && m.color<55).map(m=>({...m,cost:m.dist+m.color/400})).sort((a,b)=>a.cost-b.cost);
        const m=matches[0];
        const previous=m && (!matches[1]||matches[1].cost-m.cost>0.025)?m.p:null;
        c.id=previous?.id||next++;c.frames=(previous?.frames||0)+1;c.time=t;
        used.add(c.id);
      }
      active=bodies.concat(recent.filter(p=>!used.has(p.id)));
      observe.visible=bodies.filter(p=>p.frames>=3).map(({id,x,y})=>({id,x,y}));
      if(!ball)return null;
      const nearby=bodies.filter(p=>p.frames>=3).map(p=>({p,d:Math.hypot(p.x-ball.x,(p.y-ball.y-0.045)*0.8)}))
        .filter(m=>m.d<0.13).sort((a,b)=>a.d-b.d);
      if(!nearby.length || (nearby[1] && nearby[1].d-nearby[0].d<0.035))return null;
      return nearby[0].p.id;
    }
    observe.visible=[];
    return observe;
  }
  function roleHint(contacts){
    const confirmed=contacts.filter(p=>!p.suggested);
    const sets=confirmed.filter(p=>p.action==='Set'||p.events?.includes('Set')).length;
    return sets>=2 && sets>=confirmed.length/2?'Possible setter from repeated setting contacts':'Role unknown';
  }
  return {createTracker,roleHint};
})();
