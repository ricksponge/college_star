import type {
  BrawlerId,
  GameModeId,
  IBrawler,
  ICombatImpactInput,
  ICombatImpactResult,
  IGameMode,
  IQuestion,
  StarrDropRarity,
  SubjectCategory,
} from '../types/cctp';

const RARITY_PITCH_FACTOR: Record<StarrDropRarity, number> = {
  RARE: 1.0,
  SUPER_RARE: 1.12,
  EPIQUE: 1.26,
  LEGENDAIRE: 1.42,
};

const COMBO_SEMITONES = [0, 2, 4, 5, 7, 9, 12];

export interface IModeArenaRules {
  mode: IGameMode;
  objectiveTarget: number;
  targetSpeedFactor: number;
  primaryColorHex: number;
  accentColorHex: number;
  defaultSubject: SubjectCategory;
  bannerTag: string;
}

/**
 * Connecteur de règles et métadonnées des 5 modes CCTP (strictement basé sur src/types/cctp.ts).
 */
export const MODE_ARENA_RULES: Record<GameModeId, IModeArenaRules> = {
  CHASSE_AUX_BONNES_NOTES: {
    mode: {
      id: 'CHASSE_AUX_BONNES_NOTES',
      mode_number: 1,
      name: 'Chasse aux Bonnes Notes',
      inspired_by: 'Razzia de Gemmes',
      format: '3v3',
      duration_seconds: 135,
      description: 'Détruis les bons drones-gemmes pour récolter 10 cristaux bleus.',
      victory_condition: 'Atteindre 10 points d’objectif avant la fin du chrono.',
    },
    objectiveTarget: 10,
    targetSpeedFactor: 1.0,
    primaryColorHex: 0x38bdf8,
    accentColorHex: 0xfacc15,
    defaultSubject: 'mathematiques',
    bannerTag: '💎 10 CRISTAUX',
  },
  MATCH_DES_ACCORDS: {
    mode: {
      id: 'MATCH_DES_ACCORDS',
      mode_number: 2,
      name: 'Le Match des Accords',
      inspired_by: 'Brawl Ball',
      format: '3v3',
      duration_seconds: 120,
      target_subject: 'francais',
      description: 'Envoie tes frappes dans la bonne terminaison pour marquer des buts.',
      victory_condition: 'Valider 6 accords parfaits (2 buts pédagogiques).',
    },
    objectiveTarget: 6,
    targetSpeedFactor: 1.05,
    primaryColorHex: 0xc084fc,
    accentColorHex: 0x4ade80,
    defaultSubject: 'francais',
    bannerTag: '⚽ MATCH DES ACCORDS',
  },
  INTERRO_SURPRISE: {
    mode: {
      id: 'INTERRO_SURPRISE',
      mode_number: 3,
      name: "L'Interro Surprise",
      inspired_by: 'Survivant (Showdown)',
      format: 'SOLO_10',
      duration_seconds: 150,
      description: 'Brise les cibles exactes dans la cour avant la sonnerie finale.',
      victory_condition: 'Survivre et cumuler 8 validations avant la sonnerie.',
    },
    objectiveTarget: 8,
    targetSpeedFactor: 1.15,
    primaryColorHex: 0xf97316,
    accentColorHex: 0xfacc15,
    defaultSubject: 'histoire_geo_sciences',
    bannerTag: '⚡ SURVIVANT',
  },
  CHANGEMENT_DE_SALLE: {
    mode: {
      id: 'CHANGEMENT_DE_SALLE',
      mode_number: 4,
      name: 'Changement de Salle',
      inspired_by: 'Zone Réservée (Hot Zone)',
      format: 'SOLO_COOP',
      duration_seconds: 120,
      target_subject: 'vie_au_college',
      description: 'Oriente-toi dans les couloirs et valide les bonnes salles de 6e.',
      victory_condition: 'Valider 7 orientations de salle sans faute.',
    },
    objectiveTarget: 7,
    targetSpeedFactor: 0.95,
    primaryColorHex: 0x22d3ee,
    accentColorHex: 0x38bdf8,
    defaultSubject: 'vie_au_college',
    bannerTag: '🏫 ORIENTATION 6e',
  },
  CONSEIL_DE_CLASSE: {
    mode: {
      id: 'CONSEIL_DE_CLASSE',
      mode_number: 5,
      name: 'Le Conseil de Classe',
      inspired_by: 'Combat de Boss',
      format: 'PVE_BOSS',
      duration_seconds: 150,
      description: 'Affronte le Boss en visant la bonne réponse pour briser son bouclier.',
      victory_condition: 'Infliger 10 frappes valides pour vaincre le Boss.',
    },
    objectiveTarget: 10,
    targetSpeedFactor: 1.1,
    primaryColorHex: 0xef4444,
    accentColorHex: 0xfacc15,
    defaultSubject: 'anglais',
    bannerTag: '👑 BOSS PVE',
  },
  LES_GARDIENS_DE_LA_RECRE: {
    mode: {
      id: 'LES_GARDIENS_DE_LA_RECRE',
      mode_number: 6,
      name: 'Les Gardiens de la Récré',
      inspired_by: 'Coopération Bienveillante & Prévention',
      format: '3v3',
      duration_seconds: 120,
      description: 'Dissipe les nuages de rumeurs et protège la cour avec des choix solidaires.',
      victory_condition: 'Atteindre 12 gestes protecteurs et préserver le moral de la cour.',
    },
    objectiveTarget: 12,
    targetSpeedFactor: 0.9,
    primaryColorHex: 0x38bdf8,
    accentColorHex: 0x4ade80,
    defaultSubject: 'vie_au_college',
    bannerTag: '🛡️ GARDIENS COOP',
  },
};

