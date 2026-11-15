import type { BrawlerId, StarrDropRarity } from '../types/cctp';

const STORAGE_MUTED_KEY = 'brawl_college_muted_v1';

interface WindowWithWebkitAudio extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

interface ToneConfig {
  type: OscillatorType;
  freqStart: number;
  freqEnd?: number;
  duration: number;
  delay?: number;
  gainPeak?: number;
  attack?: number;
  exponentialFreq?: boolean;
  filterType?: BiquadFilterType;
  filterFreqStart?: number;
  filterFreqEnd?: number;
  filterQ?: number;
}

/**
 * Synthétiseur Web Audio API 100% hors-ligne + retour haptique
 * pour « Brawl Collège : Opération 6ème ».
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean;
  private gestureListenersBound = false;
  private readonly unlockHandler = (): void => {
    this.handleUserGesture();
  };

  constructor() {
    this.muted = this.readMutedFromStorage();
    this.bindGestureUnlock();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = Boolean(muted);
    this.writeMutedToStorage(this.muted);

    if (this.muted) {
      if (this.masterGain && this.ctx) {
        try {
          this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        } catch {
          // AudioContext non disponible ou fermé
        }
      }
      return;
    }

    const ctx = this.ensureContext();
    if (ctx && this.masterGain) {
      try {
        this.masterGain.gain.setValueAtTime(0.75, ctx.currentTime);
      } catch {
        // Ignorer si l'AudioContext n'est pas encore prêt
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public playShoot(brawlerId: BrawlerId): void {
    this.vibrate(8);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    switch (brawlerId) {
      case 'TIMO': {
        // Ballon sec : impact grave + claquement sec filtré
        this.playTone(ctx, output, {
          type: 'triangle',
          freqStart: 225,
          freqEnd: 68,
          duration: 0.095,
          gainPeak: 0.34,
          attack: 0.004,
        });
        this.playTone(ctx, output, {
          type: 'triangle',
          freqStart: 520,
          freqEnd: 145,
          duration: 0.05,
          gainPeak: 0.18,
          attack: 0.003,
          filterType: 'bandpass',
          filterFreqStart: 900,
          filterQ: 2.2,
        });
        break;
      }
      case 'LEO': {
        // Flaque liquide : double bulle résonante
        this.playTone(ctx, output, {
          type: 'sine',
          freqStart: 310,
          freqEnd: 640,
          duration: 0.065,
          gainPeak: 0.24,
          attack: 0.006,
          filterType: 'bandpass',
          filterFreqStart: 1200,
          filterQ: 4.5,
        });
        this.playTone(ctx, output, {
          type: 'sine',
          freqStart: 690,
          freqEnd: 350,
          duration: 0.095,
          delay: 0.045,
          gainPeak: 0.22,
          attack: 0.006,
          filterType: 'bandpass',
          filterFreqStart: 1450,
          filterFreqEnd: 750,
          filterQ: 5,
        });
        break;
      }
      case 'MAYA': {
        // Onde grave : impulsion sismique filtrée
        this.playTone(ctx, output, {
          type: 'sawtooth',
          freqStart: 135,
          freqEnd: 48,
          duration: 0.18,
          gainPeak: 0.24,
          attack: 0.006,
          filterType: 'lowpass',
          filterFreqStart: 420,
          filterFreqEnd: 120,
          filterQ: 2.4,
        });
        this.playTone(ctx, output, {
          type: 'sine',
          freqStart: 92,
          freqEnd: 44,
          duration: 0.16,
          gainPeak: 0.28,
          attack: 0.005,
        });
        break;
      }
      case 'ZACK': {
        // Double bip synth rapide
        this.playSequence(
          ctx,
          output,
          [
            { freqStart: 740, freqEnd: 920, duration: 0.055, delay: 0 },
            { freqStart: 940, freqEnd: 1200, duration: 0.065, delay: 0.065 },
          ],
          {
            type: 'square',
            gainPeak: 0.15,
            attack: 0.004,
            filterType: 'lowpass',
            filterFreqStart: 2800,
            filterQ: 1.2,
          }
        );
        break;
      }
    }
  }

  public playHitCorrect(comboMultiplier: number): void {
    this.vibrate([15, 25, 20]);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    const safeCombo = Number.isFinite(comboMultiplier)
      ? Math.max(1, Math.min(2, comboMultiplier))
      : 1;
    const semitones = Math.min(12, Math.round(((safeCombo - 1) / 0.15) * 2));
    const pitchFactor = Math.pow(2, semitones / 12);

    const notes = [523.25, 659.25, 783.99];
    if (safeCombo >= 1.3) {
      notes.push(1046.5);
    }

    this.playSequence(
      ctx,
      output,
      notes.map((freq, index) => ({
        freqStart: freq * pitchFactor,
        duration: index === notes.length - 1 ? 0.2 : 0.14,
        delay: index * 0.045,
        gainPeak: index === notes.length - 1 ? 0.24 : 0.2,
      })),
      {
        type: 'triangle',
        attack: 0.006,
      }
    );
  }

  public playHitError(): void {
    this.vibrate([50, 30, 70]);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    // Rebond métallique sourd : sawtooth/triangle descendant 160Hz -> 65Hz avec filtre passe-bas
    this.playTone(ctx, output, {
      type: 'sawtooth',
      freqStart: 160,
      freqEnd: 65,
      duration: 0.24,
      gainPeak: 0.28,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreqStart: 520,
      filterFreqEnd: 140,
      filterQ: 4,
    });
    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: 160,
      freqEnd: 65,
      duration: 0.22,
      gainPeak: 0.24,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreqStart: 380,
      filterFreqEnd: 120,
      filterQ: 2,
    });
    // Léger clang métallique inharmonique + second petit rebond
    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: 315,
      freqEnd: 190,
      duration: 0.11,
      gainPeak: 0.09,
      attack: 0.003,
      filterType: 'bandpass',
      filterFreqStart: 640,
      filterQ: 4.5,
    });
    this.playTone(ctx, output, {
      type: 'square',
      freqStart: 470,
      freqEnd: 270,
      duration: 0.08,
      gainPeak: 0.05,
      attack: 0.003,
      filterType: 'bandpass',
      filterFreqStart: 780,
      filterQ: 5,
    });
    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: 112,
      freqEnd: 58,
      duration: 0.13,
      delay: 0.13,
      gainPeak: 0.13,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreqStart: 280,
      filterFreqEnd: 100,
    });
  }

  public playSuperReady(): void {
    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    // Arpège rapide doré
    const notes = [392, 493.88, 587.33, 783.99, 987.77];
    this.playSequence(
      ctx,
      output,
      notes.map((freq, index) => ({
        freqStart: freq,
        duration: index === notes.length - 1 ? 0.24 : 0.12,
        delay: index * 0.045,
        gainPeak: 0.19,
      })),
      {
        type: 'triangle',
        attack: 0.005,
      }
    );
    this.playTone(ctx, output, {
      type: 'sine',
      freqStart: 1567.98,
      duration: 0.26,
      delay: 0.18,
      gainPeak: 0.12,
      attack: 0.01,
    });
  }

  public playSuperCast(): void {
    this.vibrate([30, 20, 60]);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    // Sweep puissant + impact grave + éclat final
    this.playTone(ctx, output, {
      type: 'sawtooth',
      freqStart: 140,
      freqEnd: 880,
      duration: 0.28,
      gainPeak: 0.24,
      attack: 0.008,
      filterType: 'lowpass',
      filterFreqStart: 500,
      filterFreqEnd: 3200,
      filterQ: 3.2,
    });
    this.playTone(ctx, output, {
      type: 'sine',
      freqStart: 180,
      freqEnd: 52,
      duration: 0.26,
      gainPeak: 0.34,
      attack: 0.005,
    });
    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: 880,
      freqEnd: 1320,
      duration: 0.22,
      delay: 0.12,
      gainPeak: 0.18,
      attack: 0.01,
    });
  }

  public playGadget(): void {
    this.vibrate(18);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    // Bip tactique net
    this.playSequence(
      ctx,
      output,
      [
        { freqStart: 880, duration: 0.055, delay: 0, gainPeak: 0.2 },
        { freqStart: 1320, duration: 0.095, delay: 0.055, gainPeak: 0.22 },
      ],
      {
        type: 'sine',
        attack: 0.004,
      }
    );
    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: 1760,
      duration: 0.08,
      delay: 0.055,
      gainPeak: 0.08,
      attack: 0.004,
    });
  }

  public playStarrDropTap(tapIndex: number, upgraded: boolean): void {
    this.vibrate(upgraded ? [20, 20, 35] : 15);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    const clampedIndex = Math.max(0, Math.min(5, Math.floor(tapIndex)));
    const baseFreq = 360 * Math.pow(1.18, clampedIndex);

    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: baseFreq,
      freqEnd: baseFreq * 1.15,
      duration: 0.11,
      gainPeak: 0.25,
      attack: 0.005,
    });
    this.playTone(ctx, output, {
      type: 'sine',
      freqStart: baseFreq * 0.5,
      freqEnd: baseFreq * 0.35,
      duration: 0.075,
      gainPeak: 0.2,
      attack: 0.004,
    });

    if (upgraded) {
      this.playSequence(
        ctx,
        output,
        [
          { freqStart: baseFreq * 2, duration: 0.14, delay: 0.04, gainPeak: 0.16 },
          { freqStart: baseFreq * 2.5, duration: 0.18, delay: 0.085, gainPeak: 0.18 },
        ],
        {
          type: 'sine',
          attack: 0.006,
        }
      );
    }
  }

  public playStarrDropReveal(rarity: StarrDropRarity): void {
    this.vibrate([25, 30, 50]);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    switch (rarity) {
      case 'RARE': {
        this.playFanfare(ctx, output, [523.25, 659.25, 783.99], 0.07, 0.22);
        break;
      }
      case 'SUPER_RARE': {
        this.playFanfare(ctx, output, [587.33, 739.99, 880, 1174.66], 0.065, 0.23);
        break;
      }
      case 'EPIQUE': {
        this.playFanfare(
          ctx,
          output,
          [659.25, 830.61, 987.77, 1318.51, 1661.22],
          0.06,
          0.24
        );
        break;
      }
      case 'LEGENDAIRE': {
        this.playFanfare(ctx, output, [698.46, 880, 1046.5, 1396.91], 0.07, 0.26);
        this.playTone(ctx, output, {
          type: 'sawtooth',
          freqStart: 174.61,
          freqEnd: 349.23,
          duration: 0.42,
          delay: 0.14,
          gainPeak: 0.16,
          attack: 0.02,
          filterType: 'lowpass',
          filterFreqStart: 700,
          filterFreqEnd: 2400,
          filterQ: 2,
        });
        this.playTone(ctx, output, {
          type: 'sine',
          freqStart: 1760,
          duration: 0.38,
          delay: 0.24,
          gainPeak: 0.14,
          attack: 0.01,
        });
        this.playTone(ctx, output, {
          type: 'sine',
          freqStart: 2093,
          duration: 0.42,
          delay: 0.28,
          gainPeak: 0.12,
          attack: 0.01,
        });
        break;
      }
    }
  }

  public playMatchEnd(victory: boolean): void {
    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    if (victory) {
      this.playFanfare(ctx, output, [523.25, 659.25, 783.99, 1046.5], 0.09, 0.24);
      this.playTone(ctx, output, {
        type: 'sine',
        freqStart: 130.81,
        duration: 0.45,
        delay: 0.27,
        gainPeak: 0.25,
        attack: 0.01,
      });
      return;
    }

    // Cadence douce de fin de partie
    this.playSequence(
      ctx,
      output,
      [
        { freqStart: 392, duration: 0.16, delay: 0, gainPeak: 0.18 },
        { freqStart: 349.23, duration: 0.16, delay: 0.12, gainPeak: 0.17 },
        { freqStart: 311.13, duration: 0.18, delay: 0.24, gainPeak: 0.16 },
        { freqStart: 261.63, duration: 0.34, delay: 0.36, gainPeak: 0.18 },
      ],
      {
        type: 'triangle',
        attack: 0.012,
        filterType: 'lowpass',
        filterFreqStart: 1400,
        filterFreqEnd: 750,
      }
    );
  }

  private playFanfare(
    ctx: AudioContext,
    output: AudioNode,
    frequencies: number[],
    stepSec: number,
    gainPeak: number
  ): void {
    this.playSequence(
      ctx,
      output,
      frequencies.map((freq, index) => ({
        freqStart: freq,
        duration: index === frequencies.length - 1 ? 0.36 : 0.16,
        delay: index * stepSec,
        gainPeak: index === frequencies.length - 1 ? gainPeak : gainPeak * 0.85,
      })),
      {
        type: 'triangle',
        attack: 0.008,
      }
    );
  }

  private playSequence(
    ctx: AudioContext,
    output: AudioNode,
    steps: Array<Partial<ToneConfig> & { freqStart: number; duration: number }>,
    defaults: Partial<ToneConfig>
  ): void {
    for (const step of steps) {
      this.playTone(ctx, output, {
        type: defaults.type ?? 'triangle',
        attack: defaults.attack,
        gainPeak: defaults.gainPeak,
        exponentialFreq: defaults.exponentialFreq,
        filterType: defaults.filterType,
        filterFreqStart: defaults.filterFreqStart,
        filterFreqEnd: defaults.filterFreqEnd,
        filterQ: defaults.filterQ,
        ...step,
      });
    }
  }

  private playTone(ctx: AudioContext, output: AudioNode, config: ToneConfig): void {
    try {
      const start = ctx.currentTime + (config.delay ?? 0);
      const duration = Math.max(0.02, config.duration);
      const stop = start + duration;
      const attack = Math.min(duration * 0.45, config.attack ?? 0.008);
      const gainPeak = Math.max(0.001, config.gainPeak ?? 0.22);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = config.type;
      osc.frequency.setValueAtTime(Math.max(1, config.freqStart), start);

      if (config.freqEnd !== undefined) {
        const endFreq = Math.max(1, config.freqEnd);
        if (config.exponentialFreq !== false && config.freqStart > 0 && endFreq > 0) {
          osc.frequency.exponentialRampToValueAtTime(endFreq, stop);
        } else {
          osc.frequency.linearRampToValueAtTime(endFreq, stop);
        }
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(gainPeak, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, stop);

      if (config.filterType) {
        const filter = ctx.createBiquadFilter();
        filter.type = config.filterType;
        filter.frequency.setValueAtTime(config.filterFreqStart ?? 1000, start);
        if (config.filterFreqEnd !== undefined) {
          filter.frequency.exponentialRampToValueAtTime(
            Math.max(20, config.filterFreqEnd),
            stop
          );
        }
        filter.Q.setValueAtTime(config.filterQ ?? 1, start);

        osc.connect(filter);
        filter.connect(gain);
        osc.onended = () => {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        };
      } else {
        osc.connect(gain);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      }

      gain.connect(output);
      osc.start(start);
      osc.stop(stop + 0.02);
    } catch {
      // Ignorer silencieusement toute erreur Web Audio en environnement restreint
    }
  }

  private acquireOutput(): { ctx: AudioContext; output: AudioNode } | null {
    if (this.muted) {
      return null;
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) {
      return null;
    }
    return { ctx, output: this.masterGain };
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      let ctx = this.ctx;
      if (!ctx) {
        const win = window as WindowWithWebkitAudio;
        const AudioCtx =
          win.AudioContext ??
          win.webkitAudioContext ??
          (typeof AudioContext !== 'undefined' ? AudioContext : undefined);
        if (!AudioCtx) {
          return null;
        }
        ctx = new AudioCtx();
        this.ctx = ctx;
        const master = ctx.createGain();
        master.gain.setValueAtTime(this.muted ? 0 : 0.75, ctx.currentTime);
        master.connect(ctx.destination);
        this.masterGain = master;
      }

      if (ctx.state === 'suspended') {
        void ctx
          .resume()
          .then(() => {
            if (this.ctx?.state === 'running') {
              this.unbindGestureUnlock();
            }
          })
          .catch(() => {
            // Sera débloqué au prochain geste utilisateur
          });
      } else if (ctx.state === 'running') {
        this.unbindGestureUnlock();
      }

      return ctx;
    } catch {
      return null;
    }
  }

  private bindGestureUnlock(): void {
    if (this.gestureListenersBound || typeof window === 'undefined') {
      return;
    }
    if (typeof window.addEventListener !== 'function') {
      return;
    }

    try {
      const options: AddEventListenerOptions = { passive: true };
      window.addEventListener('pointerdown', this.unlockHandler, options);
      window.addEventListener('touchstart', this.unlockHandler, options);
      window.addEventListener('keydown', this.unlockHandler, options);
      this.gestureListenersBound = true;
    } catch {
      // Ignorer si addEventListener n'est pas supporté
    }
  }

  private unbindGestureUnlock(): void {
    if (!this.gestureListenersBound || typeof window === 'undefined') {
      return;
    }
    if (typeof window.removeEventListener !== 'function') {
      return;
    }

    try {
      window.removeEventListener('pointerdown', this.unlockHandler);
      window.removeEventListener('touchstart', this.unlockHandler);
      window.removeEventListener('keydown', this.unlockHandler);
      this.gestureListenersBound = false;
    } catch {
      // Ignorer
    }
  }

  private handleUserGesture(): void {
    if (this.muted) {
      return;
    }
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'running') {
      this.unbindGestureUnlock();
    }
  }

  private vibrate(pattern: number | number[]): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignorer si l'API Vibration est bloquée ou indisponible
    }
  }

  private readMutedFromStorage(): boolean {
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        return window.localStorage.getItem(STORAGE_MUTED_KEY) === 'true';
      }
    } catch {
      // localStorage indisponible (navigation privée / Node)
    }
    return false;
  }

  private writeMutedToStorage(muted: boolean): void {
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        window.localStorage.setItem(STORAGE_MUTED_KEY, muted ? 'true' : 'false');
      }
    } catch {
      // localStorage indisponible
    }
  }
}

export const soundManager = new SoundManager();
