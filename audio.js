(function(root) {
  'use strict';
  class AlertAudio {
    constructor(report) { this.report=report; this.context=null; this.queue=[]; this.busy=false; this.generation=0; this.speechTimer=null; }
    async unlock() {
      const Context=window.AudioContext || window.webkitAudioContext;
      if(Context) { this.context ||= new Context(); await this.context.resume(); }
    }
    async prepare(alerts) {
      this.buffers=new Map();
      for(const a of alerts.filter(a=>a.enabled && a.audio)) {
        if(!this.context) throw new Error('このブラウザはMP3再生に対応していません');
        try { const bytes=Uint8Array.from(atob(a.audio.split(',')[1]),c=>c.charCodeAt(0)); this.buffers.set(a.audio,await this.context.decodeAudioData(bytes.buffer)); }
        catch { throw new Error(a.name+'：MP3を読み込めません。ファイルを選び直してください。'); }
      }
    }
    enqueue(a) { this.queue.push(a); this.drain(); }
    drain() {
      if(this.busy || !this.queue.length) return;
      const a=this.queue.shift(), generation=this.generation; this.busy=true;
      const done=()=>{ if(generation!==this.generation) return; clearTimeout(this.speechTimer); this.busy=false; this.source=null; this.drain(); };
      if(a.audio) {
        const buffer=this.buffers?.get(a.audio);
        if(!buffer || this.context.state!=='running') { this.report(a.name+'：音声を再生できませんでした。PAUSE後に再開し、音声を確認してください。'); done(); return; }
        this.source=this.context.createBufferSource(); this.source.buffer=buffer; this.source.connect(this.context.destination); this.source.onended=done; this.source.start();
      } else {
        const voice=window.speechSynthesis?.getVoices().find(v=>v.lang.startsWith('ja') && v.localService);
        if(!voice) { this.report(a.name+'：端末の日本語音声がありません。MP3を設定してください。'); done(); return; }
        const utterance=new SpeechSynthesisUtterance(a.speech || a.name); utterance.voice=voice; utterance.lang='ja-JP';
        utterance.onend=done; utterance.onerror=()=>{if(generation===this.generation) this.report(a.name+'：読み上げに失敗しました。MP3を設定してください。');done();};
        this.speechTimer=setTimeout(()=>{if(generation===this.generation){window.speechSynthesis.cancel();this.report('読み上げが完了しませんでした。MP3の設定をお試しください。');done();}},30000);
        window.speechSynthesis.speak(utterance);
      }
    }
    stop() { this.generation++; this.queue=[]; this.busy=false; clearTimeout(this.speechTimer); if(this.source){try{this.source.stop();}catch{} this.source=null;} window.speechSynthesis?.cancel(); }
  }
  root.AlertAudio=AlertAudio;
})(globalThis);
