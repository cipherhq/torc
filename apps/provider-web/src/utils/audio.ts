/**
 * Shared audio utility for notification sounds.
 *
 * iOS WebKit + Capacitor WebView require a direct user gesture to unlock
 * audio playback. This module auto-attaches a one-time touchstart/click
 * listener that creates and resumes the AudioContext on the very first tap
 * anywhere in the app. After that, all playback calls work reliably.
 */

let audioCtx: AudioContext | null = null;
let unlocked = false;
let compressorNode: DynamicsCompressorNode | null = null;
let masterGainNode: GainNode | null = null;

function getOrCreateCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    console.log('[audio] Created AudioContext, state:', audioCtx.state);
  }
  return audioCtx;
}

function getOutputChain(ctx: AudioContext) {
  if (!compressorNode || !masterGainNode) {
    compressorNode = ctx.createDynamicsCompressor();
    compressorNode.threshold.setValueAtTime(-22, ctx.currentTime);
    compressorNode.knee.setValueAtTime(24, ctx.currentTime);
    compressorNode.ratio.setValueAtTime(8, ctx.currentTime);
    compressorNode.attack.setValueAtTime(0.003, ctx.currentTime);
    compressorNode.release.setValueAtTime(0.25, ctx.currentTime);

    masterGainNode = ctx.createGain();
    masterGainNode.gain.setValueAtTime(2.0, ctx.currentTime);

    compressorNode.connect(masterGainNode).connect(ctx.destination);
  }

  return masterGainNode;
}

/** Ensure ctx is running — always call before playing. */
async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
      console.log('[audio] Resumed AudioContext, state:', ctx.state);
    } catch (e) {
      console.warn('[audio] Failed to resume:', e);
    }
  }
}

/** Unlock the AudioContext by playing a silent buffer — must be called inside a user gesture. */
function unlock() {
  if (unlocked) return;
  const ctx = getOrCreateCtx();

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  // Play a silent buffer to fully unlock on iOS
  try {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    console.log('[audio] Unlocked with silent buffer, state:', ctx.state);
  } catch {
    // ignore
  }

  unlocked = true;
}

// Auto-attach unlock listener on first import — catches any tap/click in the app
if (typeof window !== 'undefined') {
  const handler = () => {
    unlock();
    document.removeEventListener('touchstart', handler, true);
    document.removeEventListener('touchend', handler, true);
    document.removeEventListener('click', handler, true);
  };
  document.addEventListener('touchstart', handler, true);
  document.addEventListener('touchend', handler, true);
  document.addEventListener('click', handler, true);
}

/** Explicitly init/resume — call from a user gesture for extra safety. */
export function initAudio(): AudioContext {
  const ctx = getOrCreateCtx();
  unlock();
  return ctx;
}

/** Play a three-tone ascending chime (A5 → D6 → E6). */
export function playNotificationBell() {
  try {
    const ctx = getOrCreateCtx();
    ensureRunning(ctx).then(() => _playChime(ctx)).catch(() => {});
  } catch (e) {
    console.warn('Bell playback failed:', e);
  }
}

function _playChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  const output = getOutputChain(ctx);

  const tones = [
    { freq: 880, start: 0, end: 0.4, gain: 0.35 },       // A5
    { freq: 1174.66, start: 0.15, end: 0.6, gain: 0.3 },  // D6
    { freq: 1318.51, start: 0.3, end: 0.8, gain: 0.25 },  // E6
  ];

  for (const t of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = t.freq;
    gain.gain.setValueAtTime(t.gain, now + t.start);
    gain.gain.exponentialRampToValueAtTime(0.01, now + t.end);
    osc.connect(gain).connect(output);
    osc.start(now + t.start);
    osc.stop(now + t.end);
  }
}

/** Play a short single-tone "ding" for incoming messages. */
export function playMessageSound() {
  try {
    const ctx = getOrCreateCtx();
    ensureRunning(ctx).then(() => _playDing(ctx)).catch(() => {});
  } catch (e) {
    console.warn('Message sound failed:', e);
  }
}

