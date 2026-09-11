/* Data only: downloaded configuration is never executed as JavaScript. */
globalThis.SharedConfig = {
  valid(data) {
    return data && data.version===1 && typeof data.revision==='string' && data.revision.length<=100 &&
      Array.isArray(data.alerts) && data.alerts.length<=50 && new Set(data.alerts.map(a=>a?.id)).size===data.alerts.length &&
      data.alerts.every(a=>a && typeof a.id==='string' && a.id.length>0 && a.id.length<100 &&
        Number.isInteger(a.seconds) && a.seconds>=0 && a.seconds<=1800 && typeof a.name==='string' && a.name.trim().length>0 && a.name.length<=80 &&
        typeof a.enabled==='boolean' && typeof a.fileName==='string' && a.fileName.length<=300 && typeof a.speech==='string' && a.speech.length<=500 &&
        typeof a.audio==='string' && (!a.audio || /^data:audio\/(mpeg|mp3);base64,[A-Za-z0-9+/=]+$/.test(a.audio)));
  }
};
