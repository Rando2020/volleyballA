'use strict';
(() => {
  let generation = 0;
  let scanning = false;
  let windows = [];
  let selectedWindow = null;
  const checks = [...document.querySelectorAll('#eventKinds input')];
  function kinds(play) {
    if (play.events?.length) return play.events;
    const labels = [];
    if (['Kill','Ace','Block point','Blocked for point','Setter fault','Attack error','Serve error','Reception error'].includes(play.outcome)) labels.push('Point');
    if (['Setter fault','Attack error','Serve error','Reception error'].includes(play.outcome)) labels.push('Error');
    if (play.action === 'Serve receive' || ['In-system pass','Playable pass','Overpass','Reception error'].includes(play.outcome)) labels.push('Pass');
    return labels;
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
      button.textContent = time(item.start)+' to '+time(item.end);
      button.setAttribute('aria-pressed',String(item===selectedWindow));
      button.onclick = () => {
        tab('review');
        resetForm();
        selectedWindow = item;
        $('start').value = item.start;
        $('end').value = item.end;
        video.currentTime = item.start;
        clipEnd = item.end;
        play();
        drawQueue();
        $('stage').scrollIntoView({block:'center'});
      };
      $('queue').append(button);
    }
  }
  globalThis.reviewTools = {
    kinds,
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
    changeSource() {
      generation++;
      scanning=false;
      windows=[];
      selectedWindow=null;
      drawQueue();
      $('scan').disabled=true;
      $('scan').textContent='Analyze video';
      $('scanStatus').textContent='Loading video…';
    }
  };
  for (const id of ['eventFilter','zoneFilter']) $(id).onchange=render;
  video.addEventListener('loadedmetadata',() => {
    $('scan').disabled=!Number.isFinite(video.duration);
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
  $('scan').onclick=async () => {
    if(scanning) {
      generation++;
      scanning=false;
      $('scan').textContent='Analyze video';
      $('scanStatus').textContent='Scan canceled.';
      return;
    }
    if(!media || sample) return toast('Load your match footage to analyze it.');
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
      canvas.width=96; canvas.height=54;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const step=Math.max(0.5,duration/1800);
      const samples=[];
      let previous=null;
      for(let at=0;at<duration;at+=step) {
        if(token!==generation) return;
        if(at>0) await waitFor(decoder,'seeked',()=>{decoder.currentTime=at});
        if(token!==generation) return;
        ctx.drawImage(decoder,0,0,96,54);
        const pixels=ctx.getImageData(0,0,96,54).data;
        if(previous) {
          let changed=0;
          for(let i=0;i<pixels.length;i+=4) {
            const delta=Math.abs(pixels[i]-previous[i])+Math.abs(pixels[i+1]-previous[i+1])+Math.abs(pixels[i+2]-previous[i+2]);
            if(delta>90) changed++;
          }
          samples.push({at,motion:changed/(96*54)});
        }
        previous=pixels;
        $('scanStatus').textContent='Analyzing '+Math.floor(at/duration*100)+'%';
      }
      if(token!==generation) return;
      windows=FilmAnalysis.segments(samples,step,duration);
      selectedWindow=null;
      drawQueue();
      $('scanStatus').textContent=windows.length?windows.length+' suggested clips. Select one to play, adjust its bounds, and confirm events.':'No clear motion sequences found. You can still mark clips in Review studio.';
    } catch(error) {
      if(token===generation) $('scanStatus').textContent=error.message;
    } finally {
      decoder.removeAttribute('src');
      decoder.load();
      if(token===generation) {
        scanning=false;
        $('scan').textContent='Analyze video';
      }
    }
  };
  render();
})();
