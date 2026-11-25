'use strict';
(() => {
  let generation = 0;
  let scanning = false;

  let restoredDetail=false;

  function jumpToTag(direction) {
    if (busy) return toast('Wait until clip export finishes.');
    if (!media || sample || !Number.isFinite(video.duration)) return toast('Load your match footage first.');
    const eligible = plays.filter(p => p.mediaId === media.id && !p.suggested &&
      Number.isFinite(p.start) && p.start >= 0 && p.start < video.duration &&
      direction * (p.start - video.currentTime) > 0.001);
    eligible.sort((a, b) => direction * (a.start - b.start));
    const target = eligible[0];
    if (!target) return toast(direction > 0 ? 'No later confirmed play.' : 'No earlier confirmed play.');
    video.pause();
    clipEnd = null;
    video.currentTime = target.start;
    toast(target.player + ' at ' + time(target.start));
  }
  $('previousTag').onclick = () => jumpToTag(-1);
  $('nextTag').onclick = () => jumpToTag(1);
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
        event.shiftKey || $('review').hidden || event.target.isContentEditable ||
        event.target.closest?.('input, textarea, select, [role="textbox"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'q' || key === 'e') {
      event.preventDefault();
      jumpToTag(key === 'q' ? -1 : 1);
    }
  });

  const now=()=>performance.now();
  const seconds=ms=>(ms/1000).toFixed(1)+' s';
  let windows = [];
  const initialCount=plays.length;
  plays=plays.filter(p=>!(p.suggested && p.detected==='Activity' && !p.rosterId && !p.identityOverride && !p.notes));
  if(plays.length!==initialCount)persist();
  let selectedWindow = null;
  let track=[], playerFrames=[];
  let scanMedia=null;
  let coverage='';
  for(const id of ['lead','tail']){
    $(id).innerHTML=Array.from({length:6},(_,i)=>'<option value="'+i+'">'+i+' seconds</option>').join('');
    $(id).value=localStorage.getItem('courtsense-'+id)||'0';
    $(id).onchange=()=>{localStorage.setItem('courtsense-'+id,$(id).value);if(selectedWindow)openCandidate(selectedWindow);};
  }
  const bounds=(p,duration)=>BallTracking.bounds(p,duration,$('lead').value,$('tail').value);
  const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');
  overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  overlay.setAttribute('viewBox','0 0 1000 1000');
  overlay.setAttribute('preserveAspectRatio','xMidYMid meet');
  $('stage').append(overlay);
  function paintBall(){
    overlay.replaceChildren();
    if(!video.videoWidth)return;
    const t=video.currentTime,width=video.videoWidth,height=video.videoHeight;
    overlay.setAttribute('viewBox','0 0 '+width+' '+height);
    function endIndex(list){
      let lo=0,hi=list.length;
      while(lo<hi){const mid=(lo+hi)>>1;if(list[mid].time<=t)lo=mid+1;else hi=mid;}
      return lo;
    }
    const players=playerFrames[endIndex(playerFrames)-1];
    if($('showPlayers').checked && players && t-players.time<0.16){
      for(const p of players.bodies){
        const mark=document.createElementNS(overlay.namespaceURI,'text');
        mark.setAttribute('x',p.x*width);mark.setAttribute('y',p.y*height);
        mark.setAttribute('font-size',width*0.016);mark.setAttribute('fill','#83dbff');
        mark.setAttribute('style','paint-order:stroke;stroke:#142732;stroke-width:3px');
        mark.textContent='P'+p.id;overlay.append(mark);
      }
    }
    if(!$('showBall').checked)return;
    const lo=endIndex(track),last=track[lo-1];
    if(!last || t-last.time>0.075)return;
    let start=lo-1;
    while(start>0 && t-track[start-1].time<0.5 && track[start].segment===track[start-1].segment)start--;
    const trail=document.createElementNS(overlay.namespaceURI,'polyline');
    trail.setAttribute('points',track.slice(start,lo).map(p=>p.x*width+','+p.y*height).join(' '));
    trail.setAttribute('style','fill:none;stroke:#ffdc5d;stroke-width:3;vector-effect:non-scaling-stroke');
    const ring=document.createElementNS(overlay.namespaceURI,'circle');
    ring.setAttribute('cx',last.x*width);ring.setAttribute('cy',last.y*height);ring.setAttribute('r',width*0.011);
    ring.setAttribute('style','fill:none;stroke:#ffdc5d;stroke-width:2;vector-effect:non-scaling-stroke');
    overlay.append(trail,ring);
  }
  video.addEventListener('timeupdate',paintBall);
  video.addEventListener('seeked',paintBall);
  $('showBall').onchange=paintBall;
  $('showPlayers').onchange=paintBall;
  if(video.requestVideoFrameCallback){
    function next(){paintBall();video.requestVideoFrameCallback(next);}
    video.requestVideoFrameCallback(next);
  }
  function requestTrack(id,write){
    return new Promise((resolve,reject)=>{
      if(!db)return reject(Error('Device storage unavailable.'));
      const tx=db.transaction('tracks',write?'readwrite':'readonly');
      const records=tx.objectStore('tracks');
      const req=write?records.put(write):records.get(id);
      tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  function openCandidate(item){
    tab('review');resetForm();
    selectedWindow=item;editing=item.id;
    $('player').value=item.player;$('position').value=item.position;roleFields();
    $('save').textContent='Confirm play';$('cancel').hidden=false;
    $('start').value=item.start;$('end').value=item.end;
    checks.forEach(box=>box.checked=kinds(item).includes(box.value));
    const [a,b]=bounds(item,video.duration);video.currentTime=a;clipEnd=b;play();
    drawQueue();$('stage').scrollIntoView({block:'center'});
  }
  const checks = [...document.querySelectorAll('#eventKinds input')];
  function kinds(play) {
    const labels = [...(play.events||[])];
    if(['Ace','Serve in play','Serve error'].includes(play.outcome))labels.push('Serve',play.outcome);
    if(['Kill','Attack error','Dug by opponent'].includes(play.outcome))labels.push('Attack');
    if(['Block point','Block touch'].includes(play.outcome))labels.push('Block');
    if(['Controlled dig','Uncontrolled dig'].includes(play.outcome))labels.push('Dig');
    if(play.action==='Set')labels.push('Set');
    if (['Kill','Ace','Block point','Blocked for point','Setter fault','Attack error','Serve error','Reception error'].includes(play.outcome)) labels.push('Point');
    if (['Setter fault','Attack error','Serve error','Reception error'].includes(play.outcome)) labels.push('Error');
    if (play.action === 'Serve receive' || ['In-system pass','Playable pass','Overpass','Reception error'].includes(play.outcome)) labels.push('Pass');
    return [...new Set(labels)];
  }
  function showRules(query) {
    const matches = FilmAnalysis.retrieve(query);
    $('ruleResults').innerHTML = matches.map(([title,,body,source,url]) =>
      '<article><h3>'+esc(title)+'</h3><p>'+esc(body)+'</p><a target="_blank" rel="noopener" href="'+url+'">'+esc(source)+'</a></article>'
    ).join('') || '<p>No matching reference. Try rotation, pass, or point.</p>';
  }
  $('ruleSearch').oninput = e => showRules(e.target.value);
  function showContext(query) {
    const entry=FilmAnalysis.retrieve(query)[0];
    const target=$('eventReference');
    target.replaceChildren();
    if (!entry) return;
    const link=document.createElement('a');
    link.href=entry[4];
    link.target='_blank';
    link.rel='noopener';
    link.textContent=entry[3];
    target.append(entry[2]+' ',link);
  }
  checks.forEach(box=>box.addEventListener('change',()=>showContext(box.checked?box.value:'unmatched')));
  $('setterZone').onchange=()=>showContext($('setterZone').value?'5-1':'unmatched');
  showRules('');
  function drawQueue() {
    $('queue').replaceChildren();
    for (const item of windows) {
      const button = document.createElement('button');
      button.textContent = item.detected+' · '+time(item.start)+' to '+time(item.end);
      button.setAttribute('aria-pressed',String(item===selectedWindow));
      button.onclick=()=>openCandidate(item);
      $('queue').append(button);
    }
  }
  globalThis.reviewTools = {
    kinds,bounds,
    groupedCards(list){
      if(!list.length)return cards([]);
      const groups=new Map();
      for(const p of list){
        const category=p.suggested?p.detected:(p.events?.[0]||kinds(p)[0]||p.action||'Other');
        const title=(p.suggested?'Suggested ':'')+category;
        if(!groups.has(title))groups.set(title,[]);
        groups.get(title).push(p);
      }
      return [...groups].map(([title,items])=>'<h3 class="clip-group">'+esc(title)+' ('+items.length+')</h3>'+cards(items.sort((a,b)=>a.start-b.start))).join('');
    },
    serveControl(p){
      if(p.sample)return '';
      const other=['Point','Error','Pass','Set','Attack','Block','Dig'].map(v=>'<option>'+v+'</option>').join('');
      const options=['','Ace','Serve in play','Serve error'].map(label=>'<option value="'+label+'" '+(p.outcome===label?'selected':'')+'>'+(label||'Classify serve…')+'</option>').join('');
      return '<label>Confirm event<select data-kind="'+esc(p.id)+'"><option value="">Choose event…</option>'+other+'</select></label><label>Serve result<select data-serve="'+esc(p.id)+'">'+options+'</select></label>';
    },
    tags: () => ({events:checks.filter(box=>box.checked).map(box=>box.value),setterZone:$('setterZone').value}),
    resetTags() {
      checks.forEach(box => box.checked=false);
      $('setterZone').value='';
      $('eventReference').replaceChildren();
      selectedWindow=null;
    },
    restoreTags(p) {
      selectedWindow=null;
      checks.forEach(box=>box.checked=kinds(p).includes(box.value));
      $('setterZone').value=p.setterZone||'';
      showContext(p.setterZone?'5-1':kinds(p)[0]||'unmatched');
    },
    matches(p) {
      return (!$('eventFilter').value || kinds(p).includes($('eventFilter').value)) &&
        (!$('zoneFilter').value || String(p.setterZone)===$('zoneFilter').value);
    },
    finishCandidate() {
      windows=windows.filter(item=>item!==selectedWindow);
      selectedWindow=null;
      drawQueue();
    },
    changeSource(id) {
      restoredDetail=false;
      $('quickScan').disabled=true;$('quickScan').textContent='Find volleyball plays';
      $('scan').hidden=true;scanMedia=id;track=[];playerFrames=[];coverage='';paintBall();$('ballReport').textContent='';
      openDB.then(()=>requestTrack(id)).then(result=>{
        if(scanMedia!==id||!result)return;
        if(result.version!==3){$('ballReport').textContent='Select Find volleyball plays to rebuild suggestions from ball flight.';return;}
        restoredDetail=true;$('scan').hidden=false;
        windows=plays.filter(p=>p.mediaId===id && p.suggested);
        drawQueue();
        if(!scanning)$('scanStatus').textContent='Detailed results restored from this device.';
        track=result.points;playerFrames=result.players||[];coverage=result.coverage;$('ballReport').textContent=coverage;paintBall();
      }).catch(()=>{});
      generation++;
      scanning=false;
      windows=[];
      selectedWindow=null;
      drawQueue();
      $('scan').disabled=true;
      $('scan').textContent='Rescan video';
      $('scanStatus').textContent='Loading video…';
    }
  };
  document.addEventListener('change',e=>{
    if(e.target.dataset.kind && e.target.value){
      const p=plays.find(v=>v.id===e.target.dataset.kind);
      if(!p)return;
      const prior=p.suggested?[]:p.events||[];
      p.events=[...new Set([...prior,e.target.value])];p.action=e.target.value;p.suggested=false;
      persist();windows=windows.filter(v=>v.id!==p.id);drawQueue();render();return;
    }
    const id=e.target.dataset.serve;
    if(!id || !e.target.value)return;
    const p=plays.find(item=>item.id===id);if(!p)return;
    p.outcome=e.target.value;p.action='Serve';p.suggested=false;
    p.events=['Serve',p.outcome]; if(p.outcome!=='Serve in play')p.events.push('Point');
    if(p.outcome==='Serve error')p.events.push('Error');
    persist();windows=windows.filter(item=>item.id!==id);drawQueue();render();
  });
  for (const id of ['eventFilter','zoneFilter']) $(id).onchange=render;
  video.addEventListener('loadedmetadata',() => {
    $('scan').disabled=!Number.isFinite(video.duration);
    $('quickScan').disabled=$('scan').disabled;
    windows=plays.filter(p=>p.mediaId===media.id && p.suggested);
    drawQueue();
    if(restoredDetail){
      $('scanStatus').textContent='Saved results restored. Select a clip to review.';return;
    }
    $('scanStatus').textContent=$('scan').disabled?'A finite-duration video is required.':'Ready to analyze '+media.name+'.';
  });
  function waitFor(element,event,action) {
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>finish(Error('Video decoding timed out.')),12000);
      const success=()=>finish();
      const fail=()=>finish(Error('Unable to decode this video.'));
      function finish(error) {
        clearTimeout(timeout);
        element.removeEventListener(event,success);
        element.removeEventListener('error',fail);
        if(error) reject(error); else resolve();
      }
      element.addEventListener(event,success,{once:true});
      element.addEventListener('error',fail,{once:true});
      try { action(); } catch(error) { finish(error); }
    });
  }
  $('quickScan').onclick=()=>{
    if(!media || sample || scanning)return;
    if(restoredDetail){
      windows=plays.filter(p=>p.mediaId===media.id && p.suggested);drawQueue();tab('clips');
      $('scanStatus').textContent='Showing saved volleyball events.';return;
    }
    $('scan').hidden=false;$('scan').click();
  };
  $('scan').onclick=async () => {
    if(scanning) {
      generation++;
      scanning=false;$('quickScan').disabled=false;
      $('scan').textContent='Rescan video';
      $('scanStatus').textContent='Scan canceled.';
      return;
    }
    if(!media || sample) return toast('Load your match footage to analyze it.');
    const started=now();let inferenceMs=0,seekMs=0;
    $('quickScan').disabled=true;
    const token=++generation;
    const decoder=document.createElement('video');
    decoder.muted=true;
    decoder.playsInline=true;
    decoder.preload='auto';
    scanning=true;
    $('scan').textContent='Cancel scan';
    try {
      await waitFor(decoder,'loadeddata',()=>{decoder.src=media.url});
      const duration=decoder.duration;
      if (!Number.isFinite(duration) || duration<=0) throw Error('Video duration is unavailable.');
      const canvas=document.createElement('canvas');
      canvas.width=224; canvas.height=Math.max(48,Math.min(320,Math.round(224*decoder.videoHeight/decoder.videoWidth)));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      $('scanStatus').textContent='Loading volleyball detector…';
      let detector;
      try { detector=await RallyBall.create(); }
      catch(err){throw Error('Could not load the volleyball detector. Check your connection and retry. '+err.message);}
      const step=1/25;
      const seenPlayers=[];
      const estimates=[];
      const observePlayers=PlayerIdentity.createTracker();
      const contactTracks=new Map();

      let previous=null;
      for(let frame=0;frame*step<duration;frame++){
        const at=frame*step;
        if(token!==generation)return;
        if(frame){const began=now();await waitFor(decoder,'seeked',()=>{decoder.currentTime=at;});seekMs+=now()-began;}
        if(token!==generation)return;
        if(frame%3===0){
          ctx.drawImage(decoder,0,0,canvas.width,canvas.height);
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          if(previous){
            observePlayers(pixels,previous,canvas.width,canvas.height,at,null);
            seenPlayers.push({time:at,bodies:observePlayers.visible});
          }
          previous=pixels;
        }
        if(detector.capture(decoder,at)){const began=now();estimates.push(...await detector.flush());inferenceMs+=now()-began;}
        $('scanStatus').textContent='Tracking volleyball · '+Math.floor(at/duration*100)+'%'+(at>2?' · about '+time((now()-started)/1000*(duration-at)/at)+' remaining':'');
      }
      estimates.push(...await detector.flush());
      if(token!==generation)return;

      const flights=[],validPoints=[];
      let sequence=[],segment=0;
      function finish(){
        if(sequence.length>=3){
          flights.push({start:sequence[0].time,end:sequence.at(-1).time});
          for(const p of sequence){p.segment=segment;validPoints.push(p);}
        }
        segment++;sequence=[];
      }
      for(const p of estimates){
        const prior=sequence.at(-1);
        if(prior && (p.time-prior.time>0.081 || Math.hypot(p.x-prior.x,p.y-prior.y)>0.15))finish();
        sequence.push(p);
      }
      finish();
      let pi=0;
      for(const p of validPoints){
        while(pi+1<seenPlayers.length && seenPlayers[pi+1].time<=p.time)pi++;
        const f=seenPlayers[pi];if(!f||p.time<f.time||p.time-f.time>0.13)continue;
        const nearby=f.bodies.map(q=>({id:q.id,d:Math.hypot(q.x-p.x,(q.y-p.y-0.045)*0.8)})).sort((a,b)=>a.d-b.d);
        if(nearby[0]?.d<0.13 && (!nearby[1]||nearby[1].d-nearby[0].d>0.035))contactTracks.set(p.time,nearby[0].id);
      }
      const detected=BallTracking.extract(validPoints,flights).map(event=>({
        ...event,start:Math.max(0,event.at-0.6),end:Math.min(duration,event.at+1.2)
      }));
      const confirmed=plays.filter(p=>p.mediaId===media.id && p.scanKey && !p.suggested);
      const previousByKey=new Map(plays.filter(p=>p.mediaId===media.id && p.suggested).map(p=>[p.scanKey,p]));
      windows=detected.map(event=>{
        const scanKey=event.type+'@'+event.at.toFixed(2);
        const prior=previousByKey.get(scanKey);
        return {id:prior?.id||uid(),mediaId:media.id,mediaName:media.name,player:prior?.player||'Unassigned',position:prior?.position||'Unassigned',rosterId:prior?.rosterId||'',
          gameId:globalThis.keeper?.gameAt(media.id,event.at)||'',eventTime:event.at,start:event.start,end:event.end,detected:event.type,scanKey,suggested:true,action:event.type,
          events:[event.type],outcome:'Unknown',quality:'Unknown',notes:'',points:[]};
      }).filter(p=>!confirmed.some(old=>old.scanKey===p.scanKey));
      for(const clip of windows){
        const prior=previousByKey.get(clip.scanKey);
        if(prior?.identityOverride)clip.identityOverride=true;
        if(prior?.unknownId)keeper.attach(clip,prior.unknownId);
        else if(!prior?.rosterId && !prior?.identityOverride && clip.detected!=='Activity'){
          const trackId=contactTracks.get(clip.eventTime);
          if(trackId)keeper.attachTrack(clip,trackId);
        }
      }
      keeper.saveIdentities();
      plays=plays.filter(p=>p.mediaId!==media.id || !p.suggested ||
        ((p.rosterId || p.identityOverride) && !windows.some(w=>w.id===p.id))).concat(windows);
      restoredDetail=true;track=validPoints;playerFrames=seenPlayers;
      coverage='Estimated ball visible in '+(100*track.length/Math.max(1,Math.ceil(duration/step))).toFixed(0)+'% of sampled frames at 25 samples/sec. Gaps indicate tracking loss. Scan '+seconds(now()-started)+' · seeking '+seconds(seekMs)+' · model inference '+seconds(inferenceMs)+'.';
      $('ballReport').textContent=coverage;
      persist();render();paintBall();selectedWindow=null;drawQueue();
      $('scanStatus').textContent=windows.length ? windows.length+' volleyball play candidates. Review the ball flight and classify the contact.' : 'No qualifying volleyball play found. You can still mark a missed play in Review studio.';
      try{await requestTrack(media.id,{id:media.id,version:3,points:track,players:playerFrames,coverage});}catch{toast('Ball path available for this session only.');}
    } catch(error) {
      if(token===generation) $('scanStatus').textContent=error.message;
    } finally {
      decoder.removeAttribute('src');
      decoder.load();
      if(token===generation) {
        scanning=false;$('quickScan').disabled=false;
        $('scan').textContent='Rescan video';
      }
    }
  };
  render();
})();
