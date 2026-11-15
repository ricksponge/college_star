import type { BrawlerId, IGameMode } from '../types/cctp';

export interface IProtectedClassmate {
  name: string;
  x: number;
  y: number;
  serenityHp: number;
  maxSerenityHp: number;
  shieldActive: boolean;
  shieldRemainingMs: number;
  shieldCooldownMs: number;
}

export interface IRumorCloud {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damageToSerenity: number;
  dissipated: boolean;
}

export interface ICoopGuardianAlly {
  brawlerId: BrawlerId;
  name: string;
  roleLabel: string;
  x: number;
  y: number;
}

export interface IGuardiansModeState {
  remainingSeconds: number;
  ally: IProtectedClassmate;
  coopAllies: ICoopGuardianAlly[];
  activeClouds: IRumorCloud[];
  cloudsDissipated: number;
  targetCloudsToWin: number;
  shieldsDeployed: number;
  scenariosResolved: number;
  solidarityScore: number;
  victory: boolean;
  finished: boolean;
  statusMessage: string;
}

export interface IGuardiansScenarioOutcome {
  dissipatedCloudId: string | null;
  serenityRestored: number;
  solidarityBonus: number;
  message: string;
}

export const MODE_GUARDIANS_OF_RECRE: Omit<IGameMode, 'id' | 'mode_number'> & {
  id: 'LES_GARDIENS_DE_LA_RECRE';
  mode_number: 6;
} = {
  id: 'LES_GARDIENS_DE_LA_RECRE',
  mode_number: 6,
  name: 'Les Gardiens de la Récré',
  inspired_by: 'Défense Coopérative Anti-Harcèlement',
  format: '3v3',
  duration_seconds: 120,
  target_subject: 'vie_au_college',
  description:
    'Mode coopératif bienveillant : protège ton camarade au centre de la cour contre les « Nuages de Rumeurs » en déployant le Bouclier de Solidarité et en résolvant les scénarios de prévention.',
  victory_condition:
    'Dissiper 12 Nuages de Rumeurs ou protéger la sérénité du camarade pendant 2 minutes.',
};

const RUMOR_CLOUD_LABELS = [
  'Moquerie',
  'Fausse Rumeur',
  'Exclusion',
  'Surnom Blessant',
  'Message Méchant',
  'Isolement',
];

const ARENA_CENTER_X = 480;
const ARENA_CENTER_Y = 320;
const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 640;
const SHIELD_DURATION_MS = 5000;
const SHIELD_COOLDOWN_MS = 9000;
const SHIELD_RADIUS = 108;
const TARGET_CLOUDS_TO_WIN = 12;

/**
 * Mode 6 Coopératif « Les Gardiens de la Récré » (Agent 18 - M8).
 * Transforme l'entraide, le témoin actif et la prévention en mécanique centrale de jeu :
 * - Un camarade au centre de la cour est entouré par ton escouade coopérative.
 * - Des « Nuages de Rumeurs » dérivent depuis les bords ; le Bouclier de Solidarité les repousse.
 * - Résoudre les scénarios de prévention dissipe les nuages et restaure la sérénité.
 */
export class GuardiansModeSession {
  public readonly config = MODE_GUARDIANS_OF_RECRE;

  private remainingSeconds: number = MODE_GUARDIANS_OF_RECRE.duration_seconds;
  private ally: IProtectedClassmate = {
    name: 'Camille',
    x: ARENA_CENTER_X,
    y: ARENA_CENTER_Y,
    serenityHp: 100,
    maxSerenityHp: 100,
    shieldActive: false,
    shieldRemainingMs: 0,
    shieldCooldownMs: 0,
  };

  private coopAllies: ICoopGuardianAlly[] = [
    {
      brawlerId: 'ZACK',
      name: 'Zack',
      roleLabel: 'Bouclier d’Empathie',
      x: ARENA_CENTER_X - 96,
      y: ARENA_CENTER_Y - 24,
    },
    {
      brawlerId: 'MAYA',
      name: 'Maya',
      roleLabel: 'Repère & Calme',
      x: ARENA_CENTER_X + 96,
      y: ARENA_CENTER_Y + 24,
    },
  ];

  private clouds: IRumorCloud[] = [];
  private cloudSeq = 0;
  private spawnTimerSec = 1.2;
  private cloudsDissipated = 0;
  private shieldsDeployed = 0;
  private scenariosResolved = 0;
  private solidarityScore = 0;
  private finished = false;
  private victory = false;
  private statusMessage =
    'Protège Camille au centre : déploie le Bouclier de Solidarité et réponds avec bienveillance !';

