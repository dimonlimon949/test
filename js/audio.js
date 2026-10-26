/* ============ ЗВУКОВОЙ ДВИЖОК (WebAudio, без внешних файлов) ============ */
const Sound = (() => {
  let ctx = null, masterGain = null, musicGain = null, sfxGain = null;
  let enabled = true, musicTimer = null, musicStep = 0, musicOn = false;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain(); masterGain.gain.value = 0.9; masterGain.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.34; musicGain.connect(masterGain);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.6; sfxGain.connect(masterGain);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({freq=440, dur=0.15, type='square', vol=0.4, slideTo=null, delay=0, dest=null}) {
    if (!enabled) return;
    const c = ensure();
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  function noise({dur=0.25, vol=0.4, filterFreq=1200, type='lowpass', delay=0, sweepTo=null}) {
    if (!enabled) return;
    const c = ensure();
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* ---- процедурная фоновая музыка: минималистичный synthwave луп ---- */
  const BASS  = [55, 55, 73.42, 73.42, 65.41, 65.41, 82.41, 82.41]; // A C G E октавы
  const ARP   = [[220,277,330,440],[220,277,330,440],[261,330,392,523],[261,330,392,523],
                 [392,494,587,784],[392,494,587,784],[330,415,494,660],[330,415,494,660]];
  function startMusic() {
    if (musicOn) return; ensure(); musicOn = true; musicStep = 0;
    const stepDur = 0.24;
    musicTimer = setInterval(() => {
      if (!enabled || !musicOn) return;
      const s = musicStep % 16, bar = Math.floor((musicStep/2)) % 8;
      // бас
      if (s % 2 === 0) tone({freq:BASS[bar], dur:0.22, type:'triangle', vol:0.5, dest:musicGain});
      // арпеджио
      const notes = ARP[bar];
      tone({freq:notes[s % 4], dur:0.12, type:'square', vol:0.09, dest:musicGain});
      // хэт
      noise({dur:0.045, vol:0.06, filterFreq:8000, type:'highpass', dest:null});
      if (musicGain) {} // хэт идёт в sfx — приемлемо по громкости
      // бочка
      if (s % 4 === 0) tone({freq:120, slideTo:45, dur:0.14, type:'sine', vol:0.55, dest:musicGain});
      musicStep++;
    }, stepDur * 1000);
  }
  function stopMusic() { musicOn = false; clearInterval(musicTimer); }

  /* ---- единый API звуковых эффектов ---- */
  const fx = {
    click()   { tone({freq:660, dur:0.07, type:'square', vol:0.25}); tone({freq:990, dur:0.06, type:'square', vol:0.18, delay:0.05}); },
    hover()   { tone({freq:440, dur:0.045, type:'sine', vol:0.12}); },
    back()    { tone({freq:420, slideTo:220, dur:0.14, type:'square', vol:0.22}); },
    coin()    { tone({freq:988, dur:0.07, type:'square', vol:0.3}); tone({freq:1319, dur:0.14, type:'square', vol:0.3, delay:0.07}); },
    jump()    { tone({freq:260, slideTo:620, dur:0.16, type:'square', vol:0.22}); },
    shoot()   { tone({freq:820, slideTo:160, dur:0.11, type:'sawtooth', vol:0.22}); noise({dur:0.06, vol:0.12, filterFreq:2600, type:'highpass'}); },
    shotgun() { noise({dur:0.22, vol:0.4, filterFreq:2000, sweepTo:300}); tone({freq:220, slideTo:60, dur:0.2, type:'sawtooth', vol:0.3}); },
    hit()     { noise({dur:0.1, vol:0.3, filterFreq:900}); tone({freq:180, slideTo:60, dur:0.12, type:'square', vol:0.3}); },
    kill()    { tone({freq:320, slideTo:80, dur:0.24, type:'sawtooth', vol:0.3}); noise({dur:0.2, vol:0.25, filterFreq:1400, sweepTo:200}); },
    hurt()    { tone({freq:160, slideTo:70, dur:0.3, type:'square', vol:0.4}); noise({dur:0.18, vol:0.3, filterFreq:600}); },
    pickup()  { tone({freq:523, dur:0.09, type:'sine', vol:0.3}); tone({freq:659, dur:0.09, type:'sine', vol:0.3, delay:0.09}); tone({freq:784, dur:0.16, type:'sine', vol:0.3, delay:0.18}); },
    levelup() { [523,659,784,1047].forEach((f,i)=>tone({freq:f, dur:0.2, type:'square', vol:0.28, delay:i*0.11})); },
    buy()     { tone({freq:740, dur:0.08, type:'triangle', vol:0.3}); tone({freq:1180, dur:0.16, type:'triangle', vol:0.3, delay:0.08}); },
    deny()    { tone({freq:180, dur:0.12, type:'square', vol:0.3}); tone({freq:140, dur:0.18, type:'square', vol:0.3, delay:0.12}); },
    portal()  { for(let i=0;i<6;i++) tone({freq:300+i*140, dur:0.3, type:'sine', vol:0.2, delay:i*0.08}); },
    bossRoar(){ tone({freq:90, slideTo:35, dur:0.9, type:'sawtooth', vol:0.5}); noise({dur:0.8, vol:0.35, filterFreq:400, sweepTo:120}); },
    explosion(){ noise({dur:0.6, vol:0.6, filterFreq:1000, sweepTo:60}); tone({freq:110, slideTo:30, dur:0.55, type:'square', vol:0.45}); },
    win()     { [523,659,784,1047,784,1047,1319].forEach((f,i)=>tone({freq:f, dur:0.22, type:'square', vol:0.3, delay:i*0.14})); },
    lose()    { [392,330,262,196].forEach((f,i)=>tone({freq:f, dur:0.32, type:'sawtooth', vol:0.3, delay:i*0.22})); },
    shootEnemy(){ tone({freq:1200, slideTo:500, dur:0.12, type:'sawtooth', vol:0.14}); },
  };

  function play(name){ if (fx[name]) try { fx[name](); } catch(e){} }
  function setEnabled(v){ enabled = v; if (!v) stopMusic(); }
  function isEnabled(){ return enabled; }

  return { play, startMusic, stopMusic, setEnabled, isEnabled, ensure, fx };
})();
