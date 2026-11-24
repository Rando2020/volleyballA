import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const tracker=vm.runInNewContext(readFileSync('dist/tracking.js','utf8')+';BallTracking');
const frame=(pos)=>{
  const out=new Uint8ClampedArray(64*40*4);
  if(pos!==null)for(let y=15;y<18;y++)for(let x=pos;x<pos+3;x++)out.fill(255,(64*y+x)*4,(64*y+x)*4+3);
  return out;
};
const a=frame(10),b=frame(16);
assert.ok(Math.abs(tracker.observe(b,a,64,40,0.125).point.x-17/64)<0.001);
assert.ok(!tracker.observe(a,a,64,40,0.25).point);
assert.ok(!tracker.observe(frame(null),a,64,40,0.25).point);
assert.deepEqual([...tracker.bounds({start:2,end:7},9,5,5)],[0,9]);
assert.deepEqual([...tracker.bounds({start:8,end:9},30,10,0)],[3,9]);
const points=[0,1,2,3,4,5,6,7,8].map((i)=>({time:i/8,x:0.1+0.05*i,y:[.5,.46,.41,.38,.40,.47,.54,.45,.40][i]}));
const types=tracker.extract(points,[{start:0,end:1.1}]).map(x=>x.type);
assert.ok(types.includes('Serve')&&types.includes('Pass'));
console.log('PASS: moving target, stationary and missing ball, independent bounded padding, serve and pass cues');
const identity=vm.runInNewContext(readFileSync('dist/identity.js','utf8')+';PlayerIdentity');
const follow=identity.createTracker();
const shirt=(left)=>{
  const out=new Uint8ClampedArray(120*80*4);
  for(let y=36;y<45;y++)for(let x=left;x<left+5;x++){
    const j=(y*120+x)*4;out[j]=200;out[j+1]=25;out[j+2]=60;
  }
  return out;
};
let prev=shirt(32),linked=[];
for(let i=1;i<8;i++){
  const left=32+i*2,cur=shirt(left);
  const id=follow(cur,prev,120,80,i/8,{x:(left+2)/120,y:0.46});if(id)linked.push(id);prev=cur;
}
assert.ok(linked.length>=2 && linked.at(-1)===linked.at(-2),'maintain a short moving-shirt track');
assert.equal(follow(prev,prev,120,80,2,{x:.9,y:.7}),null);
console.log('PASS: provisional clothing continuity and absent contact');