export const PHASER_BRAWLERS: Record<BrawlerId, IBrawler> = {
  TIMO: {
    id: 'TIMO',
    name: 'Timo',
    title: 'Le Stratège du Stade',
    archetype: "Tireur d'Élite / Mobile",
    favorite_subject: 'mathematiques',
    visual_description: 'Maillot jaune fluo, crampons dorés et ballon énergétique.',
    base_hp: 3200,
    speed_tier: 'RAPIDE',
    speed_value: 770,
    max_ammo_bars: 3,
    basic_attack: {
      name: 'Frappe Brossée',
      description: "Ballon d'énergie rapide à longue portée.",
      base_damage: 950,
      projectiles_count: 1,
      range: 540,
    },
    super_ability: {
      name: 'Tacle Pythagore',
      description: 'Sprint fulgurant qui valide instantanément la bonne cible.',
      bonus_objective_points: 2,
      duration_sec: 1.5,
    },
    gadget: {
      name: 'Vision de Jeu',
      description: 'Entoure la bonne réponse d’un halo doré pendant 4s.',
      charges_per_match: 3,
      duration_sec: 4,
    },
  },
  LEO: {
    id: 'LEO',
    name: 'Léo',
    title: "L'Alchimiste des Mots",
    archetype: 'Artilleur de Zone',
    favorite_subject: 'francais',
    visual_description: 'Capuche bleu nuit, lunettes rondes et fioles d’encre violette.',
    base_hp: 2800,
    speed_tier: 'NORMALE',
    speed_value: 720,
    max_ammo_bars: 3,
    basic_attack: {
      name: "Fiole d'Encre",
      description: 'Tir en cloche par-dessus les murets.',
      base_damage: 880,
      projectiles_count: 1,
      range: 500,
    },
    super_ability: {
      name: 'Le Grand Robert',
      description: 'Rayon correcteur + soin allié de 400 PV/s.',
      bonus_objective_points: 2,
      effect_value: 400,
      duration_sec: 6,
    },
    gadget: {
      name: 'Brouillon Propre',
      description: 'Efface une mauvaise cible de l’arène.',
      charges_per_match: 3,
      duration_sec: 1,
    },
  },
  MAYA: {
    id: 'MAYA',
    name: 'Maya',
    title: 'La Gardienne du Temps',
    archetype: 'Tank / Contrôle',
    favorite_subject: 'histoire_geo_sciences',
    visual_description: 'Veste kaki/émeraude et bouclier-boussole doré.',
    base_hp: 5200,
    speed_tier: 'NORMALE',
    speed_value: 720,
    max_ammo_bars: 3,
    basic_attack: {
      name: 'Onde Sismique',
      description: 'Cône large à courte portée.',
      base_damage: 1100,
      projectiles_count: 1,
      range: 340,
    },
    super_ability: {
      name: 'Rempart Chronologique',
      description: 'Bouclier temporel de 6000 PV et validation immédiate.',
      bonus_objective_points: 2,
      effect_value: 6000,
      duration_sec: 2.5,
    },
    gadget: {
      name: 'Boussole du CDI',
      description: 'Indique la cible exacte par une flèche dorée.',
      charges_per_match: 3,
      duration_sec: 4,
    },
  },
  ZACK: {
    id: 'ZACK',
    name: 'Zack',
    title: 'Le Geek Bilingue',
    archetype: 'Assassin Furtif',
    favorite_subject: 'anglais',
    secondary_subject: 'vie_au_college',
    visual_description: 'Casque audio néon cyan, veste teddy et rollers magnétiques.',
    base_hp: 3000,
    speed_tier: 'TRES_RAPIDE',
    speed_value: 820,
    max_ammo_bars: 3,
    basic_attack: {
      name: 'Double Beat',
      description: 'Deux salves sonores ultra-rapides en ligne droite.',
      base_damage: 520,
      projectiles_count: 2,
      range: 460,
    },
    super_ability: {
      name: 'Teleport-Bus',
      description: 'Téléportation sur la bonne cible avec bouclier 1500 PV.',
      bonus_objective_points: 2,
      effect_value: 1500,
      duration_sec: 3,
    },
    gadget: {
      name: 'Pause Récré',
      description: 'Ralentit tous les drones de l’arène de 50% pendant 3,5s.',
      charges_per_match: 3,
      duration_sec: 3.5,
    },
  },
};