  constructor() {
    this.spawnRumorCloud();
    this.spawnRumorCloud();
  }

  /**
   * Déploie le Bouclier de Solidarité autour du camarade central pendant 5 secondes.
   */
  public deploySolidarityShield(): { deployed: boolean; message: string } {
    if (this.finished) {
      return { deployed: false, message: 'La partie est terminée.' };
    }
    if (this.ally.shieldActive) {
      return { deployed: false, message: 'Bouclier de Solidarité déjà actif !' };
    }
    if (this.ally.shieldCooldownMs > 0) {
      const waitSec = Math.ceil(this.ally.shieldCooldownMs / 1000);
      return {
        deployed: false,
        message: `Bouclier en recharge (${waitSec}s)...`,
      };
    }

    this.ally.shieldActive = true;
    this.ally.shieldRemainingMs = SHIELD_DURATION_MS;
    this.ally.shieldCooldownMs = SHIELD_COOLDOWN_MS;
    this.shieldsDeployed += 1;
    this.solidarityScore += 25;
    this.statusMessage = '🛡️ Bouclier de Solidarité déployé : aucun nuage ne passe !';

    return {
      deployed: true,
      message: this.statusMessage,
    };
  }

  /**
   * Résout un scénario QCM de prévention pour dissiper un Nuage de Rumeurs et soutenir l'allié.
   */
  public resolvePreventionScenario(
    isCorrect: boolean,
    targetCloudId?: string
  ): IGuardiansScenarioOutcome {
    if (this.finished) {
      return {
        dissipatedCloudId: null,
        serenityRestored: 0,
        solidarityBonus: 0,
        message: 'Mission déjà accomplie.',
      };
    }

    if (!isCorrect) {
      this.statusMessage =
        '💡 Prends le temps de relire la piste bienveillante pour repousser le nuage !';
      return {
        dissipatedCloudId: null,
        serenityRestored: 0,
        solidarityBonus: 0,
        message: this.statusMessage,
      };
    }

    this.scenariosResolved += 1;
    const active = this.clouds.filter((c) => !c.dissipated);
    let chosen: IRumorCloud | undefined;
    if (targetCloudId) {
      chosen = active.find((c) => c.id === targetCloudId);
    }
    if (!chosen && active.length > 0) {
      chosen = [...active].sort(
        (a, b) =>
          Math.hypot(a.x - this.ally.x, a.y - this.ally.y) -
          Math.hypot(b.x - this.ally.x, b.y - this.ally.y)
      )[0];
    }

    if (chosen) {
      chosen.dissipated = true;
      this.cloudsDissipated += 1;
    }

    const beforeHp = this.ally.serenityHp;
    this.ally.serenityHp = Math.min(this.ally.maxSerenityHp, this.ally.serenityHp + 12);
    const serenityRestored = this.ally.serenityHp - beforeHp;
    const solidarityBonus = 100;
    this.solidarityScore += solidarityBonus;

    if (this.cloudsDissipated >= TARGET_CLOUDS_TO_WIN) {
      this.finished = true;
      this.victory = true;
      this.statusMessage =
        '🌟 Bravo les Gardiens ! Tous les Nuages de Rumeurs ont été dissipés !';
    } else {
      this.statusMessage = chosen
        ? `✨ Nuage « ${chosen.label} » dissipé par ta réponse bienveillante !`
        : '✨ Réflexe de Gardien validé (+100 Solidarité) !';
    }

    return {
      dissipatedCloudId: chosen?.id ?? null,
      serenityRestored,
      solidarityBonus,
      message: this.statusMessage,
    };
  }

