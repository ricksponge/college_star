import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';

export const QUESTION_READ_FREEZE_MS = 3000;
export const SENSORY_STORAGE_KEY = 'brawl_college_sensory_profile_v1';

export const SENSORY_PROFILE_SQL_DDL = `
CREATE TABLE IF NOT EXISTS sensory_profile_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tsa_sensory_comfort BOOLEAN NOT NULL DEFAULT 0,
  dys_tdah_reading_comfort BOOLEAN NOT NULL DEFAULT 0,
  disable_flashes BOOLEAN NOT NULL DEFAULT 0,
  disable_screen_shake BOOLEAN NOT NULL DEFAULT 0,
  soft_sound_volume REAL NOT NULL DEFAULT 1.0,
  reading_line_height REAL NOT NULL DEFAULT 1.35,
  bold_action_words BOOLEAN NOT NULL DEFAULT 0,
  syllable_spaced_mode BOOLEAN NOT NULL DEFAULT 0,
  question_freeze_ms INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`.trim();

export interface ISensoryProfileConfig {
  tsaSensoryComfort: boolean;
  dysTdahReadingComfort: boolean;
  disableFlashes: boolean;
  disableScreenShake: boolean;
  softSoundVolume: number;
  calmColorPalette: boolean;
  readingLineHeight: number;
  letterSpacingEm: number;
  boldActionWords: boolean;
  syllableSpacedMode: boolean;
  questionFreezeDurationMs: number;
}

export interface ISensoryRuntimeModifiers {
  screenShakeScale: number;
  allowFlashes: boolean;
  soundVolumeScale: number;
  droneSpeedMultiplier: number;
  isDroneFrozenForReading: boolean;
  remainingFreezeMs: number;
  lineHeight: number;
  letterSpacingEm: number;
}

const ACTION_VERBS_SET = new Set<string>([
  'calculer',
  'calcule',
  'trouve',
  'trouver',
  'choisis',
  'choisir',
  'accorde',
  'accorder',
  'conjugue',
  'conjuguer',
  'repère',
  'repérer',
  'observe',
  'observer',
  'protège',
  'protéger',
  'alerte',
  'alerter',
  'préviens',
  'prévenir',
  'réponds',
  'répondre',
  'remplace',
  'remplacer',
  'convertis',
  'convertir',
  'complète',
  'compléter',
  'tire',
  'tirer',
  'évite',
  'éviter',
  'garde',
  'garder',
  'dis',
  'dire',
  'parler',
  'parle',
  'aider',
  'aide',
  'bloquer',
  'bloque',
]);

