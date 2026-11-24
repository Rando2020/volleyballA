'use strict';
(() => {
  let book;
  try { book=JSON.parse(localStorage.getItem('courtsense-book')); } catch {}
  book ||= {games:[],roster:[],marks:{},channel:''};
  let sourceId=null;
  function storeBook(){
    try {localStorage.setItem('courtsense-book',JSON.stringify(book));}
    catch {toast('Device storage is full. Keep this tab open.');}
  }
  function youtube(value){
    if(!value.trim()) return '';
    const url=new URL(value);
    if(url.protocol!=='https:' || !['www.youtube.com','youtube.com','m.youtube.com','youtu.be'].includes(url.hostname))throw Error('Enter an HTTPS YouTube link.');
    return url.href;
  }
  const gameLabel=g=>g.stage+' · Game '+g.number+' · '+g.name;
  const link=(url,label)=>'<a target="_blank" rel="noopener" href="'+esc(url)+'">'+esc(label)+'</a>';
  function gameAt(id,t){
    const marks=book.marks[id]||[];
    return marks.filter(m=>m.at<=t).at(-1)?.gameId||'';
  }
  function options(list,selected,label){
    return '<option value="">'+label+'</option>'+list.map(([id,name])=>'<option value="'+esc(id)+'" '+(id===selected?'selected':'')+'>'+esc(name)+'</option>').join('');
  }
  function drawBook(){
    const games=book.games.map(g=>[g.id,gameLabel(g)]);
    for(const id of ['activeGame','statsGame','libraryGame'])$(id).innerHTML=options(games,$(id).value,id==='activeGame'?'Choose game':'All games');
    $('gameList').innerHTML=book.games.map(g=>'<p>'+esc(gameLabel(g))+' '+(g.url?link(g.url,'Watch on YouTube'):'')+'</p>').join('');
    $('channelLink').value=book.channel;
    $('channelOpen').innerHTML=book.channel?link(book.channel,'Open channel'):'';
    $('boundaries').textContent=(book.marks[sourceId]||[]).map(m=>time(m.at)+' '+gameLabel(book.games.find(g=>g.id===m.gameId))).join(' / ');
    $('rosterList').textContent=book.roster.map(p=>p.name+' ('+p.role+')').join(', ');
  }
  $('rosterRole').innerHTML=$('position').innerHTML;
  $('rosterForm').onsubmit=e=>{
    e.preventDefault();
    const name=$('rosterName').value.trim();
    if(!name)return;
    if(book.roster.some(p=>p.name.toLowerCase()===name.toLowerCase()))return toast('That player already exists.');
    book.roster.push({id:uid(),name,role:$('rosterRole').value});
    storeBook();drawBook();render();$('rosterName').value='';
  };
  $('gameForm').onsubmit=e=>{
    e.preventDefault();
    try {
      const name=$('gameName').value.trim();
      if(!name)return;
      const g={id:uid(),name,number:Number($('gameNumber').value),stage:$('gameStage').value,url:youtube($('gameLink').value)};
      book.games.push(g);storeBook();drawBook();render();$('activeGame').value=g.id;
      $('gameNumber').value=g.number+1;$('gameName').value='';$('gameLink').value='';
    } catch(error){toast(error.message);}
  };
  $('channelSave').onclick=()=>{
    try{book.channel=youtube($('channelLink').value);storeBook();drawBook();}
    catch(error){toast(error.message);}
  };
  $('markGame').onclick=()=>{
    const gameId=$('activeGame').value;
    if(!media||!gameId||sample)return toast('Load footage and select a game.');
    const at=Number(video.currentTime.toFixed(2));
    const marks=(book.marks[media.id]||[]).filter(m=>m.at!==at);
    marks.push({at,gameId});book.marks[media.id]=marks.sort((a,b)=>a.at-b.at);
    for(const p of plays)if(p.mediaId===media.id)p.gameId=gameAt(media.id,p.eventTime??p.start);
    storeBook();persist();drawBook();render();
  };
  $('libraryGame').onchange=render;$('statsGame').onchange=render;
  function card(p){
    if(p.sample)return '';
    const game=book.games.find(g=>g.id===p.gameId);
    return (game?'<p>'+esc(gameLabel(game))+'</p>':'')+'<label>Who made this contact?<select data-person="'+esc(p.id)+'">'+options(book.roster.map(v=>[v.id,v.name]),p.rosterId,'Choose player')+'<option value="new">Add a player…</option></select></label>';
  }
  document.addEventListener('change',e=>{
    const id=e.target.dataset.person;
    if(!id)return;
    const p=plays.find(v=>v.id===id);
    if(!p)return;
    let person=book.roster.find(v=>v.id===e.target.value);
    if(e.target.value==='new'){
      const name=prompt('Who made this contact? Enter a name or jersey number.')?.trim().slice(0,50);
      if(!name){render();return;}
      person=book.roster.find(v=>v.name.toLowerCase()===name.toLowerCase());
      if(!person){person={id:uid(),name,role:'Unassigned'};book.roster.push(person);storeBook();drawBook();}
    }
    p.rosterId=person?.id||'';p.player=person?.name||'Unassigned';p.position=person?.role||'Unassigned';
    persist();render();
  });
  const statsMatch=p=>!$('statsGame').value||p.gameId===$('statsGame').value;
  function stats(){
    const rows=new Map();
    for(const p of plays.filter(statsMatch)){
      if(p.suggested||!p.player||p.player==='Unassigned')continue;
      const row=rows.get(p.player)||{contacts:0,aces:0,inPlay:0,errors:0,passes:0};
      row.contacts++;row.aces+=Number(p.outcome==='Ace');row.inPlay+=Number(p.outcome==='Serve in play');row.errors+=Number(p.outcome==='Serve error');row.passes+=Number(reviewTools.kinds(p).includes('Pass'));
      rows.set(p.player,row);
    }
    $('keeperStats').innerHTML=rows.size?'<table><thead><tr><th>Player</th><th>Clips</th><th>Aces</th><th>Serves in play</th><th>Serve errors</th><th>Pass clips</th></tr></thead><tbody>'+[...rows].map(([name,r])=>'<tr><th>'+esc(name)+'</th>'+Object.values(r).map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'<p>Confirm a contact and assign a player to see individual totals.</p>';
  }
  globalThis.keeper={exportBook:()=>book,gameAt,card,stats,statsMatch,source(id){sourceId=id;drawBook();},matches:p=>!$('libraryGame').value||p.gameId===$('libraryGame').value};
  drawBook();render();
})();
