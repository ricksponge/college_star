import type { BrawlerId, IPlayerProfile } from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';
import { getBrawlerById } from '../entities/Brawlers';
import { soundManager } from '../services/SoundManager';
import { StarterSelectScene } from './StarterSelectScene';

export const FTUE_REGISTRATION_STORAGE_KEY = 'brawl_college_ftue_registered_v1';
export const DEFAULT_PARENT_PIN = '0000';
export const NICKNAME_MIN_LENGTH = 3;
export const NICKNAME_MAX_LENGTH = 15;

export interface IProfileIconOption {
  id: string;
  emoji: string;
  label: string;
}

export const PROFILE_ICON_OPTIONS: readonly IProfileIconOption[] = [
  { id: 'backpack', emoji: '🎒', label: 'Cartable 6e' },
  { id: 'soccer', emoji: '⚽', label: 'Capitaine' },
  { id: 'book', emoji: '📘', label: 'Alchimiste' },
  { id: 'compass', emoji: '🧭', label: 'Explorateur' },
  { id: 'headset', emoji: '🎧', label: 'Geek Néon' },
  { id: 'star', emoji: '⭐', label: 'Major Star' },
];

export interface IRegistrationResult {
  alreadyRegistered: boolean;
  profile: IPlayerProfile;
  profileIcon: string;
  selectedBrawler: BrawlerId;
}

export interface IRegistrationLaunchOptions {
  /** Force l'affichage même si un profil existe déjà */
  force?: boolean;
  /** Conteneur DOM cible (défaut: document.body) */
  hostElement?: HTMLElement;
  /** Callback appelé immédiatement après la sauvegarde SQLite */
  onComplete?: (result: IRegistrationResult) => void;
}

interface IStoredRegistrationMeta {
  registered: true;
  nickname: string;
  profileIcon: string;
  selectedBrawler: BrawlerId;
  registeredAt: string;
}

