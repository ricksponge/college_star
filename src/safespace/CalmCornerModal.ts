export type MoodWeatherId = 'SOLEIL' | 'ECLAIRCIE' | 'NUAGE' | 'PLUIE' | 'ORAGE';

export interface IMoodWeatherOption {
  id: MoodWeatherId;
  icon: string;
  label: string;
  comfortTip: string;
  accentColor: string;
  needsGentleCare: boolean;
}

export interface IMoodWeatherEntry {
  id: string;
  mood: MoodWeatherId;
  timestamp: string;
  context?: string;
}

export const MOOD_WEATHER_OPTIONS: readonly IMoodWeatherOption[] = [
  {
    id: 'SOLEIL',
    icon: '☀️',
    label: 'Serein / Joyeux',
    comfortTip: 'Super ! Profite de cette belle énergie pour aider un camarade aujourd’hui.',
    accentColor: '#facc15',
    needsGentleCare: false,
  },
  {
    id: 'ECLAIRCIE',
    icon: '🌤️',
    label: 'Calme / Curieux',
    comfortTip: 'Tu es prêt à avancer tranquillement à ton rythme.',
    accentColor: '#38bdf8',
    needsGentleCare: false,
  },
  {
    id: 'NUAGE',
    icon: '☁️',
    label: 'Fatigué / Pensif',
    comfortTip: 'C’est normal d’avoir besoin d’une petite pause : respire doucement 3 fois.',
    accentColor: '#94a3b8',
    needsGentleCare: false,
  },
  {
    id: 'PLUIE',
    icon: '🌧️',
    label: 'Triste / Inquiet',
    comfortTip:
      'Tu n’es pas obligé de porter ça tout seul : parler à un adulte ou à un ami fait du bien.',
    accentColor: '#60a5fa',
    needsGentleCare: true,
  },
  {
    id: 'ORAGE',
    icon: '⛈️',
    label: 'Submergé / En colère',
    comfortTip:
      'Pose tout un instant. Suis la bulle bleue qui respire, puis demande de l’aide si tu en as besoin.',
    accentColor: '#818cf8',
    needsGentleCare: true,
  },
];

export const MOOD_STORAGE_KEY = 'brawl_college_mood_weather_v1';
const CALM_STYLE_ID = 'bc-calm-corner-styles';

export function getMoodWeatherHistory(): IMoodWeatherEntry[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(MOOD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is IMoodWeatherEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as IMoodWeatherEntry).mood === 'string' &&
        typeof (item as IMoodWeatherEntry).timestamp === 'string'
    );
  } catch {
    return [];
  }
}

export function saveMoodWeatherCheckin(
  mood: MoodWeatherId,
  context?: string
): IMoodWeatherEntry {
  const entry: IMoodWeatherEntry = {
    id: `mood_${Date.now()}`,
    mood,
    timestamp: new Date().toISOString(),
    context,
  };
  if (typeof localStorage !== 'undefined') {
    try {
      const history = getMoodWeatherHistory();
      history.push(entry);
      localStorage.setItem(MOOD_STORAGE_KEY, JSON.stringify(history.slice(-60)));
    } catch {
      // Stockage local indisponible
    }
  }
  return entry;
}

/**
 * Modale « Coin Calme » accessible à tout moment via l'icône Bouclier Bleu (Agent 19 - M8).
 * Propose une animation de cohérence cardiaque et la « Météo Intérieure » à 5 émoticônes.
 */
export class CalmCornerModal {
  private overlayEl: HTMLElement | null = null;
  private breathingTimer: number | null = null;
  private phaseStep = 0;
  private onMoodSelectedCallback?: (entry: IMoodWeatherEntry, option: IMoodWeatherOption) => void;
  private onOpenHelpCallback?: () => void;

  public mountFloatingTriggerButton(
    container: HTMLElement,
    options?: {
      onMoodSelected?: (entry: IMoodWeatherEntry, option: IMoodWeatherOption) => void;
      onOpenHelp?: () => void;
    }
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-calm-corner-trigger', 'true');
    btn.innerHTML = '🛡️ Pause Calme';
    btn.title = 'Ouvrir le Coin Calme (respiration & météo intérieure)';
    btn.style.cssText = `
      padding:8px 14px;border-radius:999px;border:2px solid #93c5fd;
      background:linear-gradient(135deg,#1d4ed8,#0284c7);color:#ffffff;
      font-weight:900;font-size:13px;cursor:pointer;
      box-shadow:0 6px 16px rgba(37,99,235,0.4);display:inline-flex;
      align-items:center;gap:6px;
    `;
    btn.addEventListener('click', () => {
      this.open(container, options);
    });
    container.appendChild(btn);
    return btn;
  }

