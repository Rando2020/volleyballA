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