function playSafeClickSound(): void {
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

function ensureFtueRegistrationStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ftue-registration-styles')) return;

  const style = document.createElement('style');
  style.id = 'ftue-registration-styles';
  style.textContent = `
    .ftue-wizard-overlay {
      position: fixed;
      inset: 0;
      z-index: 10050;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      background:
        radial-gradient(circle at 50% 30%, rgba(38, 60, 158, 0.94), rgba(9, 14, 38, 0.98));
      overflow-y: auto;
      font-family: var(--brawl-font-ui, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif);
    }

    .ftue-wizard-panel {
      position: relative;
      background: linear-gradient(180deg, #1b2961 0%, #10193f 100%);
      border: 4px solid #090d16;
      border-radius: 24px;
      box-shadow: 0 12px 0 #090d16, 0 24px 55px rgba(0, 0, 0, 0.65);
      color: #f8fafc;
      max-height: 94dvh;
      overflow-y: auto;
    }

    .ftue-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid rgba(148, 163, 184, 0.22);
    }

    .ftue-step-pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      border: 2px solid #090d16;
      background: linear-gradient(180deg, #38bdf8, #0284c7);
      color: #ffffff;
      font-size: 11px;
      letter-spacing: 0.8px;
      margin-bottom: 6px;
    }

    .ftue-main-title {
      margin: 0;
      font-size: clamp(18px, 2.6vw, 26px);
      color: #ffd426;
    }

    .ftue-reg-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
      gap: 18px;
      align-items: stretch;
    }

    @media (max-width: 780px) {
      .ftue-reg-grid {
        grid-template-columns: 1fr;
      }
    }

    .ftue-form-card {
      background: rgba(11, 17, 41, 0.72);
      border: 3px solid #090d16;
      border-radius: 18px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .ftue-field-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      font-weight: 900;
      color: #fde047;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .ftue-input {
      width: 100%;
      padding: 11px 14px;
      border-radius: 12px;
      border: 3px solid #090d16;
      background: #0f172a;
      color: #ffffff;
      font-size: 16px;
      font-weight: 800;
      outline: none;
      box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.45);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .ftue-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.3), inset 0 3px 6px rgba(0, 0, 0, 0.45);
    }

    .ftue-input-error {
      margin-top: 5px;
      font-size: 12px;
      font-weight: 800;
      color: #fb7185;
      min-height: 16px;
    }

    .ftue-icons-grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }

    @media (max-width: 520px) {
      .ftue-icons-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    .ftue-icon-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 8px 4px;
      border-radius: 12px;
      border: 3px solid #090d16;
      background: #1e293b;
      color: #cbd5e1;
      cursor: pointer;
      transition: transform 0.1s ease, border-color 0.15s ease, background 0.15s ease;
    }

    .ftue-icon-btn:hover {
      transform: translateY(-2px);
      background: #273756;
    }

    .ftue-icon-btn.is-active {
      background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
      border-color: #ffd426;
      color: #ffffff;
      box-shadow: 0 4px 0 #090d16, 0 0 16px rgba(250, 204, 21, 0.45);
    }

    .ftue-student-card {
      position: relative;
      overflow: hidden;
      background: linear-gradient(145deg, #1e3a8a 0%, #0f172a 58%, #1e1b4b 100%);
      border: 3.5px solid #ffd426;
      border-radius: 20px;
      padding: 18px;
      box-shadow: 0 8px 0 #090d16, 0 14px 30px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
    }

    .ftue-student-card::before {
      content: '';
      position: absolute;
      inset: -40%;
      background: radial-gradient(circle at 20% 20%, rgba(255, 212, 38, 0.18), transparent 55%);
      pointer-events: none;
    }

    .ftue-card-top {
      display: flex;
      align-items: center;
      gap: 14px;
      position: relative;
      z-index: 1;
    }

    .ftue-card-emblem {
      width: 68px;
      height: 68px;
      border-radius: 18px;
      border: 3px solid #090d16;
      background: linear-gradient(180deg, #ffd426 0%, #f59e0b 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      box-shadow: 0 4px 0 #090d16;
      flex-shrink: 0;
    }

    .ftue-pin-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .ftue-actions-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 18px;
      padding-top: 14px;
      border-top: 2px solid rgba(148, 163, 184, 0.22);
    }

    /* Écran 2 : Starter Select Scene */
    .ftue-badge-preview-mini {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(15, 23, 42, 0.85);
      border: 2.5px solid #090d16;
      border-radius: 14px;
      padding: 6px 12px;
    }

    .ftue-mini-icon {
      font-size: 24px;
    }

    .ftue-starter-layout {
      display: grid;
      grid-template-columns: 270px minmax(0, 1fr);
      gap: 16px;
      align-items: stretch;
    }

    @media (max-width: 780px) {
      .ftue-starter-layout {
        grid-template-columns: 1fr;
      }
    }

    .ftue-section-label {
      font-size: 11px;
      font-weight: 900;
      color: #93c5fd;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
    }

    .ftue-starter-grid {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    @media (max-width: 780px) {
      .ftue-starter-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .ftue-starter-chip {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 9px 10px;
      border-radius: 14px;
      border: 3px solid #090d16;
      background: rgba(15, 23, 42, 0.85);
      color: #f8fafc;
      text-align: left;
      cursor: pointer;
      transition: transform 0.1s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .ftue-starter-chip:hover {
      transform: translateX(3px);
      background: rgba(30, 41, 59, 0.95);
    }

    .ftue-starter-chip.is-selected {
      border-color: var(--hero-accent, #ffd426);
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.95), rgba(15, 23, 42, 0.95));
      box-shadow: 0 5px 0 #090d16, 0 0 18px var(--hero-glow, rgba(250, 204, 21, 0.35));
    }

    .ftue-starter-avatar-wrap {
      position: relative;
      width: 52px;
      height: 52px;
      border-radius: 14px;
      border: 3px solid #ffd426;
      overflow: hidden;
      flex-shrink: 0;
      background: #0f172a;
    }

    .ftue-starter-avatar {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .ftue-starter-selected-pin {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #ffd426;
      color: #090d16;
      font-size: 11px;
      font-weight: 900;
      padding: 1px 5px;
      border-bottom-left-radius: 8px;
    }

    .ftue-starter-chip-name {
      font-size: 16px;
      line-height: 1.1;
    }

    .ftue-starter-chip-subj {
      font-size: 11px;
      font-weight: 800;
      margin-top: 2px;
    }

    .ftue-starter-chip-hp {
      font-size: 11px;
      color: #cbd5e1;
      font-weight: 700;
    }

    .ftue-starter-spotlight {
      background: rgba(11, 17, 41, 0.8);
      border: 3px solid #090d16;
      border-radius: 18px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ftue-spotlight-hero-head {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .ftue-spotlight-portrait-frame {
      width: 92px;
      height: 92px;
      border-radius: 20px;
      border: 3.5px solid #ffd426;
      overflow: hidden;
      flex-shrink: 0;
      background: #090d16;
    }

    .ftue-spotlight-portrait-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .ftue-role-pill {
      display: inline-block;
      padding: 2px 9px;
      border-radius: 999px;
      border: 1.5px solid currentColor;
      background: rgba(15, 23, 42, 0.85);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.7px;
    }

    .ftue-tagline-box {
      padding: 9px 12px;
      border-radius: 12px;
      background: rgba(30, 41, 59, 0.7);
      border: 2px solid #090d16;
      font-size: 13px;
      font-weight: 700;
      color: #e0f2fe;
    }

    .ftue-stats-bars {
      display: flex;
      flex-direction: column;
      gap: 7px;
      background: rgba(15, 23, 42, 0.75);
      border: 2px solid #090d16;
      border-radius: 12px;
      padding: 10px 12px;
    }

    .ftue-stat-row {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr) 54px;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      font-weight: 800;
    }

    .ftue-stat-label {
      color: #e2e8f0;
    }

    .ftue-stat-track {
      height: 10px;
      border-radius: 999px;
      background: #090d16;
      overflow: hidden;
      border: 1px solid #334155;
    }

    .ftue-stat-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.25s ease;
    }

    .ftue-stat-val {
      text-align: right;
      color: #fef08a;
      font-weight: 900;
    }

    .ftue-abilities-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    @media (max-width: 680px) {
      .ftue-abilities-grid {
        grid-template-columns: 1fr;
      }
    }

    .ftue-ability-card {
      background: rgba(15, 23, 42, 0.85);
      border: 2px solid #090d16;
      border-radius: 12px;
      padding: 9px 10px;
    }

    .ftue-ability-title {
      font-size: 11.5px;
      font-weight: 900;
      margin-bottom: 3px;
    }

    .ftue-ability-desc {
      font-size: 11px;
      line-height: 1.35;
      color: #cbd5e1;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Tunnel d'inscription 1er lancement (Issue #25 [FTUE-REG]) :
 * - Vérifie au démarrage si le profil joueur SQLite est déjà initialisé.
 * - Écran 1 : Carte de Collégien (Pseudo 3-15 caractères, icône de profil, PIN Parent optionnel défaut 0000).
 * - Écran 2 : Podium « Choisis ton Champion de Rentrée » (StarterSelectScene).
 * - Sauvegarde immédiate dans LocalSQLiteDB.
 */
export class RegistrationWizard {
  private readonly db: LocalSQLiteDB;
  private overlayEl: HTMLElement | null = null;
  private starterScene: StarterSelectScene | null = null;

  private draftNickname = '';
  private draftProfileIcon: string = PROFILE_ICON_OPTIONS[0].emoji;
  private draftParentPin = '';
  private draftBrawlerId: BrawlerId = 'TIMO';

  constructor(db: LocalSQLiteDB) {
    this.db = db;
  }

  /**
   * Détecte si le profil joueur dans SQLite a déjà été initialisé (ou a déjà une progression active).
   */
  public static isProfileInitialized(db: LocalSQLiteDB): boolean {
    if (typeof localStorage !== 'undefined') {
      const rawFlag = localStorage.getItem(FTUE_REGISTRATION_STORAGE_KEY);
      if (rawFlag === '1') {
        return true;
      }
      if (rawFlag) {
        try {
          const parsed = JSON.parse(rawFlag) as Partial<IStoredRegistrationMeta>;
          if (parsed && parsed.registered === true) {
            return true;
          }
        } catch {
          // Flag corrompu : continuer avec les heuristiques SQLite
        }
      }
    }

    const profile = db.getPlayerProfile();
    const settings = db.getAccessibilitySettings();
    const hasHistory = db.getTelemetryLogs(1).length > 0;
    const hasProgress =
      profile.trophies > 0 ||
      db.getCombatStars() > 0 ||
      db.getKnowledgePoints() > 0 ||
      settings.onboarding_seen ||
      profile.nickname.trim() !== 'Timo';

    return hasHistory || hasProgress;
  }

  public static getSavedProfileIcon(): string {
    if (typeof localStorage === 'undefined') {
      return PROFILE_ICON_OPTIONS[0].emoji;
    }
    const raw = localStorage.getItem(FTUE_REGISTRATION_STORAGE_KEY);
    if (!raw || raw === '1') {
      return PROFILE_ICON_OPTIONS[0].emoji;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<IStoredRegistrationMeta>;
      if (typeof parsed.profileIcon === 'string' && parsed.profileIcon.length > 0) {
        return parsed.profileIcon;
      }
    } catch {
      // Ignorer
    }
    return PROFILE_ICON_OPTIONS[0].emoji;
  }

  public static validateNickname(rawNickname: string): {
    valid: boolean;
    normalized: string;
    error?: string;
  } {
    const normalized = rawNickname.replace(/\s+/g, ' ').trim();
    if (normalized.length < NICKNAME_MIN_LENGTH) {
      return {
        valid: false,
        normalized,
        error: `Le pseudo doit contenir au moins ${NICKNAME_MIN_LENGTH} caractères.`,
      };
    }
    if (normalized.length > NICKNAME_MAX_LENGTH) {
      return {
        valid: false,
        normalized,
        error: `Le pseudo ne doit pas dépasser ${NICKNAME_MAX_LENGTH} caractères.`,
      };
    }
    return { valid: true, normalized };
  }

  public static validateParentPin(rawPin: string): {
    valid: boolean;
    normalized: string;
    error?: string;
  } {
    const cleaned = rawPin.trim();
    if (cleaned.length === 0) {
      return { valid: true, normalized: DEFAULT_PARENT_PIN };
    }
    if (!/^\d{4}$/.test(cleaned)) {
      return {
        valid: false,
        normalized: DEFAULT_PARENT_PIN,
        error: 'Le code PIN Parent doit contenir exactement 4 chiffres (ou rester vide = 0000).',
      };
    }
    return { valid: true, normalized: cleaned };
  }

  public isRegistered(): boolean {
    return RegistrationWizard.isProfileInitialized(this.db);
  }

  /**
   * Vérifie au lancement si le profil est initialisé ; sinon ouvre le tunnel complet
   * et retourne le profil sauvegardé à l'issue du choix du Héros.
   */
  public ensureRegistered(options: IRegistrationLaunchOptions = {}): Promise<IRegistrationResult> {
    if (!options.force && this.isRegistered()) {
      const profile = this.db.getPlayerProfile();
      const result: IRegistrationResult = {
        alreadyRegistered: true,
        profile,
        profileIcon: RegistrationWizard.getSavedProfileIcon(),
        selectedBrawler: profile.selected_brawler,
      };
      options.onComplete?.(result);
      return Promise.resolve(result);
    }

    return new Promise((resolve) => {
      this.open((result) => {
        options.onComplete?.(result);
        resolve(result);
      }, options.hostElement);
    });
  }

  public open(
    onComplete?: (result: IRegistrationResult) => void,
    hostElement?: HTMLElement
  ): void {
    ensureFtueRegistrationStyles();
    this.close();

    const currentProfile = this.db.getPlayerProfile();
    this.draftNickname =
      currentProfile.nickname && currentProfile.nickname !== 'Timo'
        ? currentProfile.nickname
        : '';
    this.draftProfileIcon = RegistrationWizard.getSavedProfileIcon();
    this.draftParentPin = '';
    this.draftBrawlerId = currentProfile.selected_brawler ?? 'TIMO';

    const overlay = document.createElement('div');
    overlay.id = 'ftue-registration-wizard';
    overlay.className = 'ftue-wizard-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Inscription Collège Brawl 6ème');

    const host = hostElement ?? document.body;
    host.appendChild(overlay);
    this.overlayEl = overlay;

    this.renderStep1RegistrationCard(onComplete);
  }

  public close(): void {
    this.starterScene?.unmount();
    this.starterScene = null;
    this.overlayEl?.remove();
    this.overlayEl = null;
  }

  private renderStep1RegistrationCard(
    onComplete?: (result: IRegistrationResult) => void
  ): void {
    if (!this.overlayEl) return;
    this.starterScene?.unmount();
    this.starterScene = null;
    this.overlayEl.innerHTML = '';

    const stage = document.createElement('div');
    stage.className = 'ftue-wizard-panel brawl-pop';
    stage.style.cssText = 'width:min(860px, 96vw); padding:22px 24px;';

    const previewName = this.draftNickname.trim() || 'Ton Pseudo';
    const previewPin =
      this.draftParentPin.trim().length > 0 ? this.draftParentPin.trim() : DEFAULT_PARENT_PIN;

    stage.innerHTML = `
      <div class="ftue-header-row">
        <div>
          <div class="brawl-outline-text ftue-step-pill">ÉTAPE 1 / 2 • RENTRÉE DES CLASSES</div>
          <h2 class="brawl-title ftue-main-title">🎓 NOUVELLE INSCRIPTION AU COLLÈGE</h2>
        </div>
        <div style="font-size:12px; font-weight:800; color:#cbd5e1; text-align:right;">
          100% Hors-ligne • Zéro pub • Zéro Pay-to-Win
        </div>
      </div>

      <div class="ftue-reg-grid">
        <!-- Formulaire de Carte de Collégien -->
        <div class="ftue-form-card">
          <div>
            <label for="ftue-nickname-input" class="ftue-field-label">
              <span>1. Choisis ton Pseudo de Collégien</span>
              <span id="ftue-nickname-count" style="color:#93c5fd;">${this.draftNickname.trim().length}/${NICKNAME_MAX_LENGTH}</span>
            </label>
            <input
              id="ftue-nickname-input"
              type="text"
              class="ftue-input"
              maxlength="20"
              autocomplete="off"
              placeholder="Ex : Alex6e, SuperMaya..."
              value="${escapeHtml(this.draftNickname)}"
            />
            <div id="ftue-nickname-error" class="ftue-input-error"></div>
          </div>

          <div>
            <div class="ftue-field-label">
              <span>2. Icône de Profil</span>
              <span style="color:#93c5fd; font-size:11px;">Affichée sur ta carte</span>
            </div>
            <div class="ftue-icons-grid">
              ${PROFILE_ICON_OPTIONS.map((opt) => {
                const active = opt.emoji === this.draftProfileIcon;
                return `
                  <button
                    type="button"
                    data-profile-icon="${opt.emoji}"
                    class="ftue-icon-btn ${active ? 'is-active' : ''}"
                    title="${escapeHtml(opt.label)}"
                  >
                    <span style="font-size:24px; line-height:1;">${opt.emoji}</span>
                    <span style="font-size:9.5px; font-weight:800;">${escapeHtml(opt.label)}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div>
            <div class="ftue-field-label">
              <span>3. Code PIN Carnet Parent (Optionnel)</span>
              <span style="color:#86efac; font-size:11px;">Défaut : ${DEFAULT_PARENT_PIN}</span>
            </div>
            <div class="ftue-pin-row">
              <input
                id="ftue-pin-input"
                type="password"
                inputmode="numeric"
                maxlength="4"
                class="ftue-input"
                style="max-width:170px; letter-spacing:6px; text-align:center;"
                placeholder="0000"
                value="${escapeHtml(this.draftParentPin)}"
              />
              <button id="ftue-pin-skip-btn" type="button" class="brawl-btn brawl-btn-sm brawl-btn-blue">
                Passer (PIN 0000)
              </button>
            </div>
            <div id="ftue-pin-error" class="ftue-input-error"></div>
            <div style="font-size:11px; color:#94a3b8; line-height:1.35;">
              Protège le suivi des matières (Maths, Français, Anglais, Hist-Géo, Vie au Collège) réservé aux parents.
            </div>
          </div>
        </div>

        <!-- Aperçu Temps Réel de la Carte de Collégien -->
        <div class="ftue-student-card">
          <div style="position:relative; z-index:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span class="brawl-outline-text" style="font-size:11px; color:#ffd426; letter-spacing:1px;">
                CARTE DE COLLÉGIEN • 6ÈME
              </span>
              <span style="font-size:11px; font-weight:900; color:#4ade80; background:rgba(20,83,45,0.75); padding:2px 8px; border-radius:999px; border:1px solid #4ade80;">
                PROMO 2026
              </span>
            </div>

            <div class="ftue-card-top">
              <div id="ftue-card-emblem-preview" class="ftue-card-emblem">${escapeHtml(this.draftProfileIcon)}</div>
              <div style="min-width:0;">
                <div style="font-size:11px; font-weight:800; color:#93c5fd;">ÉLÈVE INSCRIT</div>
                <div id="ftue-card-name-preview" class="brawl-title" style="font-size:22px; color:#ffffff; word-break:break-word;">
                  ${escapeHtml(previewName)}
                </div>
                <div style="font-size:11.5px; color:#fde047; font-weight:800; margin-top:2px;">
                  🏫 Collège Brawl • Rentrée CM2 ➔ 6e
                </div>
              </div>
            </div>
          </div>

          <div style="position:relative; z-index:1; display:flex; flex-direction:column; gap:8px; background:rgba(9,13,22,0.55); border:2px solid #090d16; border-radius:14px; padding:11px 12px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800;">
              <span style="color:#cbd5e1;">🎒 Starter Pack</span>
              <span style="color:#ffd426;">250 🪙 + 1 Casier Mystère 🎁</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800;">
              <span style="color:#cbd5e1;">🔒 PIN Carnet Parent</span>
              <span id="ftue-card-pin-preview" style="color:#86efac;">${previewPin === DEFAULT_PARENT_PIN ? '0000 (par défaut)' : '•••• (personnalisé)'}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800;">
              <span style="color:#cbd5e1;">🏆 Palier Départ</span>
              <span style="color:#38bdf8;">0 / 1000 Trophées</span>
            </div>
          </div>
        </div>
      </div>

      <div class="ftue-actions-footer">
        <div style="font-size:12px; color:#cbd5e1; font-weight:700;">
          Étape suivante : sélectionne ton premier Élève-Héros sur le podium !
        </div>
        <button id="ftue-step1-next" type="button" class="brawl-btn brawl-btn-lg brawl-btn-yellow brawl-pulse">
          CONTINUER VERS LE PODIUM HÉROS ➔
        </button>
      </div>
    `;

    this.overlayEl.appendChild(stage);

    const nickInput = stage.querySelector<HTMLInputElement>('#ftue-nickname-input');
    const nickCount = stage.querySelector<HTMLElement>('#ftue-nickname-count');
    const nickError = stage.querySelector<HTMLElement>('#ftue-nickname-error');
    const cardNamePreview = stage.querySelector<HTMLElement>('#ftue-card-name-preview');
    const cardEmblemPreview = stage.querySelector<HTMLElement>('#ftue-card-emblem-preview');
    const pinInput = stage.querySelector<HTMLInputElement>('#ftue-pin-input');
    const pinError = stage.querySelector<HTMLElement>('#ftue-pin-error');
    const cardPinPreview = stage.querySelector<HTMLElement>('#ftue-card-pin-preview');

    const updateNicknameLive = (): void => {
      if (!nickInput) return;
      this.draftNickname = nickInput.value;
      const trimmed = this.draftNickname.replace(/\s+/g, ' ').trim();
      if (nickCount) {
        nickCount.textContent = `${trimmed.length}/${NICKNAME_MAX_LENGTH}`;
        nickCount.style.color =
          trimmed.length >= NICKNAME_MIN_LENGTH && trimmed.length <= NICKNAME_MAX_LENGTH
            ? '#4ade80'
            : '#fbbf24';
      }
      if (cardNamePreview) {
        cardNamePreview.textContent = trimmed || 'Ton Pseudo';
      }
      if (nickError && trimmed.length >= NICKNAME_MIN_LENGTH && trimmed.length <= NICKNAME_MAX_LENGTH) {
        nickError.textContent = '';
      }
    };

    nickInput?.addEventListener('input', updateNicknameLive);
    window.setTimeout(() => nickInput?.focus(), 40);

    stage.querySelectorAll<HTMLButtonElement>('[data-profile-icon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = btn.dataset.profileIcon;
        if (!chosen) return;
        playSafeClickSound();
        this.draftProfileIcon = chosen;
        stage.querySelectorAll<HTMLButtonElement>('[data-profile-icon]').forEach((other) => {
          other.classList.toggle('is-active', other.dataset.profileIcon === chosen);
        });
        if (cardEmblemPreview) {
          cardEmblemPreview.textContent = chosen;
        }
      });
    });

    pinInput?.addEventListener('input', () => {
      const digitsOnly = pinInput.value.replace(/\D/g, '').slice(0, 4);
      pinInput.value = digitsOnly;
      this.draftParentPin = digitsOnly;
      if (pinError) pinError.textContent = '';
      if (cardPinPreview) {
        cardPinPreview.textContent =
          digitsOnly.length === 4 ? '•••• (personnalisé)' : '0000 (par défaut)';
      }
    });

    stage.querySelector<HTMLButtonElement>('#ftue-pin-skip-btn')?.addEventListener('click', () => {
      playSafeClickSound();
      this.draftParentPin = '';
      if (pinInput) pinInput.value = '';
      if (pinError) pinError.textContent = '';
      if (cardPinPreview) cardPinPreview.textContent = '0000 (par défaut)';
    });

    const proceedToStep2 = (): void => {
      const nickValidation = RegistrationWizard.validateNickname(this.draftNickname);
      if (!nickValidation.valid) {
        soundManager.playHitError();
        if (nickError) nickError.textContent = nickValidation.error ?? 'Pseudo invalide.';
        nickInput?.focus();
        return;
      }

      const pinValidation = RegistrationWizard.validateParentPin(this.draftParentPin);
      if (!pinValidation.valid) {
        soundManager.playHitError();
        if (pinError) pinError.textContent = pinValidation.error ?? 'PIN invalide.';
        pinInput?.focus();
        return;
      }

      this.draftNickname = nickValidation.normalized;
      this.draftParentPin = pinValidation.normalized;
      playSafeClickSound();
      this.renderStep2StarterSelect(onComplete);
    };

    stage.querySelector<HTMLButtonElement>('#ftue-step1-next')?.addEventListener('click', proceedToStep2);
    nickInput?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        proceedToStep2();
      }
    });
  }

  private renderStep2StarterSelect(
    onComplete?: (result: IRegistrationResult) => void
  ): void {
    if (!this.overlayEl) return;
    this.overlayEl.innerHTML = '';

    this.starterScene = new StarterSelectScene(this.overlayEl, {
      initialBrawlerId: this.draftBrawlerId,
      playerNickname: this.draftNickname,
      profileIcon: this.draftProfileIcon,
      onBack: () => {
        this.renderStep1RegistrationCard(onComplete);
      },
      onSelect: (chosenBrawlerId) => {
        this.draftBrawlerId = chosenBrawlerId;
        const result = this.commitRegistrationToDatabase(chosenBrawlerId);
        this.close();
        onComplete?.(result);
      },
    });
    this.starterScene.mount();
  }

  private commitRegistrationToDatabase(selectedBrawler: BrawlerId): IRegistrationResult {
    const nickValidation = RegistrationWizard.validateNickname(this.draftNickname);
    const finalNickname = nickValidation.valid ? nickValidation.normalized : 'Collégien';

    const pinValidation = RegistrationWizard.validateParentPin(this.draftParentPin);
    const finalPin = pinValidation.valid ? pinValidation.normalized : DEFAULT_PARENT_PIN;

    const updatedProfile = this.db.updatePlayerProfile({
      nickname: finalNickname,
      selected_brawler: selectedBrawler,
      parent_pin_hash: finalPin,
    });
    this.db.updateParentPin(finalPin);

    const brawler = getBrawlerById(selectedBrawler);
    this.db.addUnlockedReward(`Carte Collégien ${this.draftProfileIcon}`);
    this.db.addUnlockedReward(`Starter : ${brawler.name}`);

    if (typeof localStorage !== 'undefined') {
      const meta: IStoredRegistrationMeta = {
        registered: true,
        nickname: finalNickname,
        profileIcon: this.draftProfileIcon,
        selectedBrawler,
        registeredAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(FTUE_REGISTRATION_STORAGE_KEY, JSON.stringify(meta));
      } catch {
        // Ignorer si stockage bloqué
      }
    }

    return {
      alreadyRegistered: false,
      profile: updatedProfile,
      profileIcon: this.draftProfileIcon,
      selectedBrawler,
    };
  }
}
