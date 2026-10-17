// The original client played server-specified samples as 11,025 Hz mono sound.
// Browsers require a user gesture before an AudioContext can start.
let context: AudioContext | undefined;
let output: GainNode | undefined;
let musicOutput: GainNode | undefined;
let musicNode: AudioWorkletNode | undefined;
let musicLoad: Promise<boolean> | undefined;
let musicEnabled = true;
let musicTune = -1;
let enabled = true;
let available = new Set<string>();
const buffers = new Map<string, Promise<AudioBuffer | null>>();

export type SoundResult = 'played' | 'disabled' | 'locked' | 'missing' | 'unavailable';

export function setAvailableSounds(names: string[]): void {
  available = new Set(names);
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  if (output && context) output.gain.setValueAtTime(value ? 1 : 0, context.currentTime);
}

export function unlockSound(): void {
  if (!enabled && !musicEnabled) return;
  if (!context) {
    context = new AudioContext();
    output = context.createGain();
    output.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume().catch(() => {});
  if (musicEnabled && musicTune >= 0) void ensureMusic();
}

async function ensureMusic(): Promise<boolean> {
  if (!context) return false;
  if (musicNode) return true;
  if (!musicLoad) {
    const activeContext = context;
    musicLoad = activeContext.audioWorklet.addModule('/music-worklet.js').then(() => {
      musicNode = new AudioWorkletNode(activeContext, 'ps2mud-music', { outputChannelCount: [1] });
      musicOutput = activeContext.createGain();
      musicOutput.gain.value = musicEnabled ? 0.35 : 0;
      musicNode.connect(musicOutput).connect(activeContext.destination);
      musicNode.port.postMessage({ tune: musicTune });
      return true;
    }).catch(() => false);
  }
  return musicLoad;
}

export function setMusicEnabled(value: boolean): void {
  musicEnabled = value;
  if (musicOutput && context) musicOutput.gain.setValueAtTime(value ? 0.35 : 0, context.currentTime);
  if (value && musicTune >= 0) {
    unlockSound();
    void ensureMusic();
  }
}

export async function setMusicTune(tune: number): Promise<'playing' | 'silent' | 'locked' | 'unavailable'> {
  if (tune !== -1 && tune !== 0 && tune !== 1 && tune !== 2) return 'unavailable';
  musicTune = tune;
  musicNode?.port.postMessage({ tune });
  if (tune < 0 || !musicEnabled) return 'silent';
  if (!context) return 'locked';
  if (!await ensureMusic()) return 'unavailable';
  if (context.state !== 'running') {
    try { await context.resume(); } catch { return 'locked'; }
  }
  return context.state === 'running' ? 'playing' : 'locked';
}

export async function playSound(name: string): Promise<SoundResult> {
  if (!enabled) return 'disabled';
  if (available.size && !available.has(name)) return 'missing';
  if (!context || !output) return 'locked';
  const activeContext = context;
  let pending = buffers.get(name);
  if (!pending) {
    pending = fetch(`/assets/audio/${encodeURIComponent(name)}.wav`)
      .then(response => response.ok ? response.arrayBuffer() : null)
      .then(data => data ? activeContext.decodeAudioData(data) : null)
      .catch(() => null);
    buffers.set(name, pending);
  }
  const buffer = await pending;
  if (!buffer) return 'unavailable';
  if (!enabled) return 'disabled';
  if (activeContext.state !== 'running') {
    try { await activeContext.resume(); } catch { return 'locked'; }
  }
  if (activeContext.state !== 'running') return 'locked';
  const source = activeContext.createBufferSource();
  source.buffer = buffer;
  const volume = activeContext.createGain();
  // The original collision sample is particularly quiet and lasts 0.2 s.
  volume.gain.value = name === 'nono' ? 2.2 : 1;
  source.connect(volume).connect(output);
  source.start();
  return 'played';
}
