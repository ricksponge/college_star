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
 * Synthétiseur Web Audio API 100% autonome (sans fichiers audio externes)
 * et retour haptique mobile (`navigator.vibrate`) pour « Brawl Collège : Opération 6ème ».
 */
export class AudioManager {
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

  public playUiClick(): void {
    this.vibrate(6);
    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: 620,
      freqEnd: 880,
      duration: 0.045,
      gainPeak: 0.14,
      attack: 0.003,
    });
  }

  /**
   * Effet sonore de tir dynamique par héros (laser, plume/fiole d'encre, onde sismique, double beat).
   */
  public playShoot(brawlerId: BrawlerId): void {
    this.vibrate(brawlerId === 'MAYA' ? 14 : 10);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    switch (brawlerId) {
      case 'TIMO': {
        // Tir laser/frappe rapide + punch grave
        this.playTone(ctx, output, {
          type: 'sawtooth',
          freqStart: 780,
          freqEnd: 210,
          duration: 0.09,
          gainPeak: 0.16,
          attack: 0.003,
          filterType: 'lowpass',
          filterFreqStart: 2600,
          filterFreqEnd: 540,
          filterQ: 2.0,
        });
        this.playTone(ctx, output, {
          type: 'triangle',
          freqStart: 225,
          freqEnd: 68,
          duration: 0.095,
          gainPeak: 0.32,
          attack: 0.004,
        });
        break;
      }
      case 'LEO': {
        // Tir plume & fiole d'encre : glissando fluide + double bulle
        this.playTone(ctx, output, {
          type: 'sine',
          freqStart: 320,
          freqEnd: 720,
          duration: 0.075,
          gainPeak: 0.24,
          attack: 0.005,
          filterType: 'bandpass',
          filterFreqStart: 1300,
          filterQ: 4.0,
        });
        this.playTone(ctx, output, {
          type: 'triangle',
          freqStart: 680,
          freqEnd: 340,
          duration: 0.105,
          delay: 0.04,
          gainPeak: 0.2,
          attack: 0.006,
          filterType: 'bandpass',
          filterFreqStart: 1500,
          filterFreqEnd: 720,
          filterQ: 4.5,
        });
        break;
      }
      case 'MAYA': {
        // Onde sismique grave
        this.playTone(ctx, output, {
          type: 'sawtooth',
          freqStart: 145,
          freqEnd: 46,
          duration: 0.19,
          gainPeak: 0.24,
          attack: 0.006,
          filterType: 'lowpass',
          filterFreqStart: 460,
          filterFreqEnd: 120,
          filterQ: 2.5,
        });
        this.playTone(ctx, output, {
          type: 'sine',
          freqStart: 96,
          freqEnd: 42,
          duration: 0.17,
          gainPeak: 0.28,
          attack: 0.005,
        });
        break;
      }
      case 'ZACK': {
        // Double salve laser synthétique
        this.playSequence(
          ctx,
          output,
          [
            { freqStart: 780, freqEnd: 1080, duration: 0.055, delay: 0 },
            { freqStart: 980, freqEnd: 1320, duration: 0.065, delay: 0.06 },
          ],
          {
            type: 'square',
            gainPeak: 0.14,
            attack: 0.004,
            filterType: 'lowpass',
            filterFreqStart: 3000,
            filterQ: 1.4,
          }
        );
        break;
      }
    }
  }

  /**
   * Impact dynamique avec retour haptique mobile.
   */
  public playImpact(isCritical = false): void {
    this.vibrate(isCritical ? [25, 15, 35] : 18);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    this.playTone(ctx, output, {
      type: 'sine',
      freqStart: isCritical ? 210 : 165,
      freqEnd: 52,
      duration: isCritical ? 0.14 : 0.1,
      gainPeak: isCritical ? 0.34 : 0.24,
      attack: 0.003,
    });
    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: isCritical ? 1120 : 780,
      freqEnd: 240,
      duration: 0.06,
      gainPeak: 0.16,
      attack: 0.002,
      filterType: 'bandpass',
      filterFreqStart: 1200,
      filterQ: 2.2,
    });
  }

  /**
   * Accord majeur ascendant sur bonne réponse (pitch monté selon le multiplicateur de combo).
   */
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

    // Accord majeur ascendant (Do - Mi - Sol - Do)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    this.playSequence(
      ctx,
      output,
      notes.map((freq, index) => ({
        freqStart: freq * pitchFactor,
        duration: index === notes.length - 1 ? 0.22 : 0.13,
        delay: index * 0.042,
        gainPeak: index === notes.length - 1 ? 0.24 : 0.19,
      })),
      {
        type: 'triangle',
        attack: 0.005,
      }
    );

    // Impact punchy initial synchronisé
    this.playTone(ctx, output, {
      type: 'sine',
      freqStart: 185,
      freqEnd: 65,
      duration: 0.09,
      gainPeak: 0.24,
      attack: 0.003,
    });
  }

  /**
   * Buzzer de pénalité et rebond métallique sur mauvaise réponse / bouclier de pénalité.
   */
  public playHitError(): void {
    this.playPenaltyBuzzer();
  }

  public playPenaltyBuzzer(): void {
    this.vibrate([55, 30, 75]);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    // Buzzer dissonant (deux dents de scie désaccordées)
    this.playTone(ctx, output, {
      type: 'sawtooth',
      freqStart: 158,
      freqEnd: 72,
      duration: 0.26,
      gainPeak: 0.25,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreqStart: 620,
      filterFreqEnd: 160,
      filterQ: 3.8,
    });
    this.playTone(ctx, output, {
      type: 'sawtooth',
      freqStart: 169,
      freqEnd: 68,
      duration: 0.26,
      gainPeak: 0.18,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreqStart: 580,
      filterFreqEnd: 150,
      filterQ: 3.5,
    });

    // Rebond métallique sourd
    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: 310,
      freqEnd: 175,
      duration: 0.11,
      gainPeak: 0.12,
      attack: 0.003,
      filterType: 'bandpass',
      filterFreqStart: 640,
      filterQ: 4.5,
    });
    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: 118,
      freqEnd: 56,
      duration: 0.14,
      delay: 0.14,
      gainPeak: 0.16,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreqStart: 280,
      filterFreqEnd: 100,
    });
  }

  public playSuperReady(): void {
    this.vibrate([12, 20, 28]);
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

  /**
   * Montée de tension progressive sur les 5 clics du Casier Mystère.
   */
  public playStarrDropTap(tapIndex: number, upgraded: boolean): void {
    const clampedIndex = Math.max(1, Math.min(5, Math.floor(tapIndex)));
    this.vibrate(upgraded ? [20, 20, 40] : 14 + clampedIndex * 4);

    const audio = this.acquireOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    // Montée harmonique claire de clic 1 à clic 5
    const tensionScale = [349.23, 440, 523.25, 659.25, 880];
    const baseFreq = tensionScale[clampedIndex - 1] ?? 440;

    this.playTone(ctx, output, {
      type: 'triangle',
      freqStart: baseFreq,
      freqEnd: baseFreq * 1.24,
      duration: 0.14,
      gainPeak: 0.24 + clampedIndex * 0.015,
      attack: 0.004,
    });
    this.playTone(ctx, output, {
      type: 'sine',
      freqStart: baseFreq * 0.5,
      freqEnd: baseFreq * 0.36,
      duration: 0.09,
      gainPeak: 0.22,
      attack: 0.004,
    });
    this.playTone(ctx, output, {
      type: 'sawtooth',
      freqStart: baseFreq * 0.75,
      freqEnd: baseFreq * 1.02,
      duration: 0.12,
      gainPeak: 0.07 + clampedIndex * 0.012,
      attack: 0.008,
      filterType: 'lowpass',
      filterFreqStart: 1200 + clampedIndex * 320,
      filterQ: 2.0,
    });

    if (upgraded) {
      this.playSequence(
        ctx,
        output,
        [
          { freqStart: baseFreq * 1.5, duration: 0.14, delay: 0.035, gainPeak: 0.17 },
          { freqStart: baseFreq * 2.0, duration: 0.2, delay: 0.08, gainPeak: 0.2 },
        ],
        {
          type: 'sine',
          attack: 0.006,
        }
      );
    }
  }

  public playStarrDropReveal(rarity: StarrDropRarity): void {
    this.vibrate([25, 30, 55]);

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
    this.vibrate(victory ? [25, 30, 45, 25, 70] : [60, 40, 60]);
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

  public vibrate(pattern: number | number[]): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignorer si l'API Vibration est bloquée ou indisponible
    }
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

  private readMutedFromStorage(): boolean {
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        return window.localStorage.getItem(STORAGE_MUTED_KEY) === 'true';
      }
    } catch {
      // localStorage indisponible
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

export const audioManager = new AudioManager();
