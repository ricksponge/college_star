export interface IKillstreakTier {
  minStreak: number;
  label: string;
  subLabel: string;
  badgeIcon: string;
  bannerColor: string;
  glowColor: string;
  auraActive: boolean;
}

export interface IKillstreakState {
  streak: number;
  bestStreak: number;
  isOnFire: boolean;
  isGoldenAuraActive: boolean;
  auraIntensity: number;
  currentTier: IKillstreakTier | null;
}

export interface IKillstreakHitOutcome {
  streak: number;
  tierTriggered: IKillstreakTier | null;
  state: IKillstreakState;
}

export interface IGoldenAuraRenderTarget {
  x: number;
  y: number;
  radius?: number;
  timeSec: number;
}

export const KILLSTREAK_TIERS: readonly IKillstreakTier[] = [
  {
    minStreak: 3,
    label: 'SÉRIE x3 !',
    subLabel: 'EN FEU — Aura Dorée Activée',
    badgeIcon: '🔥',
    bannerColor: 'linear-gradient(135deg, #f97316, #facc15)',
    glowColor: 'rgba(250, 204, 21, 0.78)',
    auraActive: true,
  },
  {
    minStreak: 5,
    label: 'GÉNIE DU COLLÈGE x5 !',
    subLabel: 'Réflexes de Champion 6ème',
    badgeIcon: '⚡',
    bannerColor: 'linear-gradient(135deg, #eab308, #22d3ee)',
    glowColor: 'rgba(56, 189, 248, 0.85)',
    auraActive: true,
  },
  {
    minStreak: 7,
    label: 'INARRÊTABLE x7 !',
    subLabel: 'Domination Totale de l’Arène',
    badgeIcon: '🌟',
    bannerColor: 'linear-gradient(135deg, #a855f7, #facc15)',
    glowColor: 'rgba(192, 132, 252, 0.9)',
    auraActive: true,
  },
  {
    minStreak: 10,
    label: 'MAJOR LÉGENDAIRE x10 !',
    subLabel: 'Précision Parfaite',
    badgeIcon: '👑',
    bannerColor: 'linear-gradient(135deg, #fde047, #f43f5e)',
    glowColor: 'rgba(253, 224, 71, 0.95)',
    auraActive: true,
  },
];

const BANNER_STYLE_ID = 'bc-killstreak-banner-styles';

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Gestionnaire de séries de bonnes réponses et bandeaux "En Feu" (Agent 14 - Cinématiques).
 * Affiche les bannières ("SÉRIE x3 !", "GÉNIE DU COLLÈGE x5 !") et active l'aura
 * de flammes dorées dessinée sous le héros dès 3 bonnes réponses consécutives.
 */
export class KillstreakAnnouncer {
  private streak = 0;
  private bestStreak = 0;
  private container: HTMLElement | null = null;
  private activeBannerEl: HTMLElement | null = null;
  private hideTimer: number | null = null;

  public mountBannerContainer(container: HTMLElement): void {
    this.container = container;
    this.ensureStyles();
  }

  public registerCorrectHit(): IKillstreakHitOutcome {
    this.streak += 1;
    if (this.streak > this.bestStreak) {
      this.bestStreak = this.streak;
    }

    const exactMilestone =
      KILLSTREAK_TIERS.find((tier) => tier.minStreak === this.streak) ?? null;

    if (exactMilestone) {
      this.showBanner(exactMilestone);
    }

    return {
      streak: this.streak,
      tierTriggered: exactMilestone,
      state: this.getState(),
    };
  }

  public registerError(): IKillstreakState {
    this.streak = 0;
    this.clearBanner();
    return this.getState();
  }

  public reset(): void {
    this.streak = 0;
    this.bestStreak = 0;
    this.clearBanner();
  }

  public getState(): IKillstreakState {
    let currentTier: IKillstreakTier | null = null;
    for (const tier of KILLSTREAK_TIERS) {
      if (this.streak >= tier.minStreak) {
        currentTier = tier;
      }
    }

    const isGoldenAuraActive = this.streak >= 3;
    const auraIntensity = isGoldenAuraActive
      ? Math.min(1, 0.45 + (this.streak - 3) * 0.1)
      : 0;

    return {
      streak: this.streak,
      bestStreak: this.bestStreak,
      isOnFire: isGoldenAuraActive,
      isGoldenAuraActive,
      auraIntensity,
      currentTier,
    };
  }

