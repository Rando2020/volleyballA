'use strict';
// VballNetFastV1, Alexander Sigatchov. See volleyball-model-LICENSE.txt.
const RallyBall = (() => {
  const runtime='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  const model='https://cdn.jsdelivr.net/gh/asigatchov/fast-volleyball-tracking-inference@c3864156a4dfbd5af3f00f427ab0fc4bfe7af5b5/models/VballNetFastV1_seq9_grayscale_233_h288_w512.onnx';
  let loading;
  async function initialize(){
    const ort=await import(runtime+'ort.wasm.min.mjs');
    ort.env.wasm.numThreads=1;
    ort.env.wasm.wasmPaths=runtime;
    ort.env.logLevel='error';
    const response=await fetch(model);
    if(!response.ok)throw Error('Volleyball detector download failed.');
    const session=await ort.InferenceSession.create(await response.arrayBuffer(),{executionProviders:['wasm']});
    return {ort,session};
  }
  function decode(data,offset,w,h,time){
    let peak=0,index=-1;
    for(let i=0;i<w*h;i++)if(data[offset+i]>peak){peak=data[offset+i];index=i;}
    if(peak<0.55)return null;
    const px=index%w,py=Math.floor(index/w);
    let total=0,x=0,y=0;
    for(let i=0;i<w*h;i++){
      const v=data[offset+i];if(v<peak*0.68)continue;
      const xx=i%w,yy=Math.floor(i/w);
      if(Math.abs(xx-px)>10||Math.abs(yy-py)>10){if(v>peak*0.9)return null;continue;}
      total+=v;x+=(xx+0.5)*v;y+=(yy+0.5)*v;
    }
    return {time,x:x/total/w,y:y/total/h,score:peak};
  }
  async function create(){
    loading ||= initialize().catch(e=>{loading=null;throw e;});
    const {ort,session}=await loading;
    const width=512,height=288,area=width*height,sequence=9;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const batch=new Float32Array(area*sequence);
    let times=[];
    return {
      capture(video,time){
        ctx.drawImage(video,0,0,width,height);
        const rgba=ctx.getImageData(0,0,width,height).data,offset=times.length*area;
        for(let i=0;i<area;i++)batch[offset+i]=(rgba[4*i]*0.299+rgba[4*i+1]*0.587+rgba[4*i+2]*0.114)/255;
        times.push(time);
        return times.length===sequence;
      },
      async flush(){
        if(!times.length)return [];
        for(let i=times.length;i<sequence;i++)batch.copyWithin(i*area,(i-1)*area,i*area);
        const input=new ort.Tensor('float32',batch,[1,sequence,height,width]);
        const result=await session.run({[session.inputNames[0]]:input});
        try {
          const out=result[session.outputNames[0]], [n,channels,h,w]=out.dims;
          if(n!==1 || channels!==9 || !w || !h)throw Error('Unexpected volleyball detector output.');
          return times.map((t,i)=>decode(out.data,i*w*h,w,h,t)).filter(Boolean);
        } finally {
          times=[];input.dispose();Object.values(result).forEach(t=>t.dispose());
        }
      }
    };
  }
  return {create};
})();
