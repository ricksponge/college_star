import type { BrawlerId, GameModeId, IBrawler, IGameMode } from '../types/cctp';

export type CountdownStep = 'VERSUS' | '3' | '2' | '1' | 'BRAWL' | 'DONE';

export interface IExamSquadOpponent {
  name: string;
  title: string;
  icon: string;
  accentColor: string;
  powerRating: number;
}

export interface IVersusIntroOptions {
  container: HTMLElement;
  brawler: IBrawler;
  brawlerLevel?: number;
  mode: IGameMode;
  playerName?: string;
  opponents?: IExamSquadOpponent[];
  versusHoldMs?: number;
  countdownStepMs?: number;
  onCountdownStep?: (step: CountdownStep) => void;
  onComplete?: () => void;
}

const STYLE_ELEMENT_ID = 'bc-versus-intro-styles';

const BRAWLER_ACCENTS: Record<BrawlerId, { bg: string; badge: string; icon: string }> = {
  TIMO: { bg: '#ca8a04', badge: '#facc15', icon: '⚽' },
  LEO: { bg: '#6d28d9', badge: '#c084fc', icon: '🖋️' },
  MAYA: { bg: '#047857', badge: '#4ade80', icon: '🧭' },
  ZACK: { bg: '#0e7490', badge: '#22d3ee', icon: '🎧' },
};

