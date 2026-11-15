import type { BrawlerId, SubjectCategory } from '../types/cctp';
import { soundManager } from '../services/SoundManager';

export interface IEmoteDefinition {
  id: string;
  label: string;
  shortLabel: string;
  emoji: string;
  accentColor: string;
  bgGradient: string;
  subject?: SubjectCategory;
}

export interface IScreenPosition {
  x: number;
  y: number;
}

export type EmoteButtonAnchor = 'top-right' | 'bottom-right-above' | 'bottom-left';

export interface IEmoteWheelOptions {
  /** Conteneur hôte (défaut : document.body) */
  container?: HTMLElement;
  /** Liste personnalisée de 6 émotes (défaut : DEFAULT_SCHOOL_EMOTES) */
  emotes?: readonly IEmoteDefinition[];
  /** Héros actif pour teinter la bulle en jeu */
  brawlerId?: BrawlerId;
  /** Emplacement du bouton discret dans le HUD (défaut : 'top-right') */
  buttonAnchor?: EmoteButtonAnchor;
  /** Délai anti-spam en ms entre deux émotes (défaut : 2400) */
  cooldownMs?: number;
  /** Durée d'affichage de la bulle au-dessus du héros en ms (défaut : 2200) */
  bubbleDurationMs?: number;
  /** Fournisseur dynamique de la position écran du héros */
  getPlayerScreenPosition?: () => IScreenPosition | null;
  /** Active les sons Web Audio (défaut : true) */
  enableSound?: boolean;
  /** Callback déclenché à chaque envoi d'émote valide */
  onEmoteSent?: (emote: IEmoteDefinition) => void;
}

export const DEFAULT_SCHOOL_EMOTES: readonly IEmoteDefinition[] = [
  {
    id: 'gg_college',
    label: 'GG Collège ! ⭐',
    shortLabel: 'GG Collège',
    emoji: '⭐',
    accentColor: '#ffd426',
    bgGradient: 'linear-gradient(180deg, #ffe75e 0%, #f59e0b 100%)',
    subject: 'vie_au_college',
  },
  {
    id: 'calcul_eclair',
    label: 'Calcul Éclair ⚡',
    shortLabel: 'Calcul ⚡',
    emoji: '⚡',
    accentColor: '#38bdf8',
    bgGradient: 'linear-gradient(180deg, #56d4ff 0%, #0284c7 100%)',
    subject: 'mathematiques',
  },
  {
    id: 'bien_accorde',
    label: 'Bien Accordé ✍️',
    shortLabel: 'Accordé ✍️',
    emoji: '✍️',
    accentColor: '#c084fc',
    bgGradient: 'linear-gradient(180deg, #d896ff 0%, #7e22ce 100%)',
    subject: 'francais',
  },
  {
    id: 'cap_salle_204',
    label: 'Cap Salle 204 🧭',
    shortLabel: 'Salle 204 🧭',
    emoji: '🧭',
    accentColor: '#4ade80',
    bgGradient: 'linear-gradient(180deg, #62f578 0%, #16a34a 100%)',
    subject: 'histoire_geo_sciences',
  },
  {
    id: 'force_calme',
    label: 'Force & Calme 🛡️',
    shortLabel: 'Calme 🛡️',
    emoji: '🛡️',
    accentColor: '#22d3ee',
    bgGradient: 'linear-gradient(180deg, #67e8f9 0%, #0891b2 100%)',
    subject: 'anglais',
  },
  {
    id: 'bien_joue',
    label: 'Bien joué ! 👏',
    shortLabel: 'Bien joué 👏',
    emoji: '👏',
    accentColor: '#fb7185',
    bgGradient: 'linear-gradient(180deg, #fda4af 0%, #e11d48 100%)',
    subject: 'vie_au_college',
  },
];

const BRAWLER_ACCENTS: Record<BrawlerId, string> = {
  TIMO: '#ffd426',
  LEO: '#c084fc',
  MAYA: '#4ade80',
  ZACK: '#22d3ee',
};

const STYLE_ID = 'brawl-ux-emote-styles';
const SVG_NS = 'http://www.w3.org/2000/svg';

function injectEmoteStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .brawl-ux-emote-btn {
      position: fixed;
      z-index: 9300;
      width: 48px;
      height: 48px;
      border-radius: 999px;
      border: 3px solid var(--brawl-ink, #090d16);
      background: linear-gradient(180deg, #ffe75e 0%, #f59e0b 100%);
      color: #1c1200;
      font-size: 21px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 0 var(--brawl-ink, #090d16), 0 8px 16px rgba(0, 0, 0, 0.42);
      transition: transform 0.12s ease, filter 0.12s ease, opacity 0.15s ease;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    .brawl-ux-emote-btn.anchor-top-right {
      top: 68px;
      right: 14px;
    }

    .brawl-ux-emote-btn.anchor-bottom-right-above {
      bottom: 126px;
      right: 22px;
    }

    .brawl-ux-emote-btn.anchor-bottom-left {
      bottom: 64px;
      left: 16px;
    }

    .brawl-ux-emote-btn:hover:not(:disabled) {
      transform: translateY(-1px) scale(1.04);
      filter: brightness(1.06);
    }

    .brawl-ux-emote-btn:active:not(:disabled) {
      transform: translateY(2px) scale(0.96);
      box-shadow: 0 2px 0 var(--brawl-ink, #090d16);
    }

    .brawl-ux-emote-btn.is-cooldown {
      opacity: 0.72;
      filter: grayscale(0.35);
      cursor: not-allowed;
    }

    .brawl-ux-emote-cd-badge {
      position: absolute;
      bottom: -5px;
      right: -5px;
      min-width: 20px;
      height: 20px;
      padding: 0 4px;
      border-radius: 999px;
      background: #090e26;
      border: 2px solid var(--brawl-ink, #090d16);
      color: #ffd426;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 10px;
      font-weight: 900;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .brawl-ux-emote-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9340;
      background: rgba(6, 9, 24, 0.25);
    }

    .brawl-ux-emote-wheel {
      position: fixed;
      z-index: 9350;
      width: 220px;
      height: 220px;
      transform: translate(-50%, -50%);
      pointer-events: none;
      animation: brawl-ux-wheel-open 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    .brawl-ux-emote-hub {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 52px;
      height: 52px;
      border-radius: 999px;
      border: 3px solid var(--brawl-ink, #090d16);
      background: linear-gradient(180deg, #1b2961 0%, #0d1433 100%);
      color: #f8fafc;
      font-size: 18px;
      font-weight: 900;
      cursor: pointer;
      pointer-events: auto;
      box-shadow: 0 4px 0 var(--brawl-ink, #090d16), 0 0 22px rgba(255, 212, 38, 0.28);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
    }

    .brawl-ux-emote-pin {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 78px;
      padding: 6px 6px 5px;
      border-radius: 14px;
      border: 3px solid var(--brawl-ink, #090d16);
      color: #090d16;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 10px;
      font-weight: 900;
      line-height: 1.15;
      text-align: center;
      cursor: pointer;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      box-shadow: 0 4px 0 var(--brawl-ink, #090d16), 0 8px 14px rgba(0, 0, 0, 0.45);
      transition: transform 0.12s ease, filter 0.12s ease;
      touch-action: manipulation;
    }

    .brawl-ux-emote-pin:hover {
      filter: brightness(1.09);
      z-index: 2;
    }

    .brawl-ux-emote-pin-emoji {
      font-size: 20px;
      line-height: 1;
      filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.25));
    }

    .brawl-ux-emote-pin-text {
      color: #ffffff;
      text-shadow:
        -1px -1px 0 #090d16,
        1px -1px 0 #090d16,
        -1px 1px 0 #090d16,
        1px 1px 0 #090d16;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .brawl-ux-emote-bubble {
      position: fixed;
      z-index: 9360;
      transform: translate(-50%, -100%);
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      animation: brawl-ux-emote-pop 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    .brawl-ux-emote-bubble.is-fading {
      opacity: 0;
      transform: translate(-50%, -112%) scale(0.92);
      transition: opacity 0.22s ease, transform 0.22s ease;
    }

    .brawl-ux-emote-bubble-card {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 7px 12px;
      border-radius: 16px;
      border: 3px solid var(--brawl-ink, #090d16);
      background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
      color: #090d16;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
      box-shadow: 0 5px 0 var(--brawl-ink, #090d16), 0 12px 24px rgba(0, 0, 0, 0.5);
    }

    .brawl-ux-emote-bubble-svg {
      display: block;
      flex-shrink: 0;
    }

    .brawl-ux-emote-bubble-tail {
      display: block;
      margin-top: -3px;
      filter: drop-shadow(0 3px 0 #090d16);
    }

    @keyframes brawl-ux-wheel-open {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.45); }
      to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    @keyframes brawl-ux-emote-pop {
      0% { opacity: 0; transform: translate(-50%, -70%) scale(0.4); }
      65% { opacity: 1; transform: translate(-50%, -106%) scale(1.1); }
      100% { opacity: 1; transform: translate(-50%, -100%) scale(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .brawl-ux-emote-wheel,
      .brawl-ux-emote-bubble {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Roue radiale d'émotes scolaires + bouton HUD discret :
 * - 6 pins de combat scolaire en éventail radial.
 * - Bulle SVG/HTML élastique affichée au-dessus du héros.
 * - Cooldown anti-spam intégré et isolation stricte du double stick tactile.
 */
export class EmoteWheel {
  private readonly container: HTMLElement;
  private readonly emotes: readonly IEmoteDefinition[];
  private readonly brawlerAccent: string;
  private readonly buttonAnchor: EmoteButtonAnchor;
  private readonly cooldownMs: number;
  private readonly bubbleDurationMs: number;
  private readonly getPlayerScreenPosition?: () => IScreenPosition | null;
  private readonly enableSound: boolean;
  private readonly onEmoteSent?: (emote: IEmoteDefinition) => void;

  private hudBtnEl: HTMLButtonElement | null = null;
  private cooldownBadgeEl: HTMLSpanElement | null = null;
  private backdropEl: HTMLDivElement | null = null;
  private wheelEl: HTMLDivElement | null = null;
  private bubbleEl: HTMLDivElement | null = null;

  private isOpen = false;
  private lastSentAtMs = -Infinity;
  private playerPos: IScreenPosition | null = null;
  private cooldownIntervalId: number | null = null;
  private bubbleFadeTimerId: number | null = null;
  private bubbleRemoveTimerId: number | null = null;
  private destroyed = false;

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' && this.isOpen) {
      this.close();
    }
  };

  constructor(options: IEmoteWheelOptions = {}) {
    this.container = options.container ?? document.body;
    const sourceEmotes = options.emotes && options.emotes.length > 0
      ? options.emotes.slice(0, 6)
      : DEFAULT_SCHOOL_EMOTES;
    this.emotes = sourceEmotes;
    this.brawlerAccent = options.brawlerId ? BRAWLER_ACCENTS[options.brawlerId] : '#ffd426';
    this.buttonAnchor = options.buttonAnchor ?? 'top-right';
    this.cooldownMs = Math.max(500, options.cooldownMs ?? 2400);
    this.bubbleDurationMs = Math.max(800, options.bubbleDurationMs ?? 2200);
    this.getPlayerScreenPosition = options.getPlayerScreenPosition;
    this.enableSound = options.enableSound !== false;
    this.onEmoteSent = options.onEmoteSent;

    injectEmoteStyles();
    this.mountHudButton();
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
    }
  }

  public setPlayerScreenPosition(x: number, y: number): void {
    this.playerPos = { x, y };
    if (this.bubbleEl) {
      const clamped = this.computeClampedBubblePosition();
      this.bubbleEl.style.left = `${clamped.x}px`;
      this.bubbleEl.style.top = `${clamped.y}px`;
    }
  }

  public isWheelOpen(): boolean {
    return this.isOpen;
  }

  public isOnCooldown(): boolean {
    return this.getRemainingCooldownMs() > 0;
  }

  public getRemainingCooldownMs(): number {
    const elapsed = this.nowMs() - this.lastSentAtMs;
    return Math.max(0, this.cooldownMs - elapsed);
  }

  public open(): void {
    if (this.destroyed || this.isOpen || this.isOnCooldown()) {
      return;
    }
    this.isOpen = true;
    this.renderRadialWheel();
  }

  public close(): void {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.backdropEl?.remove();
    this.backdropEl = null;
    this.wheelEl?.remove();
    this.wheelEl = null;
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public sendEmote(emoteId: string): boolean {
    if (this.destroyed || this.isOnCooldown()) {
      return false;
    }
    const emote = this.emotes.find((item) => item.id === emoteId);
    if (!emote) {
      return false;
    }

    this.lastSentAtMs = this.nowMs();
    this.close();
    this.showHeroEmoteBubble(emote);
    this.startCooldownTicker();

    if (this.enableSound) {
      soundManager.playGadget();
    }

    this.onEmoteSent?.(emote);
    return true;
  }

  public showHeroEmoteBubble(emote: IEmoteDefinition): void {
    if (this.destroyed) {
      return;
    }
    this.clearBubbleTimers();
    this.bubbleEl?.remove();

    const pos = this.computeClampedBubblePosition();
    const bubble = document.createElement('div');
    bubble.className = 'brawl-ux-emote-bubble';
    bubble.style.left = `${pos.x}px`;
    bubble.style.top = `${pos.y}px`;
    bubble.setAttribute('role', 'status');

    const card = document.createElement('div');
    card.className = 'brawl-ux-emote-bubble-card';
    card.style.borderColor = this.brawlerAccent;

    const pinSvg = this.createPinBadgeSvg(emote);
    const labelSpan = document.createElement('span');
    labelSpan.textContent = emote.label;

    card.appendChild(pinSvg);
    card.appendChild(labelSpan);

    const tailSvg = this.createSpeechTailSvg(this.brawlerAccent);

    bubble.appendChild(card);
    bubble.appendChild(tailSvg);

    this.bubbleEl = bubble;
    this.container.appendChild(bubble);

    const fadeDelay = Math.max(300, this.bubbleDurationMs - 240);
    this.bubbleFadeTimerId = window.setTimeout(() => {
      bubble.classList.add('is-fading');
    }, fadeDelay);

    this.bubbleRemoveTimerId = window.setTimeout(() => {
      if (this.bubbleEl === bubble) {
        this.bubbleEl = null;
      }
      bubble.remove();
      this.bubbleFadeTimerId = null;
      this.bubbleRemoveTimerId = null;
    }, this.bubbleDurationMs);
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.close();
    this.clearBubbleTimers();
    if (this.cooldownIntervalId !== null) {
      window.clearInterval(this.cooldownIntervalId);
      this.cooldownIntervalId = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
    }
    this.bubbleEl?.remove();
    this.bubbleEl = null;
    this.hudBtnEl?.remove();
    this.hudBtnEl = null;
    this.cooldownBadgeEl = null;
  }

  private mountHudButton(): void {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `brawl-ux-emote-btn anchor-${this.buttonAnchor}`;
    btn.title = 'Émotes scolaires';
    btn.setAttribute('aria-label', 'Ouvrir la roue des émotes');
    btn.textContent = '💬';

    const cdBadge = document.createElement('span');
    cdBadge.className = 'brawl-ux-emote-cd-badge';
    cdBadge.style.display = 'none';
    btn.appendChild(cdBadge);

    btn.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
    });
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.toggle();
    });

    this.hudBtnEl = btn;
    this.cooldownBadgeEl = cdBadge;
    this.container.appendChild(btn);
  }

  private renderRadialWheel(): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'brawl-ux-emote-backdrop';
    backdrop.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      this.close();
    });

    const center = this.computeWheelCenter();
    const wheel = document.createElement('div');
    wheel.className = 'brawl-ux-emote-wheel';
    wheel.style.left = `${center.x}px`;
    wheel.style.top = `${center.y}px`;

    const hub = document.createElement('button');
    hub.type = 'button';
    hub.className = 'brawl-ux-emote-hub';
    hub.textContent = '✖';
    hub.setAttribute('aria-label', 'Fermer les émotes');
    hub.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
    });
    hub.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.close();
    });
    wheel.appendChild(hub);

    const radiusPx = 82;
    const total = this.emotes.length;

    this.emotes.forEach((emote, index) => {
      const angleRad = -Math.PI / 2 + (index * 2 * Math.PI) / total;
      const offsetX = Math.round(Math.cos(angleRad) * radiusPx);
      const offsetY = Math.round(Math.sin(angleRad) * radiusPx);

      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'brawl-ux-emote-pin';
      pin.style.background = emote.bgGradient;
      pin.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
      pin.setAttribute('aria-label', emote.label);

      const emojiSpan = document.createElement('span');
      emojiSpan.className = 'brawl-ux-emote-pin-emoji';
      emojiSpan.textContent = emote.emoji;

      const textSpan = document.createElement('span');
      textSpan.className = 'brawl-ux-emote-pin-text';
      textSpan.textContent = emote.shortLabel;

      pin.appendChild(emojiSpan);
      pin.appendChild(textSpan);

      pin.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
      });
      pin.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.sendEmote(emote.id);
      });

      wheel.appendChild(pin);
    });

    this.backdropEl = backdrop;
    this.wheelEl = wheel;
    this.container.appendChild(backdrop);
    this.container.appendChild(wheel);
  }

  private computeWheelCenter(): IScreenPosition {
    const width = typeof window !== 'undefined' ? window.innerWidth : 960;
    const height = typeof window !== 'undefined' ? window.innerHeight : 640;
    const margin = 128;

    let rawX = width - 132;
    let rawY = 178;

    if (this.hudBtnEl) {
      const rect = this.hudBtnEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        rawX = rect.left + rect.width / 2;
        rawY = rect.top + rect.height / 2;
      }
    }

    return {
      x: Math.max(margin, Math.min(width - margin, rawX)),
      y: Math.max(margin, Math.min(height - margin, rawY)),
    };
  }

  private computeClampedBubblePosition(): IScreenPosition {
    const width = typeof window !== 'undefined' ? window.innerWidth : 960;
    const height = typeof window !== 'undefined' ? window.innerHeight : 640;

    const dynamicPos = this.getPlayerScreenPosition?.() ?? this.playerPos;
    const rawX = dynamicPos ? dynamicPos.x : width * 0.5;
    const rawY = dynamicPos ? dynamicPos.y - 46 : height * 0.42;

    return {
      x: Math.max(96, Math.min(width - 96, rawX)),
      y: Math.max(76, Math.min(height - 32, rawY)),
    };
  }

  private startCooldownTicker(): void {
    this.updateCooldownUi();
    if (this.cooldownIntervalId !== null) {
      window.clearInterval(this.cooldownIntervalId);
    }
    this.cooldownIntervalId = window.setInterval(() => {
      this.updateCooldownUi();
    }, 150);
  }

  private updateCooldownUi(): void {
    const remainingMs = this.getRemainingCooldownMs();
    const activeCd = remainingMs > 0;

    if (this.hudBtnEl) {
      this.hudBtnEl.classList.toggle('is-cooldown', activeCd);
      this.hudBtnEl.disabled = activeCd;
    }

    if (this.cooldownBadgeEl) {
      if (activeCd) {
        this.cooldownBadgeEl.style.display = 'inline-flex';
        this.cooldownBadgeEl.textContent = `${Math.ceil(remainingMs / 1000)}s`;
      } else {
        this.cooldownBadgeEl.style.display = 'none';
      }
    }

    if (!activeCd && this.cooldownIntervalId !== null) {
      window.clearInterval(this.cooldownIntervalId);
      this.cooldownIntervalId = null;
    }
  }

  private createPinBadgeSvg(emote: IEmoteDefinition): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '26');
    svg.setAttribute('viewBox', '0 0 28 28');
    svg.setAttribute('class', 'brawl-ux-emote-bubble-svg');

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', '14');
    circle.setAttribute('cy', '14');
    circle.setAttribute('r', '12.5');
    circle.setAttribute('fill', emote.accentColor);
    circle.setAttribute('stroke', '#090d16');
    circle.setAttribute('stroke-width', '2.5');

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', '14');
    text.setAttribute('y', '18.5');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '14');
    text.textContent = emote.emoji;

    svg.appendChild(circle);
    svg.appendChild(text);
    return svg;
  }

  private createSpeechTailSvg(strokeColor: string): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '11');
    svg.setAttribute('viewBox', '0 0 20 11');
    svg.setAttribute('class', 'brawl-ux-emote-bubble-tail');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M2 0 L10 10 L18 0 Z');
    path.setAttribute('fill', '#e2e8f0');
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', '2');

    svg.appendChild(path);
    return svg;
  }

  private clearBubbleTimers(): void {
    if (this.bubbleFadeTimerId !== null) {
      window.clearTimeout(this.bubbleFadeTimerId);
      this.bubbleFadeTimerId = null;
    }
    if (this.bubbleRemoveTimerId !== null) {
      window.clearTimeout(this.bubbleRemoveTimerId);
      this.bubbleRemoveTimerId = null;
    }
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