  public open(
    hostContainer: HTMLElement = document.body,
    options?: {
      onMoodSelected?: (entry: IMoodWeatherEntry, option: IMoodWeatherOption) => void;
      onOpenHelp?: () => void;
    }
  ): void {
    this.close();
    this.ensureStyles();
    this.onMoodSelectedCallback = options?.onMoodSelected;
    this.onOpenHelpCallback = options?.onOpenHelp;

    const modal = document.createElement('div');
    modal.className = 'bc-calm-modal-backdrop';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Coin Calme et Météo des Émotions');

    const moodsHtml = MOOD_WEATHER_OPTIONS.map(
      (opt) => `
      <button type="button" data-mood-pick="${opt.id}" class="bc-calm-mood-btn"
        style="border-color:${opt.accentColor};">
        <span style="font-size:26px;line-height:1;">${opt.icon}</span>
        <span style="font-size:11px;font-weight:800;">${opt.label}</span>
      </button>
    `
    ).join('');

    modal.innerHTML = `
      <div class="bc-calm-modal-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
          <div>
            <div style="font-size:18px;font-weight:900;color:#93c5fd;">🛡️ Coin Calme — Bouclier Bleu</div>
            <div style="font-size:12px;color:#cbd5e1;">Ici, le chrono s’arrête. Respire à ton rythme.</div>
          </div>
          <button type="button" data-calm-close="true" class="bc-calm-close-btn">✕ Reprendre</button>
        </div>

        <div class="bc-calm-breath-zone">
          <div class="bc-calm-orb" data-breath-orb="true">
            <span data-breath-label="true">Inspire doucement...</span>
          </div>
        </div>

        <div style="font-size:13px;font-weight:900;color:#e2e8f0;margin-bottom:8px;text-align:center;">
          Quelle est ta Météo Intérieure en ce moment ?
        </div>
        <div class="bc-calm-mood-grid">${moodsHtml}</div>

        <div data-mood-feedback="true" style="
          margin-top:12px;padding:10px 12px;border-radius:12px;
          background:rgba(30,41,59,0.85);border:1px solid rgba(147,197,253,0.3);
          font-size:12px;color:#e2e8f0;min-height:40px;">
          Choisis l’icône qui correspond à ce que tu ressens : toutes les émotions ont leur place.
        </div>

        <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" data-open-help="true" class="bc-calm-help-btn">
            📞 Besoin d’aide ou d’écoute ? (3018 / 119 / 3114)
          </button>
        </div>
      </div>
    `;

    hostContainer.appendChild(modal);
    this.overlayEl = modal;

    const closeBtn = modal.querySelector<HTMLButtonElement>('[data-calm-close]');
    closeBtn?.addEventListener('click', () => this.close());

    const helpBtn = modal.querySelector<HTMLButtonElement>('[data-open-help]');
    helpBtn?.addEventListener('click', () => {
      this.onOpenHelpCallback?.();
    });

    const feedbackEl = modal.querySelector<HTMLElement>('[data-mood-feedback]');
    modal.querySelectorAll<HTMLButtonElement>('[data-mood-pick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const moodId = btn.dataset.moodPick as MoodWeatherId;
        const found = MOOD_WEATHER_OPTIONS.find((m) => m.id === moodId);
        if (!found) return;
        const entry = saveMoodWeatherCheckin(found.id);
        if (feedbackEl) {
          feedbackEl.innerHTML = `<strong style="color:${found.accentColor};">${found.icon} ${found.label}</strong> — ${found.comfortTip}`;
        }
        this.onMoodSelectedCallback?.(entry, found);
      });
    });

    this.startBreathingCycle();
  }

  public close(): void {
    if (this.breathingTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.breathingTimer);
      this.breathingTimer = null;
    }
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
    }
    this.overlayEl = null;
  }

  private startBreathingCycle(): void {
    if (typeof window === 'undefined' || !this.overlayEl) return;
    const labelEl = this.overlayEl.querySelector<HTMLElement>('[data-breath-label]');
    const orbEl = this.overlayEl.querySelector<HTMLElement>('[data-breath-orb]');
    const phases = [
      { text: 'Inspire doucement (5s)...', expanded: true },
      { text: 'Expire calmement (5s)...', expanded: false },
    ];
    this.phaseStep = 0;

    const applyPhase = (): void => {
      const current = phases[this.phaseStep % phases.length];
      if (labelEl) labelEl.textContent = current.text;
      if (orbEl) {
        orbEl.style.transform = current.expanded ? 'scale(1.22)' : 'scale(0.86)';
      }
      this.phaseStep += 1;
    };

    applyPhase();
    this.breathingTimer = window.setInterval(applyPhase, 5000);
  }

  private ensureStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(CALM_STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = CALM_STYLE_ID;
    style.textContent = `
      .bc-calm-modal-backdrop {
        position: fixed; inset: 0; z-index: 90; display: flex;
        align-items: center; justify-content: center; padding: 16px;
        background: rgba(9, 14, 28, 0.82); backdrop-filter: blur(6px);
      }
      .bc-calm-modal-card {
        width: 100%; max-width: 560px; border-radius: 22px; padding: 20px;
        background: linear-gradient(160deg, #0f172a, #172554);
        border: 2px solid rgba(147, 197, 253, 0.55); color: #f8fafc;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
      }
      .bc-calm-close-btn {
        padding: 7px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.25);
        background: rgba(15, 23, 42, 0.8); color: #f8fafc; font-weight: 800; cursor: pointer;
      }
      .bc-calm-breath-zone {
        height: 158px; display: flex; align-items: center; justify-content: center; margin: 8px 0 14px 0;
      }
      .bc-calm-orb {
        width: 122px; height: 122px; border-radius: 50%;
        background: radial-gradient(circle, #60a5fa, #0284c7);
        border: 3px solid rgba(224, 242, 254, 0.8);
        box-shadow: 0 0 34px rgba(56, 189, 248, 0.6);
        display: flex; align-items: center; justify-content: center; text-align: center;
        padding: 12px; font-size: 12px; font-weight: 900; color: #ffffff;
        transition: transform 4.8s ease-in-out;
      }
      .bc-calm-mood-grid {
        display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px;
      }
      .bc-calm-mood-btn {
        padding: 10px 6px; border-radius: 14px; border: 2px solid #60a5fa;
        background: rgba(15, 23, 42, 0.78); color: #f8fafc; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; gap: 6px;
      }
      .bc-calm-help-btn {
        padding: 9px 14px; border-radius: 12px; border: 1px solid rgba(74,222,128,0.5);
        background: rgba(20, 83, 45, 0.75); color: #dcfce7; font-weight: 800;
        font-size: 12px; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }
}