  /**
   * Dessine l'aura de flammes dorées animée sous les pieds du joueur sur le canvas 2D/isométrique.
   */
  public renderGoldenFlameAura(
    ctx: CanvasRenderingContext2D,
    target: IGoldenAuraRenderTarget
  ): void {
    const state = this.getState();
    if (!state.isGoldenAuraActive) {
      return;
    }

    const baseRadius = target.radius ?? 28;
    const pulse = 1 + Math.sin(target.timeSec * 8.5) * 0.1;
    const outerRadius = baseRadius * (1.28 + state.auraIntensity * 0.32) * pulse;

    ctx.save();
    ctx.translate(target.x, target.y + 8);
    ctx.scale(1, 0.58);

    const grad = ctx.createRadialGradient(0, 0, baseRadius * 0.25, 0, 0, outerRadius);
    grad.addColorStop(0, `rgba(254, 240, 138, ${0.72 * state.auraIntensity})`);
    grad.addColorStop(0.55, `rgba(250, 204, 21, ${0.58 * state.auraIntensity})`);
    grad.addColorStop(0.85, `rgba(249, 115, 22, ${0.38 * state.auraIntensity})`);
    grad.addColorStop(1, 'rgba(249, 115, 22, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2.6;
    ctx.strokeStyle = `rgba(253, 224, 71, ${0.65 + 0.3 * Math.sin(target.timeSec * 11)})`;
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 1.12 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Flammes périphériques tournantes
    const flameCount = 8;
    for (let i = 0; i < flameCount; i++) {
      const angle = target.timeSec * 2.8 + (i * Math.PI * 2) / flameCount;
      const fx = Math.cos(angle) * (baseRadius * 1.1);
      const fy = Math.sin(angle) * (baseRadius * 1.1);
      const flameSize = 4.5 + Math.sin(target.timeSec * 12 + i) * 1.8;

      ctx.fillStyle = i % 2 === 0 ? '#fde047' : '#fb923c';
      ctx.beginPath();
      ctx.arc(fx, fy, Math.max(2, flameSize), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  public destroy(): void {
    this.clearBanner();
    this.container = null;
  }

  private showBanner(tier: IKillstreakTier): void {
    if (!this.container || typeof document === 'undefined') {
      return;
    }
    this.ensureStyles();
    this.clearBanner();

    const banner = document.createElement('div');
    banner.className = 'bc-killstreak-banner';
    banner.style.background = tier.bannerColor;
    banner.style.boxShadow = `0 10px 28px ${tier.glowColor}`;
    banner.innerHTML = `
      <span class="bc-ks-icon">${escapeHtml(tier.badgeIcon)}</span>
      <div class="bc-ks-text">
        <div class="bc-ks-title">${escapeHtml(tier.label)}</div>
        <div class="bc-ks-sub">${escapeHtml(tier.subLabel)}</div>
      </div>
    `;

    this.container.appendChild(banner);
    this.activeBannerEl = banner;

    this.hideTimer = window.setTimeout(() => {
      this.clearBanner();
    }, 2200);
  }

  private clearBanner(): void {
    if (this.hideTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.activeBannerEl && this.activeBannerEl.parentNode) {
      this.activeBannerEl.parentNode.removeChild(this.activeBannerEl);
    }
    this.activeBannerEl = null;
  }

  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(BANNER_STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = BANNER_STYLE_ID;
    style.textContent = `
      .bc-killstreak-banner {
        position: absolute; top: 68px; left: 50%; transform: translateX(-50%);
        z-index: 45; display: flex; align-items: center; gap: 10px;
        padding: 10px 20px; border-radius: 999px; border: 3px solid #ffffff;
        color: #0f172a; font-family: 'Lilita One', system-ui, sans-serif;
        pointer-events: none;
        animation: bcKillstreakPop 0.35s cubic-bezier(0.2, 1.35, 0.35, 1) forwards;
      }
      .bc-ks-icon { font-size: 26px; line-height: 1; }
      .bc-ks-title { font-size: 19px; font-weight: 900; letter-spacing: 0.5px; }
      .bc-ks-sub { font-size: 11px; font-weight: 800; opacity: 0.9; }
      @keyframes bcKillstreakPop {
        0% { transform: translate(-50%, -18px) scale(0.75); opacity: 0; }
        100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
}