  public tick(dtSec: number): IGuardiansModeState {
    if (this.finished) {
      return this.getState();
    }

    const safeDt = Math.max(0, Math.min(0.25, dtSec));
    const dtMs = safeDt * 1000;

    this.remainingSeconds = Math.max(0, this.remainingSeconds - safeDt);

    if (this.ally.shieldActive) {
      this.ally.shieldRemainingMs = Math.max(0, this.ally.shieldRemainingMs - dtMs);
      if (this.ally.shieldRemainingMs <= 0) {
        this.ally.shieldActive = false;
      }
    }
    if (this.ally.shieldCooldownMs > 0) {
      this.ally.shieldCooldownMs = Math.max(0, this.ally.shieldCooldownMs - dtMs);
    }

    // Orbite douce des deux alliés coopératifs autour du camarade central
    const t = MODE_GUARDIANS_OF_RECRE.duration_seconds - this.remainingSeconds;
    this.coopAllies[0].x = this.ally.x + Math.cos(t * 0.9) * 92;
    this.coopAllies[0].y = this.ally.y + Math.sin(t * 0.9) * 68;
    this.coopAllies[1].x = this.ally.x + Math.cos(t * 0.9 + Math.PI) * 92;
    this.coopAllies[1].y = this.ally.y + Math.sin(t * 0.9 + Math.PI) * 68;

    this.spawnTimerSec -= safeDt;
    if (this.spawnTimerSec <= 0) {
      const activeCount = this.clouds.filter((c) => !c.dissipated).length;
      if (activeCount < 4) {
        this.spawnRumorCloud();
      }
      this.spawnTimerSec = 4.2;
    }

    for (const cloud of this.clouds) {
      if (cloud.dissipated) continue;

      cloud.x += cloud.vx * safeDt;
      cloud.y += cloud.vy * safeDt;

      const distToAlly = Math.hypot(cloud.x - this.ally.x, cloud.y - this.ally.y);
      if (this.ally.shieldActive && distToAlly <= SHIELD_RADIUS + cloud.radius) {
        cloud.dissipated = true;
        this.cloudsDissipated += 1;
        this.solidarityScore += 60;
        this.statusMessage = `🛡️ Bouclier de Solidarité : nuage « ${cloud.label} » repoussé !`;
        continue;
      }

      if (distToAlly <= 34 + cloud.radius * 0.6) {
        cloud.dissipated = true;
        this.ally.serenityHp = Math.max(0, this.ally.serenityHp - cloud.damageToSerenity);
        this.statusMessage =
          '💙 Un nuage a touché Camille : déploie le Bouclier ou réponds à un scénario !';
      }
    }

    this.clouds = this.clouds.filter((c) => !c.dissipated);

    if (this.ally.serenityHp <= 0) {
      this.finished = true;
      this.victory = false;
      this.statusMessage =
        '💙 Pause bienveillante : même quand c’est difficile, appelle les adultes relais pour t’aider !';
    } else if (this.cloudsDissipated >= TARGET_CLOUDS_TO_WIN || this.remainingSeconds <= 0) {
      this.finished = true;
      this.victory = true;
      this.statusMessage =
        '🏆 Cour protégée ! Vous êtes de vrais Gardiens de la Récré !';
    }

    return this.getState();
  }

  public spawnRumorCloud(): IRumorCloud {
    this.cloudSeq += 1;
    const edge = this.cloudSeq % 4;
    let x = 40;
    let y = 40;
    if (edge === 0) {
      x = 30;
      y = 80 + ((this.cloudSeq * 97) % (ARENA_HEIGHT - 160));
    } else if (edge === 1) {
      x = ARENA_WIDTH - 30;
      y = 80 + ((this.cloudSeq * 113) % (ARENA_HEIGHT - 160));
    } else if (edge === 2) {
      x = 120 + ((this.cloudSeq * 131) % (ARENA_WIDTH - 240));
      y = 30;
    } else {
      x = 120 + ((this.cloudSeq * 151) % (ARENA_WIDTH - 240));
      y = ARENA_HEIGHT - 30;
    }

    const dx = this.ally.x - x;
    const dy = this.ally.y - y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const speed = 38;

    const cloud: IRumorCloud = {
      id: `rumor_${this.cloudSeq}`,
      label: RUMOR_CLOUD_LABELS[(this.cloudSeq - 1) % RUMOR_CLOUD_LABELS.length],
      x,
      y,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      radius: 26,
      damageToSerenity: 15,
      dissipated: false,
    };

    this.clouds.push(cloud);
    return { ...cloud };
  }

  public getState(): IGuardiansModeState {
    return {
      remainingSeconds: Math.round(this.remainingSeconds),
      ally: { ...this.ally },
      coopAllies: this.coopAllies.map((a) => ({ ...a })),
      activeClouds: this.clouds.map((c) => ({ ...c })),
      cloudsDissipated: this.cloudsDissipated,
      targetCloudsToWin: TARGET_CLOUDS_TO_WIN,
      shieldsDeployed: this.shieldsDeployed,
      scenariosResolved: this.scenariosResolved,
      solidarityScore: this.solidarityScore,
      victory: this.victory,
      finished: this.finished,
      statusMessage: this.statusMessage,
    };
  }
}