function _playDing(ctx: AudioContext) {
  const now = ctx.currentTime;
  const output = getOutputChain(ctx);
  const first = ctx.createOscillator();
  const second = ctx.createOscillator();
  const gain = ctx.createGain();

  first.type = 'sine';
  first.frequency.value = 1046.5; // C6
  second.type = 'triangle';
  second.frequency.value = 1318.51; // E6

  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.03, now + 0.42);

  first.connect(gain);
  second.connect(gain);
  gain.connect(output);

  first.start(now);
  second.start(now + 0.02);
  first.stop(now + 0.42);
  second.stop(now + 0.42);
}

/* ─── Continuous Request Ringtone ──────────────────────────────────────── */

let ringtoneInterval: ReturnType<typeof setInterval> | null = null;
let ringtoneActive = false;

/**
 * Play a continuous, unique ringtone pattern for new job requests.
 * Pattern: two-tone "ring-ring" repeated every 1.5 seconds.
 * Call stopRequestRingtone() to stop.
 */
export function playRequestRingtone() {
  // Don't stack multiple ringtones
  if (ringtoneActive) return;
  ringtoneActive = true;
  console.log('[audio] Starting request ringtone');

  const playOnce = () => {
    try {
      const ctx = getOrCreateCtx();
      ensureRunning(ctx).then(() => {
        if (ringtoneActive) _playRingPattern(ctx);
      }).catch(() => {});
    } catch {
      // ignore
    }
  };

  // Play immediately, then repeat every 1.5 seconds for maximum urgency.
  playOnce();
  ringtoneInterval = setInterval(() => {
    playOnce();
    // Vibrate on every ring cycle for persistent buzz
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
  }, 1500);
}

/** Stop the continuous request ringtone. */
export function stopRequestRingtone() {
  console.log('[audio] Stopping request ringtone');
  ringtoneActive = false;
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}

/**
 * One cycle of the ringtone: a two-burst pattern like a phone ring
 * Burst 1 (0–0.4s): 440Hz + 480Hz blended — classic ring
 * Short pause
 * Burst 2 (0.5–0.9s): 440Hz + 480Hz blended — classic ring
 * Then silence until next interval
 */
function _playRingPattern(ctx: AudioContext) {
  const now = ctx.currentTime;
  const output = getOutputChain(ctx);

  const bursts = [
    { start: 0, end: 0.45 },
    { start: 0.55, end: 1.0 },
  ];

  for (const burst of bursts) {
    // Two simultaneous frequencies for a richer ring
    const freqs = [440, 480, 523.25];
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = freq === 523.25 ? 'triangle' : 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(freq === 523.25 ? 0.3 : 0.45, now + burst.start);
      gain.gain.exponentialRampToValueAtTime(0.02, now + burst.end);
      osc.connect(gain).connect(output);
      osc.start(now + burst.start);
      osc.stop(now + burst.end + 0.05);
    }

    // Add a higher harmonic for a distinctive "digital phone" feel
    const harmonic = ctx.createOscillator();
    const hGain = ctx.createGain();
    harmonic.type = 'triangle';
    harmonic.frequency.value = 784; // G5
    hGain.gain.setValueAtTime(0.25, now + burst.start);
    hGain.gain.exponentialRampToValueAtTime(0.02, now + burst.end);
    harmonic.connect(hGain).connect(output);
    harmonic.start(now + burst.start);
    harmonic.stop(now + burst.end + 0.05);
  }
}

/* ─── System / Capacitor Notifications ─────────────────────────────── */

/** Request browser Notification permission (call on user gesture). */
export function requestNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

/**
 * Show a persistent system notification (works even when tab is in background).
 * Uses the Web Notification API which fires native OS notifications on both
 * desktop browsers and Capacitor WebViews.
 */
export function showSystemNotification(title: string, body: string, tag?: string) {
  if (typeof Notification === 'undefined') return;

  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        tag: tag || `torc-${Date.now()}`,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300, 100, 300],
      } as NotificationOptions);
    } catch { /* ignore */ }
  }
}
