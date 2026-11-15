import type { BrawlerId, IEloUpdateResult, SubjectCategory } from '../types/cctp';
import { getBrawlerById } from '../entities/Brawlers';
import { getSubjectVisualMeta } from '../services/QuestionProvider';
import { soundManager } from '../services/SoundManager';
import { getCurrentTrophyRank, TROPHY_ROAD_MILESTONES } from '../ui/StarrDropModal';

export interface IPodiumTeammate {
  brawlerId: BrawlerId;
  name: string;
  scoreLabel?: string;
  isStarPlayer?: boolean;
}

export interface ISubjectEloSummary {
  subject: SubjectCategory;
  previousElo: number;
  newElo: number;
}

export interface IMatchEndPodiumOptions {
  /** Conteneur hôte (défaut : document.body) */
  container?: HTMLElement;
  /** Victoire ou fin de partie (défaut : true) */
  victory?: boolean;
  /** Nom du mode de jeu (ex : 'Chasse aux Bonnes Notes') */
  modeName?: string;
  /** Héros joué par l'utilisateur */
  playerBrawlerId: BrawlerId;
  /** Nom du joueur (défaut : 'Timo' ou nom du héros) */
  playerName?: string;
  /** Score / performance affichée sous le joueur */
  playerScoreLabel?: string;
  /** 2 alliés affichés sur les marches latérales du podium (complétés automatiquement si omis) */
  allies?: IPodiumTeammate[];
  /** Indique si le joueur reçoit le badge Joueur Star (défaut : true) */
  playerIsStarPlayer?: boolean;
  /** Trophées avant et après match */
  previousTrophies: number;
  newTrophies: number;
  /** Pièces gagnées pendant la partie */
  coinsEarned: number;
  /** Pièces totales avant match (optionnel) */
  previousCoins?: number;
  /** Étoiles de combat gagnées */
  starsEarned: number;
  /** Score d'Elo Pédagogique global avant/après match */
  previousElo: number;
  newElo: number;
  /** Matière principale évaluée pendant la partie */
  subjectCategory?: SubjectCategory;
  /** Détails Elo optionnels issus du moteur pédagogique */
  eloUpdates?: IEloUpdateResult[];
  /** Résumés de consolidation par matière optionnels */
  subjectSummaries?: ISubjectEloSummary[];
  /** Indique si un Casier Mystère (Starr Drop) vient d'être gagné */
  starrDropEarned?: boolean;
  /** Nombre de casiers gagnés (alternatif à starrDropEarned) */
  starrDropsUnlocked?: number;
  /** Durée de l'animation des compteurs en ms (défaut : 1050) */
  animationDurationMs?: number;
  /** Active les sons Web Audio (défaut : true) */
  enableSound?: boolean;
  onReplay?: () => void;
  onOpenStarrDrop?: () => void;
  onReturnCollege?: () => void;
}

const STYLE_ID = 'brawl-ux-podium-styles';

const BRAWLER_VISUALS: Record<
  BrawlerId,
  { color: string; avatarUrl: string; fallbackIcon: string }
> = {
  TIMO: { color: '#ffd426', avatarUrl: '/assets/timo.jpg', fallbackIcon: '⚽' },
  LEO: { color: '#c084fc', avatarUrl: '/assets/leo.jpg', fallbackIcon: '🧪' },
  MAYA: { color: '#4ade80', avatarUrl: '/assets/maya.jpg', fallbackIcon: '🧭' },
  ZACK: { color: '#22d3ee', avatarUrl: '/assets/zack.jpg', fallbackIcon: '🎧' },
};

const ALL_BRAWLER_IDS: readonly BrawlerId[] = ['TIMO', 'LEO', 'MAYA', 'ZACK'];

function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - clamped, 3);
}

function injectPodiumStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .brawl-ux-podium-overlay {
      position: fixed;
      inset: 0;
      z-index: 9800;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      background: radial-gradient(circle at 50% 30%, rgba(38, 60, 158, 0.86) 0%, rgba(6, 9, 24, 0.96) 76%);
      backdrop-filter: blur(7px);
      font-family: var(--brawl-font-ui, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif);
      color: #f8fafc;
    }

    .brawl-ux-podium-panel {
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
      width: min(640px, 96vw);
      max-height: 94dvh;
      padding: 20px 20px 18px;
      border-radius: 24px;
      border: 3.5px solid var(--brawl-ink, #090d16);
      background: linear-gradient(180deg, #1b2961 0%, #0d1433 100%);
      box-shadow: 0 9px 0 var(--brawl-ink, #090d16), 0 26px 64px rgba(0, 0, 0, 0.8);
      animation: brawl-ux-podium-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
      box-sizing: border-box;
    }

    .brawl-ux-podium-panel * {
      box-sizing: border-box;
    }

    .brawl-ux-podium-rays {
      position: absolute;
      left: 50%;
      top: 120px;
      width: 520px;
      height: 520px;
      margin-left: -260px;
      margin-top: -260px;
      border-radius: 999px;
      pointer-events: none;
      background: repeating-conic-gradient(
        from 0deg,
        rgba(255, 212, 38, 0.24) 0deg 10deg,
        transparent 10deg 22deg
      );
      -webkit-mask-image: radial-gradient(circle, rgba(0, 0, 0, 1) 15%, rgba(0, 0, 0, 0.5) 48%, transparent 72%);
      mask-image: radial-gradient(circle, rgba(0, 0, 0, 1) 15%, rgba(0, 0, 0, 0.5) 48%, transparent 72%);
      animation: brawl-ux-podium-spin 16s linear infinite;
    }

    .brawl-ux-podium-inner {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .brawl-ux-podium-header {
      text-align: center;
    }

    .brawl-ux-podium-title {
      margin: 0;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: clamp(24px, 4vw, 34px);
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      text-shadow:
        -2px -2px 0 #090d16,
        2px -2px 0 #090d16,
        -2px 2px 0 #090d16,
        2px 2px 0 #090d16,
        0 5px 0 #090d16;
    }

    .brawl-ux-podium-subtitle {
      margin-top: 3px;
      font-size: 12px;
      font-weight: 800;
      color: #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    /* Stage Podium 2.5D */
    .brawl-ux-podium-stage {
      display: grid;
      grid-template-columns: 1fr 1.18fr 1fr;
      align-items: end;
      gap: 10px;
      padding: 18px 8px 4px;
      perspective: 720px;
    }

    .brawl-ux-podium-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }

    .brawl-ux-star-badge-wrap {
      position: relative;
      margin-bottom: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .brawl-ux-star-badge-rays {
      position: absolute;
      inset: -16px -18px;
      border-radius: 999px;
      pointer-events: none;
      background: repeating-conic-gradient(
        from 0deg,
        rgba(255, 212, 38, 0.55) 0deg 14deg,
        transparent 14deg 28deg
      );
      -webkit-mask-image: radial-gradient(circle, rgba(0, 0, 0, 1) 25%, transparent 72%);
      mask-image: radial-gradient(circle, rgba(0, 0, 0, 1) 25%, transparent 72%);
      animation: brawl-ux-podium-spin 7s linear infinite;
    }

    .brawl-ux-star-badge {
      position: relative;
      z-index: 1;
      padding: 4px 10px;
      border-radius: 999px;
      border: 2.5px solid #090d16;
      background: linear-gradient(180deg, #fff176 0%, #ffd426 52%, #f59e0b 100%);
      color: #1c1200;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 10.5px;
      font-weight: 900;
      letter-spacing: 0.04em;
      white-space: nowrap;
      box-shadow: 0 3px 0 #090d16, 0 0 18px rgba(255, 212, 38, 0.65);
      animation: brawl-ux-star-pulse 1.5s ease-in-out infinite;
    }

    .brawl-ux-podium-avatar {
      width: 66px;
      height: 66px;
      border-radius: 999px;
      border: 3.5px solid #090d16;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 35% 30%, #3b57b8 0%, #141e4d 100%);
      box-shadow: 0 4px 0 #090d16;
      margin-bottom: -10px;
      position: relative;
      z-index: 2;
    }

    .brawl-ux-podium-slot.is-center .brawl-ux-podium-avatar {
      width: 80px;
      height: 80px;
    }

    .brawl-ux-podium-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .brawl-ux-podium-avatar-fallback {
      font-size: 30px;
      line-height: 1;
    }

    .brawl-ux-podium-block {
      width: 100%;
      border-radius: 14px 14px 10px 10px;
      border: 3px solid #090d16;
      padding: 16px 8px 10px;
      text-align: center;
      position: relative;
      transform: rotateX(8deg);
      transform-origin: bottom center;
      box-shadow: 0 7px 0 #090d16, 0 12px 22px rgba(0, 0, 0, 0.5);
    }

    .brawl-ux-podium-block::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 10px;
      border-radius: 11px 11px 0 0;
      background: rgba(255, 255, 255, 0.24);
    }

    .brawl-ux-podium-block.rank-1 {
      min-height: 92px;
      background: linear-gradient(180deg, #f59e0b 0%, #b45309 55%, #78350f 100%);
    }

    .brawl-ux-podium-block.rank-2 {
      min-height: 70px;
      background: linear-gradient(180deg, #38bdf8 0%, #0369a1 60%, #1e3a8a 100%);
    }

    .brawl-ux-podium-block.rank-3 {
      min-height: 58px;
      background: linear-gradient(180deg, #64748b 0%, #334155 60%, #1e293b 100%);
    }

    .brawl-ux-podium-rank {
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 16px;
      font-weight: 900;
      color: #ffffff;
      text-shadow: 0 2px 0 #090d16;
    }

    .brawl-ux-podium-name {
      margin-top: 2px;
      font-weight: 900;
      font-size: 13px;
      color: #ffffff;
      text-shadow: 0 1.5px 0 #090d16;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .brawl-ux-podium-hero {
      font-size: 10.5px;
      font-weight: 800;
      color: #fef08a;
      opacity: 0.95;
    }

    /* Counters Grid */
    .brawl-ux-counters-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 9px;
    }

    @media (max-width: 560px) {
      .brawl-ux-counters-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    .brawl-ux-counter-tile {
      padding: 10px 8px;
      border-radius: 14px;
      border: 2.5px solid #090d16;
      background: linear-gradient(180deg, #1b2861 0%, #10173b 100%);
      box-shadow: 0 4px 0 #090d16, inset 0 2px 0 rgba(255, 255, 255, 0.14);
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
    }

    .brawl-ux-counter-val {
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 19px;
      font-weight: 900;
      line-height: 1.1;
      text-shadow: 0 2px 0 #090d16;
    }

    .brawl-ux-counter-delta {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 900;
      background: rgba(56, 229, 77, 0.18);
      border: 1px solid rgba(56, 229, 77, 0.55);
      color: #86efac;
    }

    .brawl-ux-counter-delta.is-consolidation {
      background: rgba(56, 189, 248, 0.18);
      border-color: rgba(56, 189, 248, 0.55);
      color: #bae6fd;
    }

    .brawl-ux-counter-label {
      font-size: 11px;
      font-weight: 800;
      color: #cbd5e1;
    }

    /* Route vers la 6ème bar */
    .brawl-ux-road-card {
      padding: 10px 12px;
      border-radius: 15px;
      border: 2.5px solid #090d16;
      background: rgba(11, 17, 42, 0.92);
      box-shadow: 0 4px 0 #090d16;
    }

    .brawl-ux-road-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 7px;
      font-size: 12px;
      font-weight: 900;
    }

    .brawl-ux-road-track {
      height: 12px;
      border-radius: 999px;
      background: #080d22;
      border: 2px solid #090d16;
      overflow: hidden;
    }

    .brawl-ux-road-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #22b8ff 0%, #38e54d 55%, #ffd426 100%);
    }

    .brawl-ux-elo-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
    }

    .brawl-ux-elo-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 9px;
      border-radius: 999px;
      border: 1.5px solid rgba(255, 255, 255, 0.22);
      background: rgba(15, 23, 42, 0.8);
      font-size: 11px;
      font-weight: 800;
    }

    /* Actions */
    .brawl-ux-podium-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
      gap: 10px;
      margin-top: 2px;
    }

    .brawl-ux-podium-btn {
      padding: 12px 14px;
      border-radius: 15px;
      border: 3px solid #090d16;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 13.5px;
      font-weight: 900;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 5px 0 #090d16, inset 0 2px 0 rgba(255, 255, 255, 0.35);
      transition: transform 0.1s ease, filter 0.12s ease;
      touch-action: manipulation;
    }

    .brawl-ux-podium-btn:hover {
      filter: brightness(1.07);
      transform: translateY(-1px);
    }

    .brawl-ux-podium-btn:active {
      transform: translateY(3px);
      box-shadow: 0 2px 0 #090d16;
    }

    .brawl-ux-podium-btn.is-yellow {
      background: linear-gradient(180deg, #ffe75e 0%, #ffc814 55%, #f59e0b 100%);
      color: #1c1200;
    }

    .brawl-ux-podium-btn.is-purple {
      background: linear-gradient(180deg, #d896ff 0%, #9333ea 55%, #6b21a8 100%);
      color: #ffffff;
      animation: brawl-ux-star-pulse 1.4s ease-in-out infinite;
    }

    .brawl-ux-podium-btn.is-blue {
      background: linear-gradient(180deg, #56d4ff 0%, #0ea5e9 55%, #0369a1 100%);
      color: #ffffff;
    }

    @keyframes brawl-ux-podium-in {
      from { opacity: 0; transform: scale(0.88); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes brawl-ux-podium-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes brawl-ux-star-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.045); }
    }

    @media (prefers-reduced-motion: reduce) {
      .brawl-ux-podium-panel,
      .brawl-ux-podium-rays,
      .brawl-ux-star-badge-rays,
      .brawl-ux-star-badge,
      .brawl-ux-podium-btn.is-purple {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Écran de victoire / fin de match style Brawl Stars :
 * - Podium 2.5D à 3 joueurs (joueur + 2 alliés) avec badge animé « ⭐ JOUEUR STAR ⭐ » et rayons rotatifs.
 * - Compteurs animés par requestAnimationFrame (easeOutCubic) : Trophées, Route vers la 6ème, Pièces, Étoiles & Elo.
 * - Actions : Rejouer, Ouvrir Casier (si Starr Drop gagné), Retour Collège.
 */
export class MatchEndPodium {
  private readonly options: IMatchEndPodiumOptions;
  private readonly container: HTMLElement;
  private overlayEl: HTMLDivElement | null = null;
  private rafId: number | null = null;
  private destroyed = false;

  private trophiesValEl: HTMLElement | null = null;
  private coinsValEl: HTMLElement | null = null;
  private starsValEl: HTMLElement | null = null;
  private eloValEl: HTMLElement | null = null;
  private roadFillEl: HTMLElement | null = null;
  private roadLabelEl: HTMLElement | null = null;

  constructor(options: IMatchEndPodiumOptions) {
    this.options = options;
    this.container = options.container ?? document.body;
  }

  public show(): void {
    if (this.destroyed) {
      return;
    }
    this.cleanupAnimationAndDom();
    injectPodiumStyles();

    const victory = this.options.victory !== false;
    if (this.options.enableSound !== false) {
      soundManager.playMatchEnd(victory);
    }

    this.renderOverlay(victory);
    this.startCounterAnimations();
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.cleanupAnimationAndDom();
  }

  private renderOverlay(victory: boolean): void {
    const overlay = document.createElement('div');
    overlay.className = 'brawl-ux-podium-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', victory ? 'Podium de victoire' : 'Fin de partie');

    const panel = document.createElement('div');
    panel.className = 'brawl-ux-podium-panel';

    if (victory) {
      const rays = document.createElement('div');
      rays.className = 'brawl-ux-podium-rays';
      panel.appendChild(rays);
    }

    const inner = document.createElement('div');
    inner.className = 'brawl-ux-podium-inner';

    // Header
    const header = document.createElement('div');
    header.className = 'brawl-ux-podium-header';

    const title = document.createElement('h2');
    title.className = 'brawl-ux-podium-title';
    title.style.color = victory ? '#ffd426' : '#38bdf8';
    title.textContent = victory ? '🏆 VICTOIRE !' : '📘 FIN DE PARTIE';
    header.appendChild(title);

    if (this.options.modeName) {
      const sub = document.createElement('div');
      sub.className = 'brawl-ux-podium-subtitle';
      sub.textContent = this.options.modeName;
      header.appendChild(sub);
    }
    inner.appendChild(header);

    // Podium 3 joueurs (Allié gauche #2, Joueur centre #1, Allié droit #3)
    const stage = this.buildPodiumStage();
    inner.appendChild(stage);

    // Compteurs animés (Trophées, Pièces, Étoiles, Elo)
    const countersGrid = this.buildCountersGrid();
    inner.appendChild(countersGrid);

    // Route vers la 6ème
    const roadCard = this.buildTrophyRoadCard();
    inner.appendChild(roadCard);

    // Chips d'Elo / consolidation par matière si fournis
    const eloChips = this.buildEloChips();
    if (eloChips) {
      inner.appendChild(eloChips);
    }

    // Boutons d'action
    const actions = this.buildActionButtons();
    inner.appendChild(actions);

    panel.appendChild(inner);
    overlay.appendChild(panel);

    this.overlayEl = overlay;
    this.container.appendChild(overlay);
  }

  private buildPodiumStage(): HTMLElement {
    const stage = document.createElement('div');
    stage.className = 'brawl-ux-podium-stage';

    const allies = this.resolveAllies();
    const playerBrawler = getBrawlerById(this.options.playerBrawlerId);
    const playerIsStar = this.options.playerIsStarPlayer !== false &&
      !allies.some((a) => a.isStarPlayer);

    const playerSlotData: IPodiumTeammate = {
      brawlerId: this.options.playerBrawlerId,
      name: this.options.playerName ?? playerBrawler.name,
      scoreLabel: this.options.playerScoreLabel,
      isStarPlayer: playerIsStar,
    };

    const slots: Array<{
      data: IPodiumTeammate;
      rankClass: 'rank-1' | 'rank-2' | 'rank-3';
      rankLabel: string;
      isCenter: boolean;
    }> = [
      { data: allies[0], rankClass: 'rank-2', rankLabel: '#2', isCenter: false },
      { data: playerSlotData, rankClass: 'rank-1', rankLabel: '#1', isCenter: true },
      { data: allies[1], rankClass: 'rank-3', rankLabel: '#3', isCenter: false },
    ];

    for (const slot of slots) {
      const slotEl = document.createElement('div');
      slotEl.className = `brawl-ux-podium-slot${slot.isCenter ? ' is-center' : ''}`;

      if (slot.data.isStarPlayer) {
        const badgeWrap = document.createElement('div');
        badgeWrap.className = 'brawl-ux-star-badge-wrap';

        const badgeRays = document.createElement('div');
        badgeRays.className = 'brawl-ux-star-badge-rays';

        const badge = document.createElement('div');
        badge.className = 'brawl-ux-star-badge';
        badge.textContent = '⭐ JOUEUR STAR ⭐';

        badgeWrap.appendChild(badgeRays);
        badgeWrap.appendChild(badge);
        slotEl.appendChild(badgeWrap);
      }

      const visual = BRAWLER_VISUALS[slot.data.brawlerId];
      const brawlerMeta = getBrawlerById(slot.data.brawlerId);

      const avatar = document.createElement('div');
      avatar.className = 'brawl-ux-podium-avatar';
      avatar.style.boxShadow = `0 4px 0 #090d16, inset 0 0 0 3px ${visual.color}`;

      const fallback = document.createElement('span');
      fallback.className = 'brawl-ux-podium-avatar-fallback';
      fallback.textContent = visual.fallbackIcon;
      fallback.style.display = 'none';

      const img = document.createElement('img');
      img.src = visual.avatarUrl;
      img.alt = brawlerMeta.name;
      img.addEventListener('error', () => {
        img.style.display = 'none';
        fallback.style.display = 'inline';
      });

      avatar.appendChild(img);
      avatar.appendChild(fallback);

      const block = document.createElement('div');
      block.className = `brawl-ux-podium-block ${slot.rankClass}`;

      const rankEl = document.createElement('div');
      rankEl.className = 'brawl-ux-podium-rank';
      rankEl.textContent = slot.rankLabel;

      const nameEl = document.createElement('div');
      nameEl.className = 'brawl-ux-podium-name';
      nameEl.textContent = slot.data.name;

      const heroEl = document.createElement('div');
      heroEl.className = 'brawl-ux-podium-hero';
      heroEl.textContent = slot.data.scoreLabel
        ? `${brawlerMeta.name} • ${slot.data.scoreLabel}`
        : brawlerMeta.name;

      block.appendChild(rankEl);
      block.appendChild(nameEl);
      block.appendChild(heroEl);

      slotEl.appendChild(avatar);
      slotEl.appendChild(block);
      stage.appendChild(slotEl);
    }

    return stage;
  }

  private buildCountersGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'brawl-ux-counters-grid';

    const trophyDelta = this.options.newTrophies - this.options.previousTrophies;
    const eloDelta = Math.round(this.options.newElo - this.options.previousElo);

    // 1. Trophées
    const trophyTile = this.createCounterTile(
      `${this.options.previousTrophies}`,
      trophyDelta >= 0 ? `+${trophyDelta} 🏆` : `${trophyDelta} 🏆`,
      'Trophées',
      '#ffd426',
      false
    );
    this.trophiesValEl = trophyTile.valEl;

    // 2. Pièces
    const coinsBase = this.options.previousCoins ?? 0;
    const coinsTile = this.createCounterTile(
      this.options.previousCoins !== undefined ? `${coinsBase}` : '+0',
      `+${this.options.coinsEarned} 🪙`,
      'Pièces',
      '#fbbf24',
      false
    );
    this.coinsValEl = coinsTile.valEl;

    // 3. Étoiles de combat
    const starsTile = this.createCounterTile(
      '+0',
      `+${this.options.starsEarned} ⭐`,
      'Étoiles Combat',
      '#38bdf8',
      false
    );
    this.starsValEl = starsTile.valEl;

    // 4. Score Elo Pédagogique
    const subjectLabel = this.options.subjectCategory
      ? `Elo ${getSubjectVisualMeta(this.options.subjectCategory).short_label}`
      : 'Elo Pédagogique';
    const eloDeltaText =
      eloDelta > 0 ? `+${eloDelta} Elo` : 'Consolidation';
    const eloTile = this.createCounterTile(
      `${Math.round(this.options.previousElo)}`,
      eloDeltaText,
      subjectLabel,
      eloDelta >= 0 ? '#4ade80' : '#38bdf8',
      eloDelta <= 0
    );
    this.eloValEl = eloTile.valEl;

    grid.appendChild(trophyTile.tile);
    grid.appendChild(coinsTile.tile);
    grid.appendChild(starsTile.tile);
    grid.appendChild(eloTile.tile);

    return grid;
  }

  private createCounterTile(
    initialValue: string,
    deltaText: string,
    labelText: string,
    valueColor: string,
    isConsolidation: boolean
  ): { tile: HTMLElement; valEl: HTMLElement } {
    const tile = document.createElement('div');
    tile.className = 'brawl-ux-counter-tile';

    const valEl = document.createElement('div');
    valEl.className = 'brawl-ux-counter-val';
    valEl.style.color = valueColor;
    valEl.textContent = initialValue;

    const deltaEl = document.createElement('span');
    deltaEl.className = `brawl-ux-counter-delta${isConsolidation ? ' is-consolidation' : ''}`;
    deltaEl.textContent = deltaText;

    const labelEl = document.createElement('div');
    labelEl.className = 'brawl-ux-counter-label';
    labelEl.textContent = labelText;

    tile.appendChild(valEl);
    tile.appendChild(deltaEl);
    tile.appendChild(labelEl);

    return { tile, valEl };
  }

  private buildTrophyRoadCard(): HTMLElement {
    const maxTrophies = TROPHY_ROAD_MILESTONES[TROPHY_ROAD_MILESTONES.length - 1]?.trophies ?? 1000;
    const rank = getCurrentTrophyRank(this.options.newTrophies);
    const startPct = Math.min(100, Math.max(0, (this.options.previousTrophies / maxTrophies) * 100));

    const card = document.createElement('div');
    card.className = 'brawl-ux-road-card';

    const head = document.createElement('div');
    head.className = 'brawl-ux-road-head';

    const title = document.createElement('span');
    title.style.color = '#ffd426';
    title.textContent = `🛣️ Route vers la 6ème — ${rank.title}`;

    const label = document.createElement('span');
    label.style.color = '#e2e8f0';
    label.textContent = `${this.options.previousTrophies} / ${maxTrophies} 🏆`;
    this.roadLabelEl = label;

    head.appendChild(title);
    head.appendChild(label);

    const track = document.createElement('div');
    track.className = 'brawl-ux-road-track';

    const fill = document.createElement('div');
    fill.className = 'brawl-ux-road-fill';
    fill.style.width = `${startPct}%`;
    this.roadFillEl = fill;

    track.appendChild(fill);
    card.appendChild(head);
    card.appendChild(track);

    return card;
  }

  private buildEloChips(): HTMLElement | null {
    const chips: Array<{ text: string; color: string }> = [];

    if (this.options.subjectSummaries) {
      for (const summary of this.options.subjectSummaries) {
        const meta = getSubjectVisualMeta(summary.subject);
        const diff = Math.round(summary.newElo - summary.previousElo);
        const tag = diff > 0 ? `+${diff} Elo` : 'À consolider';
        chips.push({
          text: `${meta.icon} ${meta.short_label} : ${Math.round(summary.newElo)} (${tag})`,
          color: meta.accent_color,
        });
      }
    }

    if (this.options.eloUpdates && this.options.eloUpdates.length > 0) {
      for (const upd of this.options.eloUpdates.slice(0, 3)) {
        const diff = Math.round(upd.new_elo - upd.previous_elo);
        const tag = diff >= 0 ? `+${diff}` : `${diff}`;
        chips.push({
          text: `${upd.skill_code} : ${Math.round(upd.new_elo)} (${tag})`,
          color: diff >= 0 ? '#4ade80' : '#38bdf8',
        });
      }
    }

    if (chips.length === 0) {
      return null;
    }

    const wrap = document.createElement('div');
    wrap.className = 'brawl-ux-elo-chips';

    for (const chip of chips) {
      const el = document.createElement('span');
      el.className = 'brawl-ux-elo-chip';
      el.style.borderColor = chip.color;
      el.style.color = chip.color;
      el.textContent = chip.text;
      wrap.appendChild(el);
    }

    return wrap;
  }

  private buildActionButtons(): HTMLElement {
    const actions = document.createElement('div');
    actions.className = 'brawl-ux-podium-actions';

    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.className = 'brawl-ux-podium-btn is-yellow';
    replayBtn.textContent = '🔄 Rejouer';
    replayBtn.addEventListener('click', () => {
      this.destroy();
      this.options.onReplay?.();
    });
    actions.appendChild(replayBtn);

    const hasStarrDrop =
      Boolean(this.options.starrDropEarned) ||
      (this.options.starrDropsUnlocked ?? 0) > 0;

    if (hasStarrDrop) {
      const dropBtn = document.createElement('button');
      dropBtn.type = 'button';
      dropBtn.className = 'brawl-ux-podium-btn is-purple';
      dropBtn.textContent = '🎁 Ouvrir Casier';
      dropBtn.addEventListener('click', () => {
        this.destroy();
        this.options.onOpenStarrDrop?.();
      });
      actions.appendChild(dropBtn);
    }

    const returnBtn = document.createElement('button');
    returnBtn.type = 'button';
    returnBtn.className = 'brawl-ux-podium-btn is-blue';
    returnBtn.textContent = '🏫 Retour Collège';
    returnBtn.addEventListener('click', () => {
      this.destroy();
      this.options.onReturnCollege?.();
    });
    actions.appendChild(returnBtn);

    return actions;
  }

  private startCounterAnimations(): void {
    const maxTrophies = TROPHY_ROAD_MILESTONES[TROPHY_ROAD_MILESTONES.length - 1]?.trophies ?? 1000;
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const duration = reduceMotion
      ? 0
      : Math.max(0, this.options.animationDurationMs ?? 1050);

    const applyProgress = (rawProgress: number): void => {
      const eased = easeOutCubic(rawProgress);

      const curTrophies = Math.round(
        this.options.previousTrophies +
          (this.options.newTrophies - this.options.previousTrophies) * eased
      );
      if (this.trophiesValEl) {
        this.trophiesValEl.textContent = `${curTrophies}`;
      }

      if (this.coinsValEl) {
        if (this.options.previousCoins !== undefined) {
          const curCoins = Math.round(
            this.options.previousCoins + this.options.coinsEarned * eased
          );
          this.coinsValEl.textContent = `${curCoins}`;
        } else {
          const curGain = Math.round(this.options.coinsEarned * eased);
          this.coinsValEl.textContent = `+${curGain}`;
        }
      }

      if (this.starsValEl) {
        const curStars = Math.round(this.options.starsEarned * eased);
        this.starsValEl.textContent = `+${curStars}`;
      }

      const curElo = Math.round(
        this.options.previousElo +
          (this.options.newElo - this.options.previousElo) * eased
      );
      if (this.eloValEl) {
        this.eloValEl.textContent = `${curElo}`;
      }

      const pct = Math.min(100, Math.max(0, (curTrophies / maxTrophies) * 100));
      if (this.roadFillEl) {
        this.roadFillEl.style.width = `${pct.toFixed(1)}%`;
      }
      if (this.roadLabelEl) {
        this.roadLabelEl.textContent = `${curTrophies} / ${maxTrophies} 🏆`;
      }
    };

    if (duration === 0 || typeof requestAnimationFrame === 'undefined') {
      applyProgress(1);
      return;
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tick = (now: number): void => {
      if (this.destroyed) {
        return;
      }
      const progress = Math.min(1, Math.max(0, (now - startTime) / duration));
      applyProgress(progress);
      if (progress < 1) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private resolveAllies(): [IPodiumTeammate, IPodiumTeammate] {
    const provided = this.options.allies ?? [];
    const fallbackIds = ALL_BRAWLER_IDS.filter((id) => id !== this.options.playerBrawlerId);

    const buildFallback = (idx: number): IPodiumTeammate => {
      const id = fallbackIds[idx % fallbackIds.length] ?? 'MAYA';
      const brawler = getBrawlerById(id);
      return {
        brawlerId: id,
        name: brawler.name,
        isStarPlayer: false,
      };
    };

    const left = provided[0] ?? buildFallback(0);
    const right = provided[1] ?? buildFallback(1);
    return [left, right];
  }

  private cleanupAnimationAndDom(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.overlayEl?.remove();
    this.overlayEl = null;
    this.trophiesValEl = null;
    this.coinsValEl = null;
    this.starsValEl = null;
    this.eloValEl = null;
    this.roadFillEl = null;
    this.roadLabelEl = null;
  }
}
