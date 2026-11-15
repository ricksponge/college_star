import type { IStarrDropReward, StarrDropRarity } from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';
import { soundManager } from '../services/SoundManager';
import { StarrDropModal } from '../ui/StarrDropModal';

export interface IWelcomeDropReward extends IStarrDropReward {
  /** Nombre réel de clics effectués lors de la cérémonie de bienvenue (5 clics) */
  ceremony_clicks: 5;
}

export interface ILobbyTourStep {
  id: string;
  title: string;
  description: string;
  /** Sélecteurs CSS testés par ordre de priorité pour positionner le Spotlight */
  targetSelectors: string[];
  arrowHint: string;
  fallbackAnchor: { xPct: number; yPct: number; width: number; height: number };
}

export interface ILobbyTourOptions {
  /** Conteneur hôte (défaut: document.body) */
  hostElement?: HTMLElement;
  /** Callback appelé juste après l'ouverture du 1er Casier Mystère (utile pour rafraîchir le Lobby) */
  onDropClaimed?: (reward: IWelcomeDropReward) => void;
  /** Callback appelé lorsque la visite guidée du Menu Principal est terminée ou passée */
  onTourFinished?: () => void;
}

interface IRarityVisual {
  label: string;
  color: string;
  bg: string;
  glow: string;
}

const WELCOME_DROP_RARITY_STYLES: Record<StarrDropRarity, IRarityVisual> = {
  RARE: {
    label: 'RARE',
    color: '#22c55e',
    bg: 'linear-gradient(135deg, #14532d, #16a34a)',
    glow: '0 0 28px rgba(34, 197, 94, 0.72)',
  },
  SUPER_RARE: {
    label: 'SUPER RARE',
    color: '#3b82f6',
    bg: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
    glow: '0 0 34px rgba(59, 130, 246, 0.82)',
  },
  EPIQUE: {
    label: 'ÉPIQUE',
    color: '#a855f7',
    bg: 'linear-gradient(135deg, #581c87, #9333ea)',
    glow: '0 0 40px rgba(168, 85, 247, 0.88)',
  },
  LEGENDAIRE: {
    label: 'LÉGENDAIRE',
    color: '#ffd426',
    bg: 'linear-gradient(135deg, #854d0e, #eab308)',
    glow: '0 0 48px rgba(255, 212, 38, 0.96)',
  },
};

export const DEFAULT_LOBBY_TOUR_STEPS: readonly ILobbyTourStep[] = [
  {
    id: 'trophy-and-drops',
    title: '🏆 Route vers la 6ème & Casiers',
    description:
      'Gagne des trophées à chaque partie pour grimper de Rentrée CM2 jusqu’à Major de 6ème, et ouvre un Casier Mystère toutes les 3 étoiles !',
    targetSelectors: ['#btn-open-trophy-road', '#btn-starr-drop', '.brawl-topbar'],
    arrowHint: 'Route des Trophées & Casiers',
    fallbackAnchor: { xPct: 0.24, yPct: 0.08, width: 250, height: 56 },
  },
  {
    id: 'brawler-podium',
    title: '🌟 Podium 3D & Équipe de Héros',
    description:
      'Change d’Élève-Héros quand tu veux (Timo, Léo, Maya, Zack) et utilise tes Pièces + Points de Savoir pour passer Niveau 10 !',
    targetSelectors: ['.brawl-hero-stage', '.brawl-brawler-dock', '#btn-upgrade-brawler'],
    arrowHint: 'Tes 4 Héros & Améliorations',
    fallbackAnchor: { xPct: 0.5, yPct: 0.54, width: 320, height: 220 },
  },
  {
    id: 'campus-quests',
    title: '🏫 Collège 3D & Carnet de Quêtes',
    description:
      'Explore les 10 salles du Collège en 3D, parle aux professeurs et à la CPE pour réussir les 12 quêtes de rentrée !',
    targetSelectors: ['#btn-explore-campus', '#btn-open-quests-card', '.brawl-campus-card'],
    arrowHint: 'Carte Ouverte & 12 Missions',
    fallbackAnchor: { xPct: 0.17, yPct: 0.42, width: 260, height: 140 },
  },
  {
    id: 'parent-comfort',
    title: '🔒 Carnet Parent & Mode Confort',
    description:
      'Tes parents peuvent suivre tes progrès (code PIN) dans Carnet Parent, et tu peux activer le Mode Calme ou la Visée Assistée dans Aide !',
    targetSelectors: ['#btn-parent-dash', '#btn-comfort-help'],
    arrowHint: 'Suivi Parent & Confort',
    fallbackAnchor: { xPct: 0.84, yPct: 0.08, width: 210, height: 52 },
  },
  {
    id: 'play-arena',
    title: '🏟️ Modes d’Arène & Bouton JOUER !',
    description:
      'Choisis ton mode préféré (Chasse aux Notes, Match des Accords, Interro Surprise...) et appuie sur JOUER pour ta première victoire !',
    targetSelectors: ['#btn-play-match', '.brawl-modes-stack'],
    arrowHint: 'Prêt pour l’Arène !',
    fallbackAnchor: { xPct: 0.82, yPct: 0.82, width: 270, height: 84 },
  },
];