export const FALLBACK_ARENA_QUESTIONS: IQuestion[] = [
  {
    id: 'PHASER_MATH_01',
    subject: 'mathematiques',
    skill_code: 'MATH_MUL',
    elo_difficulty: 950,
    hud_prompt: 'Combien font 7 × 8 ?',
    explanation_flash: 'Astuce : 7 × 8 = 56 (5, 6, 7, 8) !',
    targets: [
      { label: '56', is_correct: true },
      { label: '54', is_correct: false },
      { label: '48', is_correct: false },
      { label: '64', is_correct: false },
    ],
  },
  {
    id: 'PHASER_FR_01',
    subject: 'francais',
    skill_code: 'FR_HOMO',
    elo_difficulty: 980,
    hud_prompt: 'Les élèves ont ___ le cours.',
    explanation_flash: 'Après « ont », le participe passé prend -É : terminé !',
    targets: [
      { label: 'terminé', is_correct: true },
      { label: 'terminer', is_correct: false },
      { label: 'terminés', is_correct: false },
      { label: 'terminait', is_correct: false },
    ],
  },
  {
    id: 'PHASER_ENG_01',
    subject: 'anglais',
    skill_code: 'ENG_WH',
    elo_difficulty: 960,
    hud_prompt: 'Comment dit-on « Où » en anglais ?',
    explanation_flash: 'Where = Où, When = Quand, Who = Qui !',
    targets: [
      { label: 'Where', is_correct: true },
      { label: 'When', is_correct: false },
      { label: 'Who', is_correct: false },
      { label: 'Why', is_correct: false },
    ],
  },
  {
    id: 'PHASER_HGS_01',
    subject: 'histoire_geo_sciences',
    skill_code: 'SCI_SOL',
    elo_difficulty: 1000,
    hud_prompt: 'Planète la plus proche du Soleil ?',
    explanation_flash: 'Ordre : Mercure, Vénus, Terre, Mars…',
    targets: [
      { label: 'Mercure', is_correct: true },
      { label: 'Vénus', is_correct: false },
      { label: 'Mars', is_correct: false },
      { label: 'Jupiter', is_correct: false },
    ],
  },
  {
    id: 'PHASER_COL_01',
    subject: 'vie_au_college',
    skill_code: 'COL_EDT',
    elo_difficulty: 940,
    hud_prompt: 'Cours en Salle 204 : quel étage ?',
    explanation_flash: 'Salle 204 = 2ème étage, porte 04 !',
    targets: [
      { label: '2e étage', is_correct: true },
      { label: 'RDC', is_correct: false },
      { label: '4e étage', is_correct: false },
      { label: 'Sous-sol', is_correct: false },
    ],
  },
];

