/* Read-only viewer. No draft/localStorage reads, writes, or upload endpoints. */
(() => {
  const $=id=>document.getElementById(id),timer=new BattleTimer();let alerts=[],ready=false,busy=false;
  const report=text=>$('message').textContent=text, audio=new AlertAudio(report);
  const format=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  function lock(){
    $('start').disabled=!ready||busy||timer.running||timer.elapsed()>=timer.duration;
    $('pause').disabled=!timer.running||busy;$('reset').disabled=busy;
    $('start').textContent=busy?'準備中…':timer.elapsed()>0?'▶ RESUME':'▶ START';
    document.body.classList.toggle('running',timer.running);
    document.querySelectorAll('.preview').forEach(b=>b.disabled=busy||timer.running);
  }
  function update(){
    const elapsed=timer.elapsed();$('elapsed').textContent=format(elapsed/1000);$('progress').style.width=(elapsed/timer.duration*100)+'%';
    document.querySelector('.track').setAttribute('aria-valuenow',Math.floor(elapsed/1000));
    $('state').textContent=!ready?'設定読込待ち':elapsed>=timer.duration?'30分終了':timer.running?'進行中':elapsed>0?'一時停止':'待機中';
    const next=alerts.filter(a=>a.enabled&&!timer.fired.has(a.id)).sort((a,b)=>a.seconds-b.seconds)[0];
    $('next-name').textContent=next?next.name:'次のアラートはありません';$('next-time').textContent=next?format(next.seconds)+' に通知':'';
    $('next-seconds').textContent=next?Math.max(0,Math.ceil(next.seconds-elapsed/1000)):'—';
  }
  function render(){
    $('alerts').replaceChildren();$('enabled-count').textContent=alerts.filter(a=>a.enabled).length+' ON';
    alerts.forEach((a,i)=>{
      const card=document.createElement('article');card.className='alert-card'+(!a.enabled?' off':'')+(timer.fired.has(a.id)?' fired':'');
      const top=document.createElement('div');top.className='row-top';const num=document.createElement('span');num.className='ordinal';num.textContent=`ALERT ${String(i+1).padStart(2,'0')}${timer.fired.has(a.id)?' / 発動済み':''}`;
      const status=document.createElement('span');status.className='badge';status.textContent=a.enabled?'ON':'OFF';top.append(num,status);
      const heading=document.createElement('h3');heading.className='schedule-name';const time=document.createElement('span');time.className='schedule-time';time.textContent=format(a.seconds);heading.append(time,document.createTextNode(a.name));
      const row=document.createElement('div');row.className='audio-row';const name=document.createElement('span');name.className='file-name';name.textContent=a.fileName||'端末の日本語読み上げ';
      const button=document.createElement('button');button.className='preview';button.textContent='▷ 試聴';button.setAttribute('aria-label',a.name+'を試聴');
      button.addEventListener('click',async()=>{if(busy||timer.running)return;busy=true;lock();audio.stop();try{await audio.unlock();await audio.prepare([{...a,enabled:true}]);report(a.name+'を試聴中');audio.enqueue(a);}catch(e){report(e.message);}finally{busy=false;lock();}});
      row.append(name,button);card.append(top,heading,row);$('alerts').append(card);
    });
    if(!alerts.length)$('alerts').textContent='配布アラートはありません。';lock();update();
  }
  function tick(){
    const running=timer.running,due=timer.due(alerts);
    due.forEach(a=>{if(timer.fired.size===due.length)$('history').querySelector('.empty')?.remove();const li=document.createElement('li'),span=document.createElement('span');span.textContent=format(a.seconds);li.append(span,document.createTextNode(a.name));$('history').prepend(li);$('history-count').textContent=timer.fired.size;report(a.name+'：通知を発動しました。');audio.enqueue(a);});
    if(due.length)render();if(running&&!timer.running){lock();report('30分が終了しました。RESETで次の抗争を開始できます。');}update();
  }
  $('start').addEventListener('click',async()=>{if(!ready||busy||timer.running)return;busy=true;lock();audio.stop();try{await audio.unlock();await audio.prepare(alerts);timer.start();report('タイマーを開始しました。');}catch(e){report(e.message);}finally{busy=false;lock();tick();}});
  $('pause').addEventListener('click',()=>{tick();timer.pause();audio.stop();lock();update();report('一時停止しました。RESUMEで続きから再開します。');});
  $('reset').addEventListener('click',()=>{if(busy)return;timer.reset();audio.stop();$('history-count').textContent='0';$('history').innerHTML='<li class="empty">まだ発動したアラートはありません</li>';render();report('タイマーと発動履歴をリセットしました。');});
  document.addEventListener('visibilitychange',tick);window.addEventListener('pagehide',()=>audio.stop());
  window.addEventListener('beforeunload',e=>{if(timer.elapsed()>0||timer.running){e.preventDefault();e.returnValue='';}});
  window.speechSynthesis?.getVoices();render();setInterval(tick,100);
  // Read once per page load. An ongoing battle never changes configuration midway.
  (async()=>{
    try{
      const response=await fetch('shared-config.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const text=await response.text();if(text.length>4*1024*1024)throw new Error('容量超過');
      const data=JSON.parse(text);if(!SharedConfig.valid(data))throw new Error('形式不正');
      alerts=data.alerts;ready=true;$('save-state').textContent='配布版：'+data.revision;render();report('管理者の設定を読み込みました。試聴で音量を確認してからSTARTしてください。');
    }catch{report('配布設定を読み込めません。通信を確認して再読み込みしてください。解決しない場合は管理者に連絡してください。');$('save-state').textContent='設定の読み込みに失敗';lock();}
  })();
})();