const WELCOME_DROP_MAX_TAPS = 5;

function playSafeClick(): void {
  const maybeExtended = soundManager as unknown as { playUiClick?: () => void };
  if (typeof maybeExtended.playUiClick === 'function') {
    maybeExtended.playUiClick();
  } else {
    soundManager.playGadget();
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureLobbyTourStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ftue-lobby-tour-styles')) return;

  const style = document.createElement('style');
  style.id = 'ftue-lobby-tour-styles';
  style.textContent = `
    .ftue-drop-overlay {
      position: fixed;
      inset: 0;
      z-index: 10060;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      background: radial-gradient(circle at center, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.98));
      overflow: hidden;
      font-family: var(--brawl-font-ui, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif);
    }

    .ftue-drop-rays {
      position: absolute;
      width: 150vmax;
      height: 150vmax;
      pointer-events: none;
      opacity: 0.36;
      background: repeating-conic-gradient(
        from 0deg,
        var(--ftue-ray-color, #22c55e) 0deg 10deg,
        transparent 10deg 22deg
      );
      animation: ftue-rays-spin 16s linear infinite;
    }

    @keyframes ftue-rays-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .ftue-drop-card {
      position: relative;
      z-index: 2;
      width: min(470px, 94vw);
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      border: 4px solid #ffd426;
      border-radius: 26px;
      padding: 26px 24px;
      text-align: center;
      color: #ffffff;
      box-shadow: 0 12px 0 #090d16, 0 24px 55px rgba(0, 0, 0, 0.65);
    }

    .ftue-drop-locker-btn {
      width: 162px;
      height: 162px;
      border-radius: 28px;
      border: 4px solid #090d16;
      color: #ffffff;
      font-size: 68px;
      cursor: pointer;
      transition: transform 0.14s ease, box-shadow 0.2s ease, background 0.2s ease;
      touch-action: manipulation;
    }

    .ftue-drop-locker-btn.is-shaking {
      animation: ftue-locker-shake 0.26s ease;
    }

    @keyframes ftue-locker-shake {
      0% { transform: rotate(0deg) scale(1.06); }
      25% { transform: rotate(-8deg) scale(1.1); }
      60% { transform: rotate(7deg) scale(1.08); }
      100% { transform: rotate(0deg) scale(1); }
    }

    .ftue-drop-dots {
      margin-top: 18px;
      display: flex;
      justify-content: center;
      gap: 10px;
    }

    .ftue-drop-dot {
      width: 15px;
      height: 15px;
      border-radius: 999px;
      border: 2px solid #090d16;
      background: #334155;
      transition: background 0.18s ease, transform 0.18s ease;
    }

    .ftue-drop-dot.is-filled {
      transform: scale(1.22);
    }

    /* Visite Guidée Spotlight + Flèches */
    .ftue-tour-overlay {
      position: fixed;
      inset: 0;
      z-index: 10055;
      pointer-events: auto;
      font-family: var(--brawl-font-ui, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif);
    }

    .ftue-tour-spotlight {
      position: fixed;
      border-radius: 18px;
      border: 4px solid #ffd426;
      box-shadow: 0 0 0 9999px rgba(4, 8, 24, 0.76), 0 0 32px rgba(255, 212, 38, 0.85);
      pointer-events: none;
      transition: left 0.28s ease, top 0.28s ease, width 0.28s ease, height 0.28s ease;
      animation: ftue-tour-pulse 1.3s ease-in-out infinite;
    }

    @keyframes ftue-tour-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }

    .ftue-tour-arrow-tag {
      position: fixed;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 3px solid #090d16;
      background: linear-gradient(180deg, #ffd426, #f59e0b);
      color: #090d16;
      font-size: 12px;
      font-weight: 900;
      box-shadow: 0 4px 0 #090d16;
      pointer-events: none;
      z-index: 3;
      animation: ftue-arrow-bob 0.9s ease-in-out infinite;
    }

    @keyframes ftue-arrow-bob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    .ftue-tour-popover {
      position: fixed;
      z-index: 4;
      width: min(410px, 92vw);
      background: linear-gradient(180deg, #1b2961 0%, #0f172a 100%);
      border: 4px solid #090d16;
      border-radius: 20px;
      padding: 16px 18px;
      color: #f8fafc;
      box-shadow: 0 9px 0 #090d16, 0 20px 44px rgba(0, 0, 0, 0.65);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Orchestre l'après-Camp d'entraînement (Issue #27 [FTUE-LOBBY]) :
 * 1) Cérémonie automatique du 1er Casier Mystère offert (Starr Drop en 5 clics).
 * 2) Visite guidée interactive par flèches et Spotlights des sections clés du Menu Principal.
 */
export class LobbyTourGuide {
  private readonly db: LocalSQLiteDB;
  private readonly helperStarrModal: StarrDropModal;

  private activeDropOverlay: HTMLElement | null = null;
  private activeTourOverlay: HTMLElement | null = null;
  private tourStepIndex = 0;
  private resizeHandler: (() => void) | null = null;

  constructor(db: LocalSQLiteDB) {
    this.db = db;
    this.helperStarrModal = new StarrDropModal(db);
  }

  public dispose(): void {
    this.activeDropOverlay?.remove();
    this.activeDropOverlay = null;
    this.activeTourOverlay?.remove();
    this.activeTourOverlay = null;
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
  }

  /**
   * Lance la séquence complète post-Camp d'entraînement :
   * 1er Casier Mystère offert (5 clics) -> puis Visite Guidée par Spotlights du Lobby.
   */
  public startPostCampCelebrationAndTour(options: ILobbyTourOptions = {}): void {
    this.openWelcomeStarrDrop5Clicks({
      hostElement: options.hostElement,
      onCompleted: (reward) => {
        options.onDropClaimed?.(reward);
        this.startLobbySpotlightTour({
          hostElement: options.hostElement,
          onFinished: options.onTourFinished,
        });
      },
    });
  }

  /**
   * Ouvre automatiquement le 1er Casier Mystère de bienvenue en 5 clics.
   * Si le joueur n'a aucun casier en stock dans SQLite, en offre 1 de bienvenue.
   */
  public openWelcomeStarrDrop5Clicks(params: {
    hostElement?: HTMLElement;
    onCompleted?: (reward: IWelcomeDropReward) => void;
  } = {}): void {
    ensureLobbyTourStyles();
    this.activeDropOverlay?.remove();

    const profileBefore = this.db.getPlayerProfile();
    if (profileBefore.starr_drops_available <= 0) {
      this.db.updatePlayerProfile({ starr_drops_available: 1 });
    }

    const host = params.hostElement ?? document.body;
    const overlay = document.createElement('div');
    overlay.id = 'ftue-welcome-starr-drop';
    overlay.className = 'ftue-drop-overlay';

    const rays = document.createElement('div');
    rays.className = 'ftue-drop-rays';
    overlay.appendChild(rays);

    const card = document.createElement('div');
    card.className = 'ftue-drop-card brawl-pop';
    overlay.appendChild(card);

    let taps = 0;
    let rarity: StarrDropRarity = 'RARE';
    let revealed = false;

    const renderTapPhase = (): void => {
      const style = WELCOME_DROP_RARITY_STYLES[rarity];
      rays.style.setProperty('--ftue-ray-color', style.color);
      card.style.borderColor = style.color;

      const dotsHtml = Array.from({ length: WELCOME_DROP_MAX_TAPS }, (_, idx) => {
        const filled = idx < taps;
        return `<span data-welcome-dot="${idx}" class="ftue-drop-dot ${filled ? 'is-filled' : ''}" style="background:${filled ? style.color : '#334155'};"></span>`;
      }).join('');

      const remainingTaps = WELCOME_DROP_MAX_TAPS - taps;
      card.innerHTML = `
        <div class="brawl-outline-text" style="font-size:12px; color:#7dd3fc; letter-spacing:1.1px;">
          CADEAU DE BIENVENUE • DIPLÔME 6ÈME
        </div>
        <h2 id="ftue-drop-rarity" class="brawl-outline-text" style="margin:6px 0 4px; font-size:30px; color:${style.color};">
          ★ ${style.label} ★
        </h2>
        <p id="ftue-drop-status" style="margin:0 0 18px; font-size:14px; font-weight:700; color:#cbd5e1;">
          ${
            remainingTaps === 1
              ? 'Dernier coup ! <strong>1</strong> clic pour ouvrir ton 1er Casier !'
              : `Tapote encore <strong>${remainingTaps}</strong> fois pour ouvrir ton 1er Casier Mystère !`
          }
        </p>

        <div style="position:relative; display:inline-flex; align-items:center; justify-content:center;">
          <div id="ftue-drop-upgrade" class="brawl-outline-text" style="position:absolute; top:-28px; left:50%; transform:translateX(-50%); white-space:nowrap; font-size:15px; opacity:0; transition:opacity 0.2s;"></div>
          <button id="ftue-drop-tap-btn" type="button" class="ftue-drop-locker-btn" style="background:${style.bg}; box-shadow:0 8px 0 #090d16, ${style.glow};">
            🎒
          </button>
        </div>

        <div class="ftue-drop-dots">${dotsHtml}</div>
      `;

      const tapBtn = card.querySelector<HTMLButtonElement>('#ftue-drop-tap-btn');
      const upgradeBanner = card.querySelector<HTMLElement>('#ftue-drop-upgrade');

      const triggerTap = (): void => {
        if (revealed || taps >= WELCOME_DROP_MAX_TAPS) return;
        taps += 1;
        const prevRarity = rarity;
        rarity = this.helperStarrModal.rollUpgradeRarity(rarity);
        const upgraded = rarity !== prevRarity;

        soundManager.playStarrDropTap(taps, upgraded);

        if (taps < WELCOME_DROP_MAX_TAPS) {
          renderTapPhase();
          const newTapBtn = card.querySelector<HTMLButtonElement>('#ftue-drop-tap-btn');
          if (newTapBtn) {
            newTapBtn.style.transform = `scale(${1 + taps * 0.045})`;
            newTapBtn.classList.remove('is-shaking');
            void newTapBtn.offsetWidth;
            newTapBtn.classList.add('is-shaking');
          }
          const newUpgradeBanner = card.querySelector<HTMLElement>('#ftue-drop-upgrade');
          if (upgraded && newUpgradeBanner) {
            const nextStyle = WELCOME_DROP_RARITY_STYLES[rarity];
            newUpgradeBanner.textContent = `✨ ${WELCOME_DROP_RARITY_STYLES[prevRarity].label} ➔ ${nextStyle.label} !`;
            newUpgradeBanner.style.color = nextStyle.color;
            newUpgradeBanner.style.opacity = '1';
            window.setTimeout(() => {
              newUpgradeBanner.style.opacity = '0';
            }, 750);
          }
        } else {
          revealed = true;
          const baseReward = this.helperStarrModal.buildReward(rarity);
          const welcomeReward: IWelcomeDropReward = {
            ...baseReward,
            coins_granted: Math.max(100, baseReward.coins_granted),
            trophies_granted: Math.max(25, baseReward.trophies_granted),
            unlocked_badge_or_skin:
              baseReward.unlocked_badge_or_skin ?? 'Badge Pionnier de 6ème',
            ceremony_clicks: 5,
          };
          this.applyWelcomeReward(welcomeReward);
          soundManager.playStarrDropReveal(welcomeReward.final_rarity);
          renderRevealPhase(welcomeReward);
        }
      };

      if (tapBtn && upgradeBanner) {
        tapBtn.addEventListener('click', triggerTap);
      }
    };

    const renderRevealPhase = (reward: IWelcomeDropReward): void => {
      const style = WELCOME_DROP_RARITY_STYLES[reward.final_rarity];
      rays.style.setProperty('--ftue-ray-color', style.color);
      card.style.borderColor = style.color;

      card.innerHTML = `
        <div class="brawl-outline-text" style="font-size:12px; color:#cbd5e1; letter-spacing:1px;">
          1ER CASIER MYSTÈRE DÉVERROUILLÉ !
        </div>
        <h2 class="brawl-outline-text" style="margin:6px 0 12px; font-size:32px; color:${style.color};">
          ★ ${style.label} ★
        </h2>

        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px;">
          <div style="background:#1e293b; border:3px solid #090d16; padding:10px; border-radius:14px;">
            <div class="brawl-outline-text" style="font-size:22px; color:#facc15;">+${reward.coins_granted}</div>
            <div style="font-size:11.5px; color:#cbd5e1; font-weight:700;">Pièces 🪙</div>
          </div>
          <div style="background:#1e293b; border:3px solid #090d16; padding:10px; border-radius:14px;">
            <div class="brawl-outline-text" style="font-size:22px; color:#38bdf8;">+${reward.trophies_granted}</div>
            <div style="font-size:11.5px; color:#cbd5e1; font-weight:700;">Trophées 🏆</div>
          </div>
          <div style="background:#1e293b; border:3px solid #090d16; padding:10px; border-radius:14px;">
            <div class="brawl-outline-text" style="font-size:22px; color:#4ade80;">+${reward.knowledge_points_granted}</div>
            <div style="font-size:11.5px; color:#cbd5e1; font-weight:700;">Savoir 📖</div>
          </div>
        </div>

        ${
          reward.unlocked_badge_or_skin
            ? `<div style="margin-bottom:10px; padding:9px 12px; border-radius:12px; border:2.5px solid #090d16; background:rgba(250,204,21,0.2); color:#fef08a; font-weight:800;">
                🏅 ${escapeHtml(reward.unlocked_badge_or_skin)}
              </div>`
            : ''
        }

        ${
          reward.secret_tip_6e
            ? `<div style="margin-bottom:14px; padding:10px 12px; border-radius:12px; border:2.5px solid #090d16; background:rgba(15,23,42,0.85); color:#e0f2fe; font-size:12.5px; text-align:left; line-height:1.4;">
                <strong style="color:#7dd3fc;">🗝️ Secret de 6ème :</strong> ${escapeHtml(reward.secret_tip_6e)}
              </div>`
            : ''
        }

        <button id="ftue-drop-claim-btn" type="button" class="brawl-btn brawl-btn-lg brawl-btn-yellow brawl-pulse" style="width:100%;">
          ✨ RÉCUPÉRER & VISITER LE MENU
        </button>
      `;

      card.querySelector<HTMLButtonElement>('#ftue-drop-claim-btn')?.addEventListener('click', () => {
        playSafeClick();
        overlay.remove();
        this.activeDropOverlay = null;
        params.onCompleted?.(reward);
      });
    };

    host.appendChild(overlay);
    this.activeDropOverlay = overlay;
    renderTapPhase();
  }

  /**
   * Lance la visite guidée interactive par flèches et Spotlights sur le Menu Principal.
   */
  public startLobbySpotlightTour(params: {
    hostElement?: HTMLElement;
    steps?: readonly ILobbyTourStep[];
    onFinished?: () => void;
  } = {}): void {
    ensureLobbyTourStyles();
    this.activeTourOverlay?.remove();
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    const steps = params.steps && params.steps.length > 0 ? params.steps : DEFAULT_LOBBY_TOUR_STEPS;
    this.tourStepIndex = 0;

    const host = params.hostElement ?? document.body;
    const overlay = document.createElement('div');
    overlay.id = 'ftue-lobby-spotlight-tour';
    overlay.className = 'ftue-tour-overlay';

    overlay.innerHTML = `
      <div id="ftue-tour-spotlight" class="ftue-tour-spotlight"></div>
      <div id="ftue-tour-arrow" class="ftue-tour-arrow-tag"></div>
      <div id="ftue-tour-popover" class="ftue-tour-popover brawl-pop"></div>
    `;

    host.appendChild(overlay);
    this.activeTourOverlay = overlay;

    const spotlightEl = overlay.querySelector<HTMLElement>('#ftue-tour-spotlight');
    const arrowEl = overlay.querySelector<HTMLElement>('#ftue-tour-arrow');
    const popoverEl = overlay.querySelector<HTMLElement>('#ftue-tour-popover');

    const finishTour = (): void => {
      this.db.updateAccessibilitySettings({ onboarding_seen: true });
      this.dispose();
      params.onFinished?.();
    };

    const resolveTargetRect = (step: ILobbyTourStep): {
      left: number;
      top: number;
      width: number;
      height: number;
    } => {
      for (const selector of step.targetSelectors) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return {
              left: Math.max(8, r.left - 8),
              top: Math.max(8, r.top - 8),
              width: Math.min(window.innerWidth - 16, r.width + 16),
              height: Math.min(window.innerHeight - 16, r.height + 16),
            };
          }
        }
      }

      const w = Math.min(step.fallbackAnchor.width, window.innerWidth - 24);
      const h = Math.min(step.fallbackAnchor.height, window.innerHeight - 24);
      const cx = window.innerWidth * step.fallbackAnchor.xPct;
      const cy = window.innerHeight * step.fallbackAnchor.yPct;
      return {
        left: Math.max(12, Math.min(window.innerWidth - w - 12, cx - w * 0.5)),
        top: Math.max(12, Math.min(window.innerHeight - h - 12, cy - h * 0.5)),
        width: w,
        height: h,
      };
    };

    const renderCurrentStep = (): void => {
      const step = steps[this.tourStepIndex];
      if (!step || !spotlightEl || !arrowEl || !popoverEl) {
        finishTour();
        return;
      }

      const rect = resolveTargetRect(step);
      spotlightEl.style.left = `${rect.left}px`;
      spotlightEl.style.top = `${rect.top}px`;
      spotlightEl.style.width = `${rect.width}px`;
      spotlightEl.style.height = `${rect.height}px`;

      const placeBelow = rect.top < window.innerHeight * 0.52;
      const arrowLeft = Math.max(
        16,
        Math.min(window.innerWidth - 240, rect.left + rect.width * 0.5 - 95)
      );
      const arrowTop = placeBelow
        ? Math.min(window.innerHeight - 54, rect.top + rect.height + 10)
        : Math.max(12, rect.top - 42);

      arrowEl.style.left = `${arrowLeft}px`;
      arrowEl.style.top = `${arrowTop}px`;
      arrowEl.textContent = `${placeBelow ? '⬆️' : '⬇️'} ${step.arrowHint}`;

      const popWidth = Math.min(410, window.innerWidth - 24);
      const popLeft = Math.max(
        12,
        Math.min(window.innerWidth - popWidth - 12, rect.left + rect.width * 0.5 - popWidth * 0.5)
      );
      const popTop = placeBelow
        ? Math.min(window.innerHeight - 210, arrowTop + 44)
        : Math.max(12, arrowTop - 192);

      popoverEl.style.left = `${popLeft}px`;
      popoverEl.style.top = `${popTop}px`;

      const isLast = this.tourStepIndex === steps.length - 1;
      popoverEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
          <span style="font-size:11px; font-weight:900; color:#38bdf8; letter-spacing:0.7px;">
            VISITE DU MENU • ${this.tourStepIndex + 1} / ${steps.length}
          </span>
          <button id="ftue-tour-skip" type="button" style="background:transparent; border:none; color:#94a3b8; font-size:11.5px; font-weight:800; cursor:pointer;">
            Passer ✖
          </button>
        </div>

        <h3 class="brawl-title" style="margin:0 0 6px; font-size:18px; color:#ffd426;">
          ${escapeHtml(step.title)}
        </h3>
        <p style="margin:0 0 14px; font-size:13px; color:#e2e8f0; line-height:1.42;">
          ${escapeHtml(step.description)}
        </p>

        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <button id="ftue-tour-prev" type="button" class="brawl-btn brawl-btn-sm brawl-btn-blue" ${this.tourStepIndex === 0 ? 'disabled' : ''}>
            ⬅ Précédent
          </button>
          <button id="ftue-tour-next" type="button" class="brawl-btn brawl-btn-sm brawl-btn-yellow">
            ${isLast ? '🚀 C’EST PARTI !' : 'Suivant ➔'}
          </button>
        </div>
      `;

      popoverEl.querySelector<HTMLButtonElement>('#ftue-tour-skip')?.addEventListener('click', () => {
        playSafeClick();
        finishTour();
      });
      popoverEl.querySelector<HTMLButtonElement>('#ftue-tour-prev')?.addEventListener('click', () => {
        if (this.tourStepIndex <= 0) return;
        playSafeClick();
        this.tourStepIndex -= 1;
        renderCurrentStep();
      });
      popoverEl.querySelector<HTMLButtonElement>('#ftue-tour-next')?.addEventListener('click', () => {
        playSafeClick();
        if (isLast) {
          finishTour();
        } else {
          this.tourStepIndex += 1;
          renderCurrentStep();
        }
      });
    };

    this.resizeHandler = () => renderCurrentStep();
    window.addEventListener('resize', this.resizeHandler);
    renderCurrentStep();
  }

  private applyWelcomeReward(reward: IWelcomeDropReward): void {
    const profile = this.db.getPlayerProfile();
    this.db.updatePlayerProfile({
      coins: profile.coins + reward.coins_granted,
      trophies: profile.trophies + reward.trophies_granted,
      starr_drops_available: Math.max(0, profile.starr_drops_available - 1),
    });
    this.db.addKnowledgePoints(reward.knowledge_points_granted);
    if (reward.unlocked_badge_or_skin) {
      this.db.addUnlockedReward(reward.unlocked_badge_or_skin);
    }
  }
}
