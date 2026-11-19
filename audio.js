/* Original procedural Web Audio API soundtrack and SFX engine for 立ち退きません！ */
const WakeariAudio = (() => {
  'use strict';

  const PREFS_KEY = 'wakeari-audio-prefs-v1';
  const defaultPrefs = { bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.55, sfxVolume: 0.75 };
  let prefs = { ...defaultPrefs };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      prefs.bgmEnabled = raw.bgmEnabled !== false;
      prefs.sfxEnabled = raw.sfxEnabled !== false;
      if (Number.isFinite(raw.bgmVolume)) prefs.bgmVolume = Math.max(0, Math.min(1, raw.bgmVolume));
      if (Number.isFinite(raw.sfxVolume)) prefs.sfxVolume = Math.max(0, Math.min(1, raw.sfxVolume));
    }
  } catch {}

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }

  let ctx = null;
  let masterComp = null;
  let bgmGain = null;
  let bgmDuck = null;
  let bgmWarmth = null;
  let sfxGain = null;
  let sfxComp = null;
  let noiseBuffer = null;

  let unlocked = false;
  let currentScene = 'none'; // 'title' | 'build' | 'battle' | 'win' | 'lose' | 'none'
  let battlePaused = false;

  let schedulerId = null;
  let nextNoteTime = 0;
  let currentStep = 0;
  let activeJingleNodes = [];
  let activeSfxCount = 0;
  const MAX_SFX_VOICES = 10;
  const sfxCooldowns = new Map();

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function createNoiseBuffer(audioCtx) {
    const len = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();

    masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.value = -16;
    masterComp.knee.value = 18;
    masterComp.ratio.value = 4;
    masterComp.attack.value = 0.005;
    masterComp.release.value = 0.16;
    masterComp.connect(ctx.destination);

    bgmWarmth = ctx.createBiquadFilter();
    bgmWarmth.type = 'lowpass';
    bgmWarmth.frequency.value = 3400;
    bgmWarmth.Q.value = 0.6;

    bgmDuck = ctx.createGain();
    bgmDuck.gain.value = battlePaused ? 0.42 : 1.0;

    bgmGain = ctx.createGain();
    bgmGain.gain.value = prefs.bgmEnabled ? prefs.bgmVolume * 0.48 : 0;

    bgmDuck.connect(bgmWarmth);
    bgmWarmth.connect(bgmGain);
    bgmGain.connect(masterComp);

    sfxComp = ctx.createDynamicsCompressor();
    sfxComp.threshold.value = -14;
    sfxComp.knee.value = 12;
    sfxComp.ratio.value = 6;
    sfxComp.attack.value = 0.002;
    sfxComp.release.value = 0.08;
    sfxComp.connect(masterComp);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = prefs.sfxEnabled ? prefs.sfxVolume * 0.68 : 0;
    sfxGain.connect(sfxComp);

    noiseBuffer = createNoiseBuffer(ctx);
    return ctx;
  }

  function applyVolumes() {
    if (!ctx || !bgmGain || !sfxGain || !bgmDuck) return;
    const now = ctx.currentTime;
    const targetBgm = prefs.bgmEnabled ? prefs.bgmVolume * 0.48 : 0;
    const targetSfx = prefs.sfxEnabled ? prefs.sfxVolume * 0.68 : 0;
    const targetDuck = currentScene === 'battle' && battlePaused ? 0.42 : 1.0;
    bgmGain.gain.setTargetAtTime(targetBgm, now, 0.04);
    sfxGain.gain.setTargetAtTime(targetSfx, now, 0.03);
    bgmDuck.gain.setTargetAtTime(targetDuck, now, 0.08);
  }

  function unlock() {
    const c = ensureContext();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().then(() => {
        unlocked = true;
        applyVolumes();
        if (isLoopScene(currentScene) && !schedulerId) startScheduler();
        else if ((currentScene === 'win' || currentScene === 'lose') && !activeJingleNodes.length) {
          // Do not auto-fire old jingles late after unlock if already past
        }
      }).catch(() => {});
    } else {
      unlocked = true;
      applyVolumes();
      if (isLoopScene(currentScene) && !schedulerId) startScheduler();
    }
  }

  function setupAutoplayUnlock() {
    const handler = () => {
      unlock();
      if (ctx && ctx.state === 'running') {
        window.removeEventListener('pointerdown', handler, true);
        window.removeEventListener('keydown', handler, true);
        window.removeEventListener('touchstart', handler, true);
        window.removeEventListener('click', handler, true);
      }
    };
    window.addEventListener('pointerdown', handler, { capture: true, passive: true });
    window.addEventListener('keydown', handler, { capture: true, passive: true });
    window.addEventListener('touchstart', handler, { capture: true, passive: true });
    window.addEventListener('click', handler, { capture: true, passive: true });

    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) {
        if (ctx.state === 'running') ctx.suspend().catch(() => {});
      } else if (unlocked) {
        ctx.resume().then(() => {
          if (ctx) nextNoteTime = ctx.currentTime + 0.06;
        }).catch(() => {});
      }
    });
  }

  const isLoopScene = (sc) => sc === 'title' || sc === 'build' || sc === 'battle';

  // --- Warm Instrument Synthesizers (for BGM & Jingles) ---
  function playPizz(time, midi, dur, vol = 0.16) {
    if (!ctx || !bgmDuck) return;
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq * 0.5, time);

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(Math.min(1800, freq * 4.5), time);
    filt.frequency.exponentialRampToValueAtTime(Math.max(140, freq * 1.4), time + Math.min(dur, 0.22));

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.12, dur));

    osc.connect(filt);
    sub.connect(filt);
    filt.connect(g);
    g.connect(bgmDuck);

    osc.start(time);
    sub.start(time);
    const stopAt = time + Math.max(0.14, dur) + 0.03;
    osc.stop(stopAt);
    sub.stop(stopAt);
  }

  function playMarimba(time, midi, dur, vol = 0.13) {
    if (!ctx || !bgmDuck) return;
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    const over = ctx.createOscillator();
    const overGain = ctx.createGain();
    const g = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    over.type = 'sine';
    over.frequency.setValueAtTime(freq * 2, time);
    overGain.gain.setValueAtTime(0.14, time);
    overGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.16, dur));

    osc.connect(g);
    over.connect(overGain);
    overGain.connect(g);
    g.connect(bgmDuck);

    osc.start(time);
    over.start(time);
    const stopAt = time + Math.max(0.18, dur) + 0.03;
    osc.stop(stopAt);
    over.stop(stopAt);
  }

  function playCelesta(time, midi, dur, vol = 0.1) {
    if (!ctx || !bgmDuck) return;
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    const g = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    bell.type = 'triangle';
    bell.frequency.setValueAtTime(freq * 3, time);
    bellGain.gain.setValueAtTime(0.055, time);
    bellGain.gain.exponentialRampToValueAtTime(0.0005, time + 0.12);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.25, dur));

    osc.connect(g);
    bell.connect(bellGain);
    bellGain.connect(g);
    g.connect(bgmDuck);

    osc.start(time);
    bell.start(time);
    const stopAt = time + Math.max(0.27, dur) + 0.03;
    osc.stop(stopAt);
    bell.stop(stopAt);
  }

  function playReed(time, midi, dur, vol = 0.095, bendToMidi = null) {
    if (!ctx || !bgmDuck) return;
    const freq = midiToFreq(midi);
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = 'triangle';
    sub.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    sub.frequency.setValueAtTime(freq, time);
    if (bendToMidi != null) {
      const target = midiToFreq(bendToMidi);
      osc.frequency.linearRampToValueAtTime(target, time + dur * 0.85);
      sub.frequency.linearRampToValueAtTime(target, time + dur * 0.85);
    }

    const subMix = ctx.createGain();
    subMix.gain.value = 0.28;

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1450, time);
    filt.Q.value = 1.2;

    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.018);
    g.gain.setValueAtTime(vol * 0.85, time + Math.max(0.03, dur * 0.68));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filt);
    sub.connect(subMix);
    subMix.connect(filt);
    filt.connect(g);
    g.connect(bgmDuck);

    osc.start(time);
    sub.start(time);
    const stopAt = time + dur + 0.04;
    osc.stop(stopAt);
    sub.stop(stopAt);
  }

  function playPadChord(time, midis, dur, vol = 0.042) {
    if (!ctx || !bgmDuck) return;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1150, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + Math.min(0.18, dur * 0.25));
    g.gain.setValueAtTime(vol * 0.82, time + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    filt.connect(g);
    g.connect(bgmDuck);

    for (const m of midis) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(midiToFreq(m), time);
      osc.connect(filt);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }
  }

  function playKick(time, vol = 0.14) {
    if (!ctx || !bgmDuck) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(124, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.085);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
    osc.connect(g);
    g.connect(bgmDuck);
    osc.start(time);
    osc.stop(time + 0.17);
  }

  function playWoodblock(time, pitch = 740, vol = 0.055) {
    if (!ctx || !bgmDuck) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, time);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.86, time + 0.045);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.065);
    osc.connect(g);
    g.connect(bgmDuck);
    osc.start(time);
    osc.stop(time + 0.08);
  }

  function playHat(time, vol = 0.032) {
    if (!ctx || !bgmDuck || !noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(5200, time);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.038);
    src.connect(hp);
    hp.connect(g);
    g.connect(bgmDuck);
    src.start(time);
    src.stop(time + 0.05);
  }

  function playBrushSnare(time, vol = 0.05) {
    if (!ctx || !bgmDuck || !noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1950, time);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.075);
    src.connect(bp);
    bp.connect(g);
    g.connect(bgmDuck);
    src.start(time);
    src.stop(time + 0.09);
  }

  // --- Original Compositional Scores (128 sixteenth-note steps = 8 bars) ---
  // Note: MIDI numbers (60 = C4, 62 = D4, 65 = F4, 69 = A4)
  const SCORES = {
    // 1. Title: Mysterious, sneaky, comical underground apartment theme (D minor, 102 BPM)
    title: {
      bpm: 102,
      steps: 128,
      step(s, t, sd) {
        const bar = Math.floor(s / 16);
        const st = s % 16;

        // Warm low pad chord on downbeat of each bar
        const chords = [
          [50, 53, 57], // Dm
          [50, 53, 57], // Dm
          [46, 50, 55], // Gm/Bb
          [45, 52, 55, 57], // A7
          [50, 53, 57], // Dm
          [46, 50, 53], // Bb
          [43, 50, 55], // Gm
          [45, 49, 55]  // A7
        ];
        if (st === 0) playPadChord(t, chords[bar], sd * 14.5, 0.036);

        // Sneaky pizzicato bass (tiptoe bounce)
        const bassBars = [
          { 0: 38, 4: 45, 8: 41, 12: 45, 14: 49 },
          { 0: 38, 4: 45, 8: 41, 12: 45, 14: 40 },
          { 0: 43, 4: 50, 8: 46, 12: 45 },
          { 0: 45, 4: 52, 8: 49, 12: 52, 14: 45 },
          { 0: 38, 4: 45, 8: 41, 12: 45 },
          { 0: 46, 4: 53, 8: 50, 12: 48 },
          { 0: 43, 4: 46, 8: 52, 12: 43 },
          { 0: 45, 4: 49, 8: 52, 12: 45 }
        ];
        if (bassBars[bar][st] != null) playPizz(t, bassBars[bar][st], sd * 3.1, 0.17);

        // Playful celesta + marimba quirky motif
        const leadBars = [
          { 0: [69, 2], 3: [70, 1], 4: [69, 2], 6: [68, 2], 8: [69, 3], 12: [65, 3] },
          { 0: [62, 2], 4: [65, 2], 8: [69, 2], 10: [67, 2], 12: [65, 2], 14: [64, 2] },
          { 0: [67, 2], 3: [69, 1], 4: [70, 2], 8: [69, 2], 10: [67, 2], 12: [62, 3] },
          { 0: [64, 2], 2: [65, 2], 4: [67, 2], 6: [64, 2], 8: [61, 3], 12: [69, 3] },
          { 0: [69, 2], 4: [72, 2], 6: [70, 2], 8: [69, 2], 10: [67, 2], 12: [65, 3] },
          { 0: [74, 2], 4: [72, 2], 6: [70, 2], 8: [69, 2], 10: [67, 2], 12: [65, 3] },
          { 0: [67, 2], 3: [64, 2], 6: [65, 2], 9: [62, 2], 12: [64, 2], 14: [61, 2] },
          { 0: [62, 5], 8: [81, 1.5], 10: [77, 1.5], 12: [74, 2.5] }
        ];
        const n = leadBars[bar][st];
        if (n) {
          if (bar === 7 && st >= 8) playCelesta(t, n[0], sd * n[1] * 1.6, 0.085);
          else {
            playMarimba(t, n[0], sd * n[1] * 1.4, 0.125);
            if (st === 0 || st === 8) playCelesta(t, n[0] + 12, sd * 2.2, 0.045);
          }
        }

        // Quirky light woodblock ticks
        if (st === 4 || st === 12) playWoodblock(t, st === 4 ? 720 : 860, 0.036);
        if (bar % 2 === 1 && st === 14) playHat(t, 0.02);
      }
    },

    // 2. Build: Cozy, calm, gentle underground renovation loop (F major / D minor, 88 BPM)
    build: {
      bpm: 88,
      steps: 128,
      step(s, t, sd) {
        const bar = Math.floor(s / 16);
        const st = s % 16;

        const chords = [
          [53, 57, 60, 64], // Fmaj7
          [50, 53, 57, 60], // Dm7
          [46, 50, 53, 57], // Bbmaj7
          [48, 52, 55, 57], // C6
          [45, 48, 52, 55], // Am7
          [50, 53, 57, 60], // Dm7
          [43, 46, 50, 53], // Gm7
          [48, 52, 55, 58]  // C7
        ];
        if (st === 0) playPadChord(t, chords[bar], sd * 15.2, 0.044);

        const roots = [41, 38, 34, 36, 33, 38, 43, 36];
        const fifths = [48, 45, 41, 43, 40, 45, 50, 43];
        if (st === 0) playPizz(t, roots[bar], sd * 5.0, 0.13);
        if (st === 8) playPizz(t, fifths[bar], sd * 4.0, 0.105);

        // Relaxed marimba + celesta melody with plenty of breathing space
        const leadBars = [
          { 0: [65, 3], 4: [69, 3], 8: [72, 4], 14: [76, 2] },
          { 0: [74, 4], 6: [72, 2], 8: [69, 4], 12: [65, 3] },
          { 0: [67, 3], 4: [69, 3], 8: [70, 3], 12: [69, 3] },
          { 0: [67, 6], 10: [64, 2], 12: [67, 3] },
          { 0: [72, 3], 4: [76, 3], 8: [74, 3], 12: [72, 3] },
          { 0: [69, 4], 6: [67, 2], 8: [65, 4], 12: [62, 3] },
          { 0: [65, 3], 4: [67, 3], 8: [70, 3], 12: [69, 3] },
          { 0: [67, 5], 8: [72, 2], 10: [70, 2], 12: [67, 3] }
        ];
        const n = leadBars[bar][st];
        if (n) {
          playMarimba(t, n[0], sd * n[1] * 1.5, 0.11);
          if (st === 8 && bar % 2 === 0) playCelesta(t, n[0] + 12, sd * 3.0, 0.042);
        }

        // Gentle brushed timekeeping
        if (st === 4 || st === 12) playWoodblock(t, st === 4 ? 620 : 700, 0.028);
        if (st === 2 || st === 6 || st === 10 || st === 14) playHat(t, 0.016);
      }
    },

    // 3. Battle: Tense yet brisk, playful comical defense theme (A minor, 132 BPM)
    battle: {
      bpm: 132,
      steps: 128,
      step(s, t, sd) {
        const bar = Math.floor(s / 16);
        const st = s % 16;

        // Driving bouncy bassline
        const bassSeqs = [
          [45, 57, 52, 57, 45, 57, 55, 52], // Am
          [45, 57, 52, 57, 45, 57, 52, 48], // Am
          [41, 53, 48, 53, 41, 53, 52, 48], // F
          [40, 52, 47, 52, 44, 52, 47, 50], // E7
          [45, 57, 52, 57, 48, 60, 55, 52], // Am -> C
          [50, 62, 57, 62, 45, 57, 53, 50], // Dm
          [47, 53, 50, 53, 40, 52, 47, 44], // Bdim -> E7
          [45, 52, 57, 52, 45, 55, 52, 45]  // Am turnaround
        ];
        if (st % 2 === 0) {
          playPizz(t, bassSeqs[bar][st / 2], sd * 1.7, st % 4 === 0 ? 0.165 : 0.12);
        }

        // Light energetic percussion
        if (st === 0 || st === 8) playKick(t, 0.13);
        if (st === 4 || st === 12) playBrushSnare(t, 0.055);
        if (st % 4 === 2) playHat(t, 0.032);
        if (bar % 4 === 3 && (st === 10 || st === 14)) playWoodblock(t, st === 10 ? 780 : 940, 0.055);

        // Subtle chord stab on beat 1 & 3
        const chords = [
          [57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 56, 59],
          [57, 60, 64], [50, 53, 57], [50, 53, 59], [57, 60, 64]
        ];
        if (st === 0) playPadChord(t, chords[bar], sd * 6, 0.03);

        // Cheeky mischievous reed + marimba lead
        const leadBars = [
          { 0: [69, 2], 2: [72, 2], 4: [76, 2], 6: [75, 2], 8: [76, 2], 10: [72, 2], 12: [69, 3] },
          { 0: [71, 2], 2: [72, 2], 4: [74, 2], 6: [72, 2], 8: [71, 2], 10: [69, 2], 12: [64, 3] },
          { 0: [65, 2], 2: [69, 2], 4: [72, 2], 6: [71, 2], 8: [72, 2], 10: [69, 2], 12: [65, 3] },
          { 0: [64, 2], 2: [68, 2], 4: [71, 2], 6: [74, 2], 8: [76, 3], 12: [71, 3] },
          { 0: [69, 2], 2: [72, 2], 4: [76, 2], 6: [79, 2], 8: [76, 2], 10: [74, 2], 12: [72, 3] },
          { 0: [74, 2], 2: [77, 2], 4: [76, 2], 6: [74, 2], 8: [72, 2], 10: [69, 2], 12: [65, 3] },
          { 0: [71, 2], 2: [69, 2], 4: [68, 2], 6: [69, 2], 8: [71, 2], 10: [74, 2], 12: [76, 3] },
          { 0: [81, 2], 2: [79, 2], 4: [76, 2], 6: [74, 2], 8: [72, 2], 10: [71, 2], 12: [69, 3] }
        ];
        const n = leadBars[bar][st];
        if (n) {
          playReed(t, n[0], sd * n[1] * 1.25, 0.085);
          if (st % 4 === 0) playMarimba(t, n[0], sd * 2.0, 0.08);
        }
      }
    }
  };

  function clearScheduler() {
    if (schedulerId != null) {
      clearInterval(schedulerId);
      schedulerId = null;
    }
  }

  function startScheduler() {
    clearScheduler();
    if (!ctx || ctx.state !== 'running') return;
    const score = SCORES[currentScene];
    if (!score) return;

    currentStep = 0;
    nextNoteTime = ctx.currentTime + 0.05;
    const stepDur = 60 / score.bpm / 4;

    schedulerId = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const sc = SCORES[currentScene];
      if (!sc) { clearScheduler(); return; }
      const sd = 60 / sc.bpm / 4;
      const horizon = ctx.currentTime + 0.16;
      while (nextNoteTime < horizon) {
        sc.step(currentStep % sc.steps, nextNoteTime, sd);
        currentStep = (currentStep + 1) % sc.steps;
        nextNoteTime += sd;
      }
    }, 35);
  }

  function playJingle(kind) {
    clearScheduler();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.04;
    if (kind === 'win') {
      // Bright celebratory comical victory fanfare
      playPadChord(t, [60, 64, 67], 0.45, 0.06);
      playMarimba(t, 72, 0.22, 0.16);
      playReed(t, 72, 0.14, 0.11);
      playMarimba(t + 0.11, 76, 0.22, 0.16);
      playReed(t + 0.11, 76, 0.14, 0.11);
      playMarimba(t + 0.22, 79, 0.24, 0.17);
      playReed(t + 0.22, 79, 0.16, 0.11);
      playCelesta(t + 0.34, 84, 0.45, 0.13);
      playMarimba(t + 0.34, 84, 0.36, 0.17);
      playPizz(t + 0.34, 48, 0.3, 0.18);

      playMarimba(t + 0.58, 79, 0.16, 0.14);
      playMarimba(t + 0.70, 81, 0.16, 0.14);
      playMarimba(t + 0.82, 83, 0.16, 0.14);
      playPadChord(t + 0.94, [60, 64, 67, 71], 1.5, 0.075);
      playReed(t + 0.94, 84, 0.95, 0.12);
      playCelesta(t + 0.94, 84, 1.4, 0.14);
      playCelesta(t + 1.06, 88, 1.2, 0.09);
      playCelesta(t + 1.18, 91, 1.1, 0.08);
      playPizz(t + 0.94, 48, 0.6, 0.18);
    } else if (kind === 'lose') {
      // Short comical descending cartoon sigh
      playPadChord(t, [57, 60, 64], 0.45, 0.05);
      playReed(t, 67, 0.28, 0.11);
      playPizz(t, 45, 0.26, 0.14);

      playReed(t + 0.30, 66, 0.28, 0.11);
      playPizz(t + 0.30, 44, 0.26, 0.14);

      playReed(t + 0.60, 65, 0.28, 0.11);
      playPizz(t + 0.60, 43, 0.26, 0.14);

      playReed(t + 0.92, 64, 0.88, 0.115, 61);
      playPadChord(t + 0.92, [50, 56, 61], 0.95, 0.05);
      playPizz(t + 0.92, 42, 0.4, 0.15);
      playMarimba(t + 1.48, 57, 0.22, 0.10);
      playPizz(t + 1.56, 38, 0.35, 0.16);
    }
  }

  function setScene(scene) {
    if (scene === currentScene && isLoopScene(scene) && schedulerId != null) return;
    currentScene = scene;
    if (scene !== 'battle') battlePaused = false;
    applyVolumes();

    if (isLoopScene(scene)) {
      if (ctx && ctx.state === 'running') startScheduler();
    } else if (scene === 'win' || scene === 'lose') {
      clearScheduler();
      if (ctx && ctx.state === 'running') playJingle(scene);
    } else {
      clearScheduler();
    }
  }

  function setPaused(paused) {
    battlePaused = !!paused;
    applyVolumes();
  }

  // --- Sound Effects (SFX) with Polyphony & Cooldown Protection ---
  function canPlaySfx(name, cooldownMs) {
    if (!prefs.sfxEnabled || prefs.sfxVolume <= 0.005) return false;
    if (activeSfxCount >= MAX_SFX_VOICES) return false;
    const now = performance.now();
    const last = sfxCooldowns.get(name) || 0;
    if (now - last < cooldownMs) return false;
    sfxCooldowns.set(name, now);
    return true;
  }

  function tone({ type = 'triangle', f1 = 440, f2 = null, dur = 0.12, attack = 0.006, vol = 0.2, delay = 0, cutoff = 2800 }) {
    if (!ctx || !sfxGain) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, f1), t);
    if (f2 != null && f2 !== f1) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
    }

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cutoff, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(filt);
    filt.connect(g);
    g.connect(sfxGain);

    activeSfxCount++;
    osc.onended = () => { activeSfxCount = Math.max(0, activeSfxCount - 1); };
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function noiseBurst({ dur = 0.1, freq = 900, q = 1.2, filterType = 'bandpass', vol = 0.18, delay = 0 }) {
    if (!ctx || !sfxGain || !noiseBuffer) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(sfxGain);

    activeSfxCount++;
    src.onended = () => { activeSfxCount = Math.max(0, activeSfxCount - 1); };
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const SFX_COOLDOWNS = {
    ui_click: 45,
    ui_error: 120,
    dig: 65,
    bedrock_break: 150,
    fill: 70,
    room_register: 90,
    room_unreg: 90,
    resident_place: 100,
    resident_move: 100,
    retire: 120,
    trap_place: 75,
    trap_remove: 75,
    wave_start: 300,
    enemy_spawn: 360,
    attack_resident: 95,
    attack_enemy: 120,
    combo: 180,
    bibi_alarm: 650,
    dos_wake: 650,
    dos_smash: 240,
    repair: 280,
    enhance: 280,
    spore: 350,
    lure_success: 300,
    trap_spike: 110,
    trap_noise: 420,
    trap_sticky: 200,
    trap_sign: 220,
    trap_pitfall: 250,
    trap_tv: 400,
    trap_evade: 240,
    heal: 280,
    equip_destroy: 240,
    office_alert: 1000,
    enemy_defeat: 90
  };

  function playSfx(name) {
    if (!ctx || ctx.state !== 'running') {
      // Allow UI click to lazily resume & play on next tick if user interacted
      unlock();
      if (!ctx || ctx.state !== 'running') return;
    }
    const cd = SFX_COOLDOWNS[name] ?? 80;
    if (!canPlaySfx(name, cd)) return;

    switch (name) {
      case 'ui_click':
        tone({ type: 'sine', f1: 640, f2: 460, dur: 0.055, vol: 0.14, cutoff: 2000 });
        break;
      case 'ui_error':
        tone({ type: 'triangle', f1: 230, f2: 180, dur: 0.075, vol: 0.16, cutoff: 1200 });
        tone({ type: 'triangle', f1: 175, f2: 135, dur: 0.095, vol: 0.16, delay: 0.07, cutoff: 1100 });
        break;
      case 'dig':
        tone({ type: 'triangle', f1: 170, f2: 75, dur: 0.11, vol: 0.22, cutoff: 950 });
        noiseBurst({ dur: 0.09, freq: 750, q: 1.4, vol: 0.22, delay: 0.01 });
        break;
      case 'bedrock_break':
        tone({ type: 'triangle', f1: 115, f2: 38, dur: 0.24, vol: 0.30, cutoff: 800 });
        noiseBurst({ dur: 0.18, freq: 480, q: 1.1, vol: 0.28 });
        tone({ type: 'sine', f1: 320, f2: 140, dur: 0.09, vol: 0.14, delay: 0.08 });
        break;
      case 'fill':
        tone({ type: 'sine', f1: 150, f2: 220, dur: 0.09, vol: 0.18, cutoff: 1200 });
        tone({ type: 'sine', f1: 988, f2: 1318, dur: 0.11, vol: 0.10, delay: 0.05 });
        break;
      case 'room_register':
        tone({ type: 'sine', f1: 440, f2: 440, dur: 0.09, vol: 0.15 });
        tone({ type: 'sine', f1: 660, f2: 660, dur: 0.12, vol: 0.15, delay: 0.065 });
        break;
      case 'room_unreg':
        tone({ type: 'sine', f1: 520, f2: 340, dur: 0.1, vol: 0.14 });
        break;
      case 'resident_place':
        tone({ type: 'sine', f1: 523, f2: 523, dur: 0.12, vol: 0.16 });
        tone({ type: 'sine', f1: 659, f2: 659, dur: 0.12, vol: 0.16, delay: 0.07 });
        tone({ type: 'sine', f1: 784, f2: 784, dur: 0.18, vol: 0.17, delay: 0.14 });
        break;
      case 'resident_move':
        noiseBurst({ dur: 0.11, freq: 650, q: 1.8, vol: 0.14 });
        tone({ type: 'sine', f1: 380, f2: 620, dur: 0.13, vol: 0.15, delay: 0.03 });
        break;
      case 'retire':
        tone({ type: 'sine', f1: 620, f2: 415, dur: 0.13, vol: 0.14 });
        tone({ type: 'sine', f1: 1046, f2: 1318, dur: 0.12, vol: 0.11, delay: 0.08 });
        break;
      case 'trap_place':
        tone({ type: 'triangle', f1: 320, f2: 580, dur: 0.085, vol: 0.17, cutoff: 2000 });
        tone({ type: 'sine', f1: 880, f2: 740, dur: 0.07, vol: 0.11, delay: 0.04 });
        break;
      case 'trap_remove':
        tone({ type: 'triangle', f1: 480, f2: 260, dur: 0.085, vol: 0.14 });
        tone({ type: 'sine', f1: 988, f2: 1175, dur: 0.09, vol: 0.10, delay: 0.05 });
        break;
      case 'wave_start':
        tone({ type: 'triangle', f1: 440, f2: 587, dur: 0.14, vol: 0.20, cutoff: 1900 });
        tone({ type: 'triangle', f1: 587, f2: 880, dur: 0.24, vol: 0.22, delay: 0.11, cutoff: 2200 });
        break;
      case 'enemy_spawn':
        tone({ type: 'sine', f1: 240, f2: 310, dur: 0.07, vol: 0.09, cutoff: 1200 });
        break;
      case 'attack_resident':
        tone({ type: 'triangle', f1: 260, f2: 115, dur: 0.085, vol: 0.15, cutoff: 1500 });
        noiseBurst({ dur: 0.04, freq: 1200, q: 1.5, vol: 0.09 });
        break;
      case 'attack_enemy':
        tone({ type: 'sine', f1: 155, f2: 85, dur: 0.085, vol: 0.13, cutoff: 900 });
        break;
      case 'combo':
        tone({ type: 'sine', f1: 784, f2: 784, dur: 0.08, vol: 0.14 });
        tone({ type: 'sine', f1: 988, f2: 1175, dur: 0.13, vol: 0.15, delay: 0.05 });
        break;
      case 'bibi_alarm':
        tone({ type: 'sine', f1: 680, f2: 980, dur: 0.1, vol: 0.16 });
        tone({ type: 'sine', f1: 980, f2: 720, dur: 0.11, vol: 0.14, delay: 0.09 });
        break;
      case 'dos_wake':
        tone({ type: 'triangle', f1: 110, f2: 168, dur: 0.15, vol: 0.22, cutoff: 700 });
        tone({ type: 'triangle', f1: 168, f2: 95, dur: 0.14, vol: 0.18, delay: 0.12, cutoff: 650 });
        break;
      case 'dos_smash':
        tone({ type: 'sine', f1: 145, f2: 44, dur: 0.18, vol: 0.24, cutoff: 800 });
        noiseBurst({ dur: 0.11, freq: 420, q: 1.0, vol: 0.16 });
        break;
      case 'repair':
        tone({ type: 'sine', f1: 880, f2: 880, dur: 0.09, vol: 0.13 });
        tone({ type: 'sine', f1: 1318, f2: 1318, dur: 0.15, vol: 0.14, delay: 0.065 });
        break;
      case 'enhance':
        tone({ type: 'sine', f1: 587, f2: 587, dur: 0.08, vol: 0.12 });
        tone({ type: 'sine', f1: 740, f2: 740, dur: 0.08, vol: 0.12, delay: 0.05 });
        tone({ type: 'sine', f1: 880, f2: 1175, dur: 0.14, vol: 0.13, delay: 0.1 });
        break;
      case 'spore':
        noiseBurst({ dur: 0.12, freq: 520, q: 2.2, vol: 0.13 });
        tone({ type: 'sine', f1: 390, f2: 290, dur: 0.11, vol: 0.10 });
        break;
      case 'lure_success':
        tone({ type: 'sine', f1: 494, f2: 659, dur: 0.09, vol: 0.14 });
        tone({ type: 'sine', f1: 659, f2: 988, dur: 0.14, vol: 0.14, delay: 0.07 });
        break;
      case 'trap_spike':
        tone({ type: 'triangle', f1: 920, f2: 410, dur: 0.08, vol: 0.15, cutoff: 2600 });
        noiseBurst({ dur: 0.04, freq: 2100, q: 2.0, vol: 0.11 });
        break;
      case 'trap_noise':
        tone({ type: 'sine', f1: 740, f2: 735, dur: 0.28, vol: 0.16 });
        tone({ type: 'sine', f1: 1110, f2: 1102, dur: 0.24, vol: 0.10, delay: 0.01 });
        break;
      case 'trap_sticky':
        tone({ type: 'sine', f1: 220, f2: 410, dur: 0.09, vol: 0.15, cutoff: 1400 });
        tone({ type: 'sine', f1: 410, f2: 250, dur: 0.09, vol: 0.14, delay: 0.06, cutoff: 1200 });
        break;
      case 'trap_sign':
        tone({ type: 'sine', f1: 360, f2: 640, dur: 0.11, vol: 0.14 });
        break;
      case 'trap_pitfall':
        tone({ type: 'sine', f1: 780, f2: 190, dur: 0.22, vol: 0.16 });
        tone({ type: 'sine', f1: 115, f2: 52, dur: 0.12, vol: 0.20, delay: 0.20 });
        break;
      case 'trap_tv':
        tone({ type: 'sine', f1: 520, f2: 410, dur: 0.14, vol: 0.14 });
        tone({ type: 'sine', f1: 410, f2: 590, dur: 0.16, vol: 0.13, delay: 0.11 });
        break;
      case 'trap_evade':
        tone({ type: 'sine', f1: 480, f2: 760, dur: 0.085, vol: 0.12 });
        break;
      case 'heal':
        tone({ type: 'sine', f1: 523, f2: 523, dur: 0.10, vol: 0.12 });
        tone({ type: 'sine', f1: 659, f2: 659, dur: 0.10, vol: 0.12, delay: 0.06 });
        tone({ type: 'sine', f1: 784, f2: 784, dur: 0.15, vol: 0.13, delay: 0.12 });
        break;
      case 'equip_destroy':
        noiseBurst({ dur: 0.14, freq: 620, q: 1.0, vol: 0.20 });
        tone({ type: 'triangle', f1: 185, f2: 72, dur: 0.16, vol: 0.20, cutoff: 1000 });
        break;
      case 'office_alert':
        tone({ type: 'triangle', f1: 660, f2: 660, dur: 0.09, vol: 0.15, cutoff: 1800 });
        tone({ type: 'triangle', f1: 880, f2: 880, dur: 0.12, vol: 0.16, delay: 0.10, cutoff: 1800 });
        break;
      case 'enemy_defeat':
        tone({ type: 'sine', f1: 310, f2: 520, dur: 0.08, vol: 0.13 });
        tone({ type: 'sine', f1: 1175, f2: 1568, dur: 0.12, vol: 0.12, delay: 0.05 });
        break;
    }
  }

  // --- Audio UI Dock (Mounted on document.body so it stays active even when .app-shell is inert) ---
  function mountUI() {
    if (document.getElementById('audioDock')) return;

    const dock = document.createElement('div');
    dock.id = 'audioDock';
    dock.innerHTML = `
      <button id="audioToggleBtn" type="button" aria-expanded="false" aria-controls="audioPopover" title="BGM・効果音の設定">♪ 音量</button>
      <div id="audioPopover" role="dialog" aria-label="サウンド設定" hidden>
        <div class="audio-pop-head">
          <strong>♪ サウンド設定</strong>
          <button type="button" class="audio-close-btn" id="audioCloseBtn">閉じる</button>
        </div>
        <div class="audio-row">
          <div class="audio-row-top">
            <span class="audio-label">BGM</span>
            <div class="audio-row-controls">
              <span class="audio-pct" id="bgmPct"></span>
              <button type="button" class="audio-mute-btn" id="bgmMuteBtn"></button>
            </div>
          </div>
          <input class="audio-slider" id="bgmSlider" type="range" min="0" max="100" step="1" aria-label="BGM音量">
        </div>
        <div class="audio-row">
          <div class="audio-row-top">
            <span class="audio-label">効果音</span>
            <div class="audio-row-controls">
              <span class="audio-pct" id="sfxPct"></span>
              <button type="button" class="audio-mute-btn" id="sfxMuteBtn"></button>
            </div>
          </div>
          <input class="audio-slider" id="sfxSlider" type="range" min="0" max="100" step="1" aria-label="効果音音量">
        </div>
      </div>
    `;
    document.body.append(dock);

    const toggleBtn = dock.querySelector('#audioToggleBtn');
    const popover = dock.querySelector('#audioPopover');
    const closeBtn = dock.querySelector('#audioCloseBtn');
    const bgmMuteBtn = dock.querySelector('#bgmMuteBtn');
    const sfxMuteBtn = dock.querySelector('#sfxMuteBtn');
    const bgmSlider = dock.querySelector('#bgmSlider');
    const sfxSlider = dock.querySelector('#sfxSlider');
    const bgmPct = dock.querySelector('#bgmPct');
    const sfxPct = dock.querySelector('#sfxPct');

    function syncUI() {
      const bgmVal = Math.round(prefs.bgmVolume * 100);
      const sfxVal = Math.round(prefs.sfxVolume * 100);
      bgmSlider.value = String(bgmVal);
      sfxSlider.value = String(sfxVal);
      bgmPct.textContent = `${bgmVal}%`;
      sfxPct.textContent = `${sfxVal}%`;

      bgmMuteBtn.textContent = prefs.bgmEnabled ? 'ON' : 'OFF';
      bgmMuteBtn.setAttribute('aria-pressed', String(prefs.bgmEnabled));
      sfxMuteBtn.textContent = prefs.sfxEnabled ? 'ON' : 'OFF';
      sfxMuteBtn.setAttribute('aria-pressed', String(prefs.sfxEnabled));

      const allOff = (!prefs.bgmEnabled || bgmVal === 0) && (!prefs.sfxEnabled || sfxVal === 0);
      toggleBtn.textContent = allOff ? '🔇 消音' : '♪ 音量';
      toggleBtn.classList.toggle('is-muted', allOff);
    }

    function setOpen(open) {
      popover.hidden = !open;
      toggleBtn.setAttribute('aria-expanded', String(open));
    }

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      unlock();
      playSfx('ui_click');
      setOpen(popover.hidden);
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSfx('ui_click');
      setOpen(false);
    });

    bgmMuteBtn.addEventListener('click', () => {
      unlock();
      prefs.bgmEnabled = !prefs.bgmEnabled;
      savePrefs();
      applyVolumes();
      if (prefs.bgmEnabled && isLoopScene(currentScene) && !schedulerId) startScheduler();
      syncUI();
      playSfx('ui_click');
    });

    sfxMuteBtn.addEventListener('click', () => {
      unlock();
      prefs.sfxEnabled = !prefs.sfxEnabled;
      savePrefs();
      applyVolumes();
      syncUI();
      if (prefs.sfxEnabled) playSfx('ui_click');
    });

    bgmSlider.addEventListener('input', () => {
      unlock();
      prefs.bgmVolume = Number(bgmSlider.value) / 100;
      if (prefs.bgmVolume > 0 && !prefs.bgmEnabled) prefs.bgmEnabled = true;
      savePrefs();
      applyVolumes();
      if (prefs.bgmEnabled && isLoopScene(currentScene) && !schedulerId) startScheduler();
      syncUI();
    });

    sfxSlider.addEventListener('input', () => {
      unlock();
      prefs.sfxVolume = Number(sfxSlider.value) / 100;
      if (prefs.sfxVolume > 0 && !prefs.sfxEnabled) prefs.sfxEnabled = true;
      savePrefs();
      applyVolumes();
      syncUI();
    });

    sfxSlider.addEventListener('change', () => {
      playSfx('ui_click');
    });

    document.addEventListener('pointerdown', (e) => {
      if (!popover.hidden && !dock.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !popover.hidden) setOpen(false);
    });

    syncUI();
  }

  setupAutoplayUnlock();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountUI, { once: true });
    else mountUI();
  }

  return {
    unlock,
    setScene,
    setPaused,
    playSfx,
    getPrefs: () => ({ ...prefs }),
    getState: () => ({
      scene: currentScene,
      paused: battlePaused,
      unlocked,
      ctxState: ctx?.state || 'uninitialized',
      prefs: { ...prefs }
    })
  };
})();