const DEFAULT_MODE_SQUADS: Record<GameModeId, IExamSquadOpponent[]> = {
  CHASSE_AUX_BONNES_NOTES: [
    { name: 'Drone Fraction', title: 'Gardien du Puits', icon: '💎', accentColor: '#ef4444', powerRating: 1020 },
    { name: 'Bot Chrono', title: 'Rival Calcul', icon: '⏱️', accentColor: '#f97316', powerRating: 990 },
    { name: 'Spectre Piège', title: 'Leurre Optique', icon: '🤖', accentColor: '#e11d48', powerRating: 1010 },
  ],
  MATCH_DES_ACCORDS: [
    { name: 'Capitaine -ER', title: 'Défenseur Infinitif', icon: '🥅', accentColor: '#ef4444', powerRating: 1030 },
    { name: 'Gardien -É', title: 'Mur Participe', icon: '🧤', accentColor: '#f97316', powerRating: 1005 },
    { name: 'Arbitre Orthographe', title: 'Sifflet d’Accord', icon: '⚽', accentColor: '#dc2626', powerRating: 1040 },
  ],
  INTERRO_SURPRISE: [
    { name: 'Sonnerie Finale', title: 'Pression du Temps', icon: '🔔', accentColor: '#ef4444', powerRating: 1050 },
    { name: 'Escouade 9 Rivaux', title: 'Cour du Collège', icon: '⚡', accentColor: '#f97316', powerRating: 1020 },
  ],
  CHANGEMENT_DE_SALLE: [
    { name: 'Bavardage Express', title: 'Frein de Couloir', icon: '💬', accentColor: '#f97316', powerRating: 980 },
    { name: 'Piège Salle 404', title: 'Fausse Porte', icon: '🚪', accentColor: '#ef4444', powerRating: 1015 },
  ],
  CONSEIL_DE_CLASSE: [
    { name: 'Giga-Fraction', title: 'Boss du Conseil', icon: '👑', accentColor: '#dc2626', powerRating: 1250 },
    { name: 'Mur Laser', title: 'Épreuve Ultime', icon: '🔺', accentColor: '#f97316', powerRating: 1180 },
  ],
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Écran Versus diagonal d'avant-match suivi du décompte animé « 3... 2... 1... BRAWL ! »
 * (Agent 14 - Cinématiques & Game Director).
 */
export class VersusIntroOverlay {
  private rootEl: HTMLElement | null = null;
  private timers: number[] = [];
  private activeResolve: (() => void) | null = null;
  private skippedOrFinished = false;

  public getDefaultSquad(modeId: GameModeId): IExamSquadOpponent[] {
    return (DEFAULT_MODE_SQUADS[modeId] ?? DEFAULT_MODE_SQUADS.CHASSE_AUX_BONNES_NOTES).map(
      (item) => ({ ...item })
    );
  }

  public play(options: IVersusIntroOptions): Promise<void> {
    this.destroy();
    this.skippedOrFinished = false;
    this.ensureStyles();

    const versusHoldMs = Math.max(250, options.versusHoldMs ?? 1150);
    const stepMs = Math.max(180, options.countdownStepMs ?? 520);
    const level = Math.max(1, options.brawlerLevel ?? 1);
    const playerName = (options.playerName ?? options.brawler.name).trim() || options.brawler.name;
    const theme = BRAWLER_ACCENTS[options.brawler.id];
    const opponents =
      options.opponents && options.opponents.length > 0
        ? options.opponents
        : this.getDefaultSquad(options.mode.id);

    const overlay = document.createElement('div');
    overlay.className = 'bc-versus-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Présentation du match');

    const opponentsHtml = opponents
      .slice(0, 3)
      .map(
        (opp) => `
        <div class="bc-versus-opponent-card">
          <span class="bc-versus-opp-icon">${escapeHtml(opp.icon)}</span>
          <div>
            <div class="bc-versus-opp-name">${escapeHtml(opp.name)}</div>
            <div class="bc-versus-opp-title">${escapeHtml(opp.title)} • ${opp.powerRating}⚡</div>
          </div>
        </div>
      `
      )
      .join('');

    overlay.innerHTML = `
      <div class="bc-versus-half bc-versus-left" style="--hero-bg:${theme.bg};--hero-accent:${theme.badge};">
        <div class="bc-versus-kicker">ÉLÈVE-HÉROS • NIV.${level}</div>
        <div class="bc-versus-hero-avatar">${theme.icon}</div>
        <div class="bc-versus-hero-name">${escapeHtml(playerName.toUpperCase())}</div>
        <div class="bc-versus-hero-sub">${escapeHtml(options.brawler.name)} — ${escapeHtml(options.brawler.title)}</div>
      </div>
      <div class="bc-versus-half bc-versus-right">
        <div class="bc-versus-kicker">${escapeHtml(options.mode.name.toUpperCase())} (${escapeHtml(options.mode.format)})</div>
        <div class="bc-versus-squad-list">${opponentsHtml}</div>
      </div>
      <div class="bc-versus-slash"></div>
      <div class="bc-versus-center-badge" data-versus-badge="true">VS</div>
      <button type="button" class="bc-versus-skip-btn" data-versus-skip="true">Passer ⏭</button>
    `;

    options.container.appendChild(overlay);
    this.rootEl = overlay;

    const badgeEl = overlay.querySelector<HTMLElement>('[data-versus-badge]');
    const skipBtn = overlay.querySelector<HTMLButtonElement>('[data-versus-skip]');

    return new Promise<void>((resolve) => {
      this.activeResolve = () => {
        if (this.skippedOrFinished) return;
        this.skippedOrFinished = true;
        this.clearTimers();
        this.removeOverlay();
        options.onCountdownStep?.('DONE');
        options.onComplete?.();
        resolve();
      };

      if (skipBtn) {
        skipBtn.addEventListener('click', () => {
          this.skip();
        });
      }

      options.onCountdownStep?.('VERSUS');

      const steps: Array<{ step: Exclude<CountdownStep, 'VERSUS' | 'DONE'>; delay: number }> = [
        { step: '3', delay: versusHoldMs },
        { step: '2', delay: versusHoldMs + stepMs },
        { step: '1', delay: versusHoldMs + stepMs * 2 },
        { step: 'BRAWL', delay: versusHoldMs + stepMs * 3 },
      ];

      for (const item of steps) {
        const id = window.setTimeout(() => {
          if (this.skippedOrFinished || !badgeEl) return;
          badgeEl.textContent = item.step === 'BRAWL' ? 'BRAWL !' : item.step;
          badgeEl.classList.remove('bc-versus-pop', 'bc-versus-brawl');
          void badgeEl.offsetWidth;
          badgeEl.classList.add('bc-versus-pop');
          if (item.step === 'BRAWL') {
            badgeEl.classList.add('bc-versus-brawl');
          }
          options.onCountdownStep?.(item.step);
        }, item.delay);
        this.timers.push(id);
      }

      const endTimer = window.setTimeout(() => {
        this.activeResolve?.();
      }, versusHoldMs + stepMs * 4);
      this.timers.push(endTimer);
    });
  }

  public skip(): void {
    this.activeResolve?.();
  }

  public destroy(): void {
    this.clearTimers();
    this.removeOverlay();
    this.activeResolve = null;
  }

  private clearTimers(): void {
    for (const id of this.timers) {
      window.clearTimeout(id);
    }
    this.timers = [];
  }

  private removeOverlay(): void {
    if (this.rootEl && this.rootEl.parentNode) {
      this.rootEl.parentNode.removeChild(this.rootEl);
    }
    this.rootEl = null;
  }

  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ELEMENT_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = `
      .bc-versus-overlay {
        position: absolute; inset: 0; z-index: 60; overflow: hidden;
        background: #090d1a; color: #f8fafc; font-family: 'Lilita One', system-ui, sans-serif;
        user-select: none;
      }
      .bc-versus-half {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        justify-content: center; padding: 28px 36px;
      }
      .bc-versus-left {
        background: linear-gradient(135deg, #0f172a 0%, var(--hero-bg, #ca8a04) 100%);
        clip-path: polygon(0 0, 58% 0, 42% 100%, 0 100%);
        align-items: flex-start;
        animation: bcVersusSlideLeft 0.42s cubic-bezier(0.2, 0.9, 0.25, 1) forwards;
      }
      .bc-versus-right {
        background: linear-gradient(135deg, #450a0a 0%, #991b1b 55%, #1e1b4b 100%);
        clip-path: polygon(58% 0, 100% 0, 100% 100%, 42% 100%);
        align-items: flex-end; text-align: right;
        animation: bcVersusSlideRight 0.42s cubic-bezier(0.2, 0.9, 0.25, 1) forwards;
      }
      .bc-versus-slash {
        position: absolute; top: -12%; left: 49.5%; width: 10px; height: 124%;
        background: linear-gradient(180deg, #facc15, #ffffff, #f97316);
        transform: rotate(15deg); box-shadow: 0 0 28px rgba(250, 204, 21, 0.9);
      }
      .bc-versus-kicker {
        font-size: 13px; letter-spacing: 1px; color: #fde047; font-weight: 900; margin-bottom: 10px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.65);
      }
      .bc-versus-hero-avatar { font-size: 64px; margin: 6px 0; filter: drop-shadow(0 8px 16px rgba(0,0,0,0.45)); }
      .bc-versus-hero-name {
        font-size: 34px; font-weight: 900; color: #ffffff;
        text-shadow: 0 4px 0 #0f172a;
      }
      .bc-versus-hero-sub { font-size: 14px; color: #e2e8f0; margin-top: 4px; }
      .bc-versus-squad-list { display: flex; flex-direction: column; gap: 10px; max-width: 320px; }
      .bc-versus-opponent-card {
        display: flex; align-items: center; gap: 10px; justify-content: flex-end;
        background: rgba(15, 23, 42, 0.72); border: 2px solid rgba(255, 255, 255, 0.2);
        border-radius: 14px; padding: 8px 14px;
      }
      .bc-versus-opp-icon { font-size: 26px; }
      .bc-versus-opp-name { font-size: 15px; font-weight: 900; color: #fff; }
      .bc-versus-opp-title { font-size: 11px; color: #fca5a5; }
      .bc-versus-center-badge {
        position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
        min-width: 118px; padding: 14px 26px; border-radius: 999px;
        background: linear-gradient(135deg, #facc15, #f97316); color: #0f172a;
        border: 4px solid #ffffff; font-size: 42px; font-weight: 900; text-align: center;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
      }
      .bc-versus-pop { animation: bcCountdownPop 0.36s cubic-bezier(0.18, 1.35, 0.32, 1) forwards; }
      .bc-versus-brawl {
        background: linear-gradient(135deg, #22c55e, #facc15); color: #052e16; font-size: 46px;
      }
      .bc-versus-skip-btn {
        position: absolute; right: 16px; bottom: 16px; z-index: 5;
        padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.35);
        background: rgba(15, 23, 42, 0.85); color: #f8fafc; font-weight: 800; cursor: pointer;
      }
      @keyframes bcVersusSlideLeft {
        from { transform: translateX(-18%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes bcVersusSlideRight {
        from { transform: translateX(18%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes bcCountdownPop {
        0% { transform: translate(-50%, -50%) scale(0.45); opacity: 0.3; }
        70% { transform: translate(-50%, -50%) scale(1.16); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
}
