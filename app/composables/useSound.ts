import { useSettingsStore } from '~/stores/settings';

interface Note {
  frequency: number
  atMs: number
  durationMs: number
  gain: number
}

let audioContext: AudioContext | undefined;

const context = () => {
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
};

const playMarimbaNote = (audio: AudioContext, { frequency, atMs, durationMs, gain }: Note) => {
  const startAt = audio.currentTime + atMs / 1000;
  const endAt = startAt + durationMs / 1000;
  const partials = [{ ratio: 1, level: 1, decay: 1 }, { ratio: 4, level: 0.25, decay: 0.35 }];
  for (const { ratio, level, decay } of partials) {
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.frequency.value = frequency * ratio;
    envelope.gain.setValueAtTime(0, startAt);
    envelope.gain.linearRampToValueAtTime(gain * level, startAt + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + (endAt - startAt) * decay);
    oscillator.connect(envelope).connect(audio.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  }
};

export const unlockSound = () => {
  context();
};

export const useSound = () => {
  const settings = useSettingsStore();

  const play = (notes: Omit<Note, 'gain'>[], gain: number, vibration: number | number[]) => {
    if (!settings.isSoundOn) return;
    const audio = context();
    for (const note of notes) playMarimbaNote(audio, { ...note, gain });
    navigator.vibrate?.(vibration);
  };

  return {
    tick: () => play([{ frequency: 880, atMs: 0, durationMs: 120 }], 0.18, 8),
    right: () => play([{ frequency: 659, atMs: 0, durationMs: 160 }, { frequency: 880, atMs: 100, durationMs: 260 }], 0.2, 14),
    wrong: () => play([{ frequency: 196, atMs: 0, durationMs: 320 }], 0.22, 30),
    results: () => play([523, 659, 784, 1047].map((frequency, index) => ({ frequency, atMs: index * 110, durationMs: index === 3 ? 400 : 180 })), 0.18, [12, 80, 12, 80, 24]),
  };
};