/**
 * Calcul pur des impacts de combat conforme au contrat CCTP-BC6E-2026-V2.
 */
export function computePhaserCombatImpact(input: ICombatImpactInput): ICombatImpactResult {
  if (!input.is_correct) {
    return {
      final_damage: 0,
      combo_multiplier: 1.0,
      super_charge_gain_pct: 0,
      error_penalty_damage: Math.round(0.12 * input.player_max_hp),
      trigger_explanation_flash_ms: 1200,
    };
  }

  const hits = Math.max(0, input.consecutive_correct_hits);
  const comboMultiplier = Math.min(1.6, Number((1.0 + 0.15 * hits).toFixed(2)));
  const levelFactor = 1 + 0.08 * Math.max(0, input.brawler_level - 1);
  const finalDamage = Math.round(input.base_damage * levelFactor * comboMultiplier);
  const reflexBonus = input.reaction_time_ms < 2500 ? 1 : 0;

  return {
    final_damage: finalDamage,
    combo_multiplier: comboMultiplier,
    super_charge_gain_pct: 34 + 6 * reflexBonus,
    error_penalty_damage: 0,
    trigger_explanation_flash_ms: 0,
  };
}

export class ModeRulesConnector {
  public static getRules(modeId: GameModeId): IModeArenaRules {
    return MODE_ARENA_RULES[modeId] ?? MODE_ARENA_RULES.CHASSE_AUX_BONNES_NOTES;
  }

  public static getAllModes(): IGameMode[] {
    return Object.values(MODE_ARENA_RULES).map((entry) => entry.mode);
  }

  public static getBrawler(brawlerId: BrawlerId): IBrawler {
    return PHASER_BRAWLERS[brawlerId] ?? PHASER_BRAWLERS.TIMO;
  }
}

interface IToneOptions {
  freqStart: number;
  freqEnd?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  filterFreq?: number;
}

interface INoiseOptions {
  duration: number;
  filterFreq: number;
  filterType?: BiquadFilterType;
  gain?: number;
  delay?: number;
}

/**
 * Synthétiseur Web Audio API pur (zéro fichier MP3/WAV externe).
 */
export class SoundFX {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMuted(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
  }

  public playShoot(brawlerId: BrawlerId): void {
    switch (brawlerId) {
      case 'TIMO':
        this.playTone({ freqStart: 540, freqEnd: 210, duration: 0.14, type: 'triangle', gain: 0.18 });
        this.playNoiseBurst({ duration: 0.09, filterFreq: 1800, filterType: 'bandpass', gain: 0.08 });
        break;
      case 'LEO':
        this.playTone({ freqStart: 320, freqEnd: 640, duration: 0.11, type: 'sine', gain: 0.16 });
        this.playTone({ freqStart: 640, freqEnd: 260, duration: 0.1, type: 'sine', gain: 0.12, delay: 0.07 });
        break;
      case 'MAYA':
        this.playTone({ freqStart: 195, freqEnd: 68, duration: 0.2, type: 'sawtooth', gain: 0.16, filterFreq: 520 });
        this.playNoiseBurst({ duration: 0.15, filterFreq: 420, filterType: 'lowpass', gain: 0.14 });
        break;
      case 'ZACK':
        this.playTone({ freqStart: 860, freqEnd: 420, duration: 0.08, type: 'square', gain: 0.11, filterFreq: 2400 });
        this.playTone({
          freqStart: 940,
          freqEnd: 460,
          duration: 0.08,
          type: 'square',
          gain: 0.11,
          delay: 0.065,
          filterFreq: 2600,
        });
        break;
    }
  }

  public playHitCorrect(comboCount: number): void {
    const semitone = COMBO_SEMITONES[Math.min(Math.max(0, comboCount - 1), COMBO_SEMITONES.length - 1)];
    const pitch = Math.pow(2, semitone / 12);
    this.playTone({ freqStart: 523.25 * pitch, duration: 0.11, type: 'triangle', gain: 0.16 });
    this.playTone({ freqStart: 659.25 * pitch, duration: 0.13, type: 'sine', gain: 0.15, delay: 0.05 });
    this.playTone({ freqStart: 783.99 * pitch, duration: 0.18, type: 'triangle', gain: 0.16, delay: 0.1 });
  }