function createDefaultConfig(): ISensoryProfileConfig {
  return {
    tsaSensoryComfort: false,
    dysTdahReadingComfort: false,
    disableFlashes: false,
    disableScreenShake: false,
    softSoundVolume: 1.0,
    calmColorPalette: false,
    readingLineHeight: 1.35,
    letterSpacingEm: 0,
    boldActionWords: false,
    syllableSpacedMode: false,
    questionFreezeDurationMs: 0,
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Gestionnaire de Profil Sensoriel TSA / TDAH / Dys (Agent 20 - M8).
 * Permet d'activer en 1 clic :
 * - « Confort Sensoriel (TSA) » : coupe flashs, tremblements de caméra et adoucit le son.
 * - « Confort Lecture (Dys / TDAH) » : augmente l'interlignage, met en gras les mots d'action
 *   et gèle le mouvement des drones pendant les 3 premières secondes d'une nouvelle question.
 */
export class SensoryProfile {
  private readonly db: LocalSQLiteDB | null;
  private config: ISensoryProfileConfig;
  private remainingFreezeMs = 0;

  constructor(db: LocalSQLiteDB | null = null) {
    this.db = db;
    this.config = this.loadConfig();
    this.syncToSQLite();
    this.applyDocumentPreferences();
  }

  public getConfig(): ISensoryProfileConfig {
    return { ...this.config };
  }

  public getSchemaDDL(): string {
    return SENSORY_PROFILE_SQL_DDL;
  }

  /**
   * Active ou désactive en 1 clic le mode « Confort Sensoriel (TSA) ».
   */
  public setTsaSensoryComfort(enabled: boolean): ISensoryProfileConfig {
    const active = Boolean(enabled);
    this.config.tsaSensoryComfort = active;
    this.config.disableFlashes = active;
    this.config.disableScreenShake = active;
    this.config.calmColorPalette = active;
    this.config.softSoundVolume = active ? 0.45 : 1.0;

    this.persist();
    return this.getConfig();
  }

  public toggleTsaSensoryComfort(): ISensoryProfileConfig {
    return this.setTsaSensoryComfort(!this.config.tsaSensoryComfort);
  }

  /**
   * Active ou désactive en 1 clic le mode « Confort Lecture (Dys / TDAH) ».
   */
  public setDysTdahReadingComfort(enabled: boolean): ISensoryProfileConfig {
    const active = Boolean(enabled);
    this.config.dysTdahReadingComfort = active;
    this.config.readingLineHeight = active ? 1.78 : 1.35;
    this.config.letterSpacingEm = active ? 0.04 : 0;
    this.config.boldActionWords = active;
    this.config.syllableSpacedMode = active;
    this.config.questionFreezeDurationMs = active ? QUESTION_READ_FREEZE_MS : 0;

    if (!active) {
      this.remainingFreezeMs = 0;
    }

    this.persist();
    return this.getConfig();
  }

  public toggleDysTdahReadingComfort(): ISensoryProfileConfig {
    return this.setDysTdahReadingComfort(!this.config.dysTdahReadingComfort);
  }

  /**
   * Déclenche la pause de lecture (gel des drones pendant 3s) à l'apparition d'une question.
   */
  public onNewQuestionDisplayed(): number {
    if (this.config.dysTdahReadingComfort || this.config.questionFreezeDurationMs > 0) {
      this.remainingFreezeMs = Math.max(
        QUESTION_READ_FREEZE_MS,
        this.config.questionFreezeDurationMs
      );
    } else {
      this.remainingFreezeMs = 0;
    }
    return this.remainingFreezeMs;
  }

  public updateFreezeTimer(dtMs: number): number {
    if (this.remainingFreezeMs > 0) {
      this.remainingFreezeMs = Math.max(0, this.remainingFreezeMs - Math.max(0, dtMs));
    }
    return Math.round(this.remainingFreezeMs);
  }

  public getRuntimeModifiers(): ISensoryRuntimeModifiers {
    const isFrozen = this.remainingFreezeMs > 0;
    const baseSpeed = this.config.tsaSensoryComfort ? 0.8 : 1.0;
    return {
      screenShakeScale: this.config.disableScreenShake ? 0 : 1,
      allowFlashes: !this.config.disableFlashes,
      soundVolumeScale: this.config.softSoundVolume,
      droneSpeedMultiplier: isFrozen ? 0 : baseSpeed,
      isDroneFrozenForReading: isFrozen,
      remainingFreezeMs: Math.round(this.remainingFreezeMs),
      lineHeight: this.config.readingLineHeight,
      letterSpacingEm: this.config.letterSpacingEm,
    };
  }

  /**
   * Formate un énoncé selon les réglages Dys/TDAH : interlignage accru, espacement
   * et mise en gras contrastée des mots d'action et négations.
   */
  public formatAccessiblePromptHtml(prompt: string): string {
    const safe = prompt ?? '';
    const tokens = safe.split(/(\s+)/);
    const formatted = tokens
      .map((token) => {
        if (!token || /^\s+$/.test(token)) {
          return this.config.syllableSpacedMode ? '&nbsp;&nbsp;' : token;
        }
        const stripped = token.toLowerCase().replace(/[.,!?;:«»"()']/g, '');
        const isAction =
          this.config.boldActionWords &&
          (ACTION_VERBS_SET.has(stripped) ||
            /^(ne|pas|jamais|non|stop|aucun)$/i.test(stripped) ||
            /^\d/.test(stripped));

        if (isAction) {
          return `<strong style="font-weight:900;color:#fde047;text-decoration:underline;text-underline-offset:3px;">${escapeHtml(token)}</strong>`;
        }
        return escapeHtml(token);
      })
      .join('');

    return `<span style="line-height:${this.config.readingLineHeight};letter-spacing:${this.config.letterSpacingEm}em;display:inline-block;">${formatted}</span>`;
  }

  public renderQuickPanelHtml(): string {
    const tsa = this.config.tsaSensoryComfort;
    const dys = this.config.dysTdahReadingComfort;

    return `
      <section data-sensory-panel="true" style="
        background:rgba(15,23,42,0.94);border:2px solid rgba(56,189,248,0.45);
        border-radius:18px;padding:14px;color:#f8fafc;">
        <div style="font-size:15px;font-weight:900;color:#93c5fd;margin-bottom:10px;">
          🧩 Accessibilité Sensorielle (1 clic)
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button type="button" data-toggle-tsa="true" style="
            text-align:left;padding:10px 12px;border-radius:12px;cursor:pointer;
            border:2px solid ${tsa ? '#4ade80' : 'rgba(148,163,184,0.35)'};
            background:${tsa ? 'rgba(20,83,45,0.65)' : 'rgba(30,41,59,0.85)'};color:#f8fafc;">
            <div style="font-size:13px;font-weight:900;">
              ${tsa ? '✅' : '⬜'} Confort Sensoriel (TSA)
            </div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">
              Coupe les flashs lumineux, les tremblements de caméra et adoucit les sons.
            </div>
          </button>

          <button type="button" data-toggle-dys="true" style="
            text-align:left;padding:10px 12px;border-radius:12px;cursor:pointer;
            border:2px solid ${dys ? '#38bdf8' : 'rgba(148,163,184,0.35)'};
            background:${dys ? 'rgba(12,74,110,0.75)' : 'rgba(30,41,59,0.85)'};color:#f8fafc;">
            <div style="font-size:13px;font-weight:900;">
              ${dys ? '✅' : '⬜'} Confort Lecture (Dys / TDAH)
            </div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">
              Interlignage agrandi, mots d’action en gras et drones gelés 3s à chaque nouvelle question.
            </div>
          </button>
        </div>
      </section>
    `;
  }

  public mountQuickTogglePanel(
    container: HTMLElement,
    onChange?: (config: ISensoryProfileConfig) => void
  ): void {
    const refresh = (): void => {
      container.innerHTML = this.renderQuickPanelHtml();
      container.querySelector<HTMLButtonElement>('[data-toggle-tsa]')?.addEventListener('click', () => {
        const next = this.toggleTsaSensoryComfort();
        refresh();
        onChange?.(next);
      });
      container.querySelector<HTMLButtonElement>('[data-toggle-dys]')?.addEventListener('click', () => {
        const next = this.toggleDysTdahReadingComfort();
        refresh();
        onChange?.(next);
      });
    };
    refresh();
  }

  private persist(): void {
    this.saveToLocalStorage();
    this.syncToSQLite();
    this.applyDocumentPreferences();
  }

  private syncToSQLite(): void {
    if (!this.db) return;
    this.db.updateAccessibilitySettings({
      calm_mode: this.config.tsaSensoryComfort || this.config.dysTdahReadingComfort,
      auto_hint_assist: this.config.dysTdahReadingComfort || this.db.getAccessibilitySettings().auto_hint_assist,
    });
  }

  private applyDocumentPreferences(): void {
    if (typeof document === 'undefined' || !document.documentElement) {
      return;
    }
    const root = document.documentElement;
    root.classList.toggle('bc-sensory-tsa', this.config.tsaSensoryComfort);
    root.classList.toggle('bc-reading-dys', this.config.dysTdahReadingComfort);
  }

  private loadConfig(): ISensoryProfileConfig {
    const base = createDefaultConfig();
    if (this.db) {
      const settings = this.db.getAccessibilitySettings();
      if (settings.calm_mode) {
        base.tsaSensoryComfort = true;
        base.disableFlashes = true;
        base.disableScreenShake = true;
        base.calmColorPalette = true;
        base.softSoundVolume = 0.45;
      }
    }

    if (typeof localStorage === 'undefined') {
      return base;
    }

    try {
      const raw = localStorage.getItem(SENSORY_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<ISensoryProfileConfig>;
      return {
        ...base,
        ...parsed,
        softSoundVolume:
          typeof parsed.softSoundVolume === 'number' && Number.isFinite(parsed.softSoundVolume)
            ? Math.max(0.1, Math.min(1, parsed.softSoundVolume))
            : base.softSoundVolume,
        readingLineHeight:
          typeof parsed.readingLineHeight === 'number' && Number.isFinite(parsed.readingLineHeight)
            ? Math.max(1.2, Math.min(2.2, parsed.readingLineHeight))
            : base.readingLineHeight,
        questionFreezeDurationMs:
          typeof parsed.questionFreezeDurationMs === 'number' &&
          Number.isFinite(parsed.questionFreezeDurationMs)
            ? Math.max(0, Math.min(6000, parsed.questionFreezeDurationMs))
            : base.questionFreezeDurationMs,
      };
    } catch {
      return base;
    }
  }

  private saveToLocalStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(SENSORY_STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Stockage local indisponible
    }
  }
}