  public playErrorShield(): void {
    this.playTone({ freqStart: 190, freqEnd: 92, duration: 0.24, type: 'sawtooth', gain: 0.18, filterFreq: 750 });
    this.playTone({ freqStart: 178, freqEnd: 84, duration: 0.26, type: 'square', gain: 0.12, delay: 0.03, filterFreq: 640 });
    this.playNoiseBurst({ duration: 0.18, filterFreq: 900, filterType: 'bandpass', gain: 0.13 });
  }

  public playSuperReady(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.playTone({ freqStart: freq, duration: 0.14, type: 'triangle', gain: 0.15, delay: idx * 0.055 });
    });
  }

  public playSuperCast(brawlerId: BrawlerId): void {
    const baseFreq = brawlerId === 'MAYA' ? 240 : brawlerId === 'ZACK' ? 480 : 360;
    this.playTone({ freqStart: baseFreq, freqEnd: baseFreq * 2.2, duration: 0.28, type: 'sawtooth', gain: 0.17, filterFreq: 2200 });
    this.playTone({ freqStart: 880, freqEnd: 1320, duration: 0.25, type: 'triangle', gain: 0.15, delay: 0.12 });
    this.playNoiseBurst({ duration: 0.22, filterFreq: 2400, filterType: 'highpass', gain: 0.12, delay: 0.04 });
  }

  public playGadgetCast(): void {
    this.playTone({ freqStart: 620, freqEnd: 980, duration: 0.14, type: 'sine', gain: 0.16 });
    this.playTone({ freqStart: 980, freqEnd: 1240, duration: 0.14, type: 'triangle', gain: 0.14, delay: 0.08 });
  }

  public playStarrDropTap(tapIndex: number, rarity: StarrDropRarity): void {
    const stepFactor = 1 + Math.max(0, tapIndex - 1) * 0.11;
    const rarityFactor = RARITY_PITCH_FACTOR[rarity];
    const root = 340 * stepFactor * rarityFactor;
    this.playTone({ freqStart: root, freqEnd: root * 1.35, duration: 0.14, type: 'triangle', gain: 0.18 });
    this.playTone({ freqStart: root * 1.5, duration: 0.11, type: 'sine', gain: 0.12, delay: 0.04 });
    this.playNoiseBurst({ duration: 0.07, filterFreq: 2600, filterType: 'bandpass', gain: 0.07 });
  }

  public playStarrDropReveal(rarity: StarrDropRarity): void {
    const factor = RARITY_PITCH_FACTOR[rarity];
    const chord =
      rarity === 'LEGENDAIRE'
        ? [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5]
        : rarity === 'EPIQUE'
          ? [493.88, 622.25, 739.99, 987.77]
          : rarity === 'SUPER_RARE'
            ? [440, 554.37, 659.25, 880]
            : [392, 493.88, 587.33];

    chord.forEach((freq, idx) => {
      this.playTone({
        freqStart: freq * Math.min(1.15, factor),
        duration: 0.34,
        type: idx % 2 === 0 ? 'triangle' : 'sine',
        gain: 0.15,
        delay: idx * 0.06,
      });
    });
    this.playNoiseBurst({ duration: 0.26, filterFreq: 3200, filterType: 'highpass', gain: 0.1 });
  }

  public playCountdownTick(urgent: boolean): void {
    this.playTone({
      freqStart: urgent ? 920 : 660,
      duration: urgent ? 0.09 : 0.06,
      type: 'sine',
      gain: urgent ? 0.13 : 0.08,
    });
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        return null;
      }
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private playTone(opts: IToneOptions): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(30, opts.freqStart), now);
    if (opts.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, opts.freqEnd), now + opts.duration);
    }

    const peak = opts.gain ?? 0.15;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);

    if (opts.filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(opts.filterFreq, now);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + opts.duration + 0.02);
  }

  private playNoiseBurst(opts: INoiseOptions): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.5);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }

    const now = ctx.currentTime + (opts.delay ?? 0);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.filterFreq, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.gain ?? 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + opts.duration + 0.02);
  }
}

export const soundFX = new SoundFX();
