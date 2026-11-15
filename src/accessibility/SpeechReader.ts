import type { IQuestion } from '../types/cctp';

export interface ISpeechReaderOptions {
  enabled?: boolean;
  autoReadOnQuestion?: boolean;
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
}

export interface ISpeechReaderState {
  supported: boolean;
  enabled: boolean;
  autoReadOnQuestion: boolean;
  speaking: boolean;
  activeVoiceName: string | null;
  lastSpokenText: string;
}

const STORAGE_KEY = 'brawl_college_tts_settings_v1';

/**
 * Synthèse vocale hors-ligne non-bloquante pour la lecture des énoncés (Agent 16 - Neuro-Ergonomie).
 * Utilise `window.speechSynthesis` en priorité avec une voix locale `fr-FR`.
 */
export class SpeechReader {
  private enabled: boolean;
  private autoReadOnQuestion: boolean;
  private rate: number;
  private pitch: number;
  private volume: number;
  private lang: string;
  private lastSpokenText = '';
  private lastSpokenQuestionId: string | null = null;
  private cachedFrenchVoice: SpeechSynthesisVoice | null = null;

  constructor(options: ISpeechReaderOptions = {}) {
    const saved = this.loadSettings();
    this.enabled = options.enabled ?? saved.enabled ?? true;
    this.autoReadOnQuestion =
      options.autoReadOnQuestion ?? saved.autoReadOnQuestion ?? false;
    this.rate = Math.max(0.65, Math.min(1.45, options.rate ?? 1.02));
    this.pitch = Math.max(0.7, Math.min(1.4, options.pitch ?? 1.05));
    this.volume = Math.max(0, Math.min(1, options.volume ?? 0.95));
    this.lang = options.lang ?? 'fr-FR';
    this.refreshVoiceSelection();
  }

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    );
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.stop();
    }
    this.saveSettings();
  }

  public isAutoReadEnabled(): boolean {
    return this.autoReadOnQuestion;
  }

  public setAutoRead(autoRead: boolean): void {
    this.autoReadOnQuestion = Boolean(autoRead);
    this.saveSettings();
  }

  public getState(): ISpeechReaderState {
    const synth = this.getSynthesis();
    return {
      supported: this.isSupported(),
      enabled: this.enabled,
      autoReadOnQuestion: this.autoReadOnQuestion,
      speaking: Boolean(synth?.speaking),
      activeVoiceName: this.cachedFrenchVoice?.name ?? null,
      lastSpokenText: this.lastSpokenText,
    };
  }

  /**
   * Normalise l'énoncé scolaire pour une prononciation française naturelle.
   */
  public formatForFrenchSpeech(rawPrompt: string): string {
    return rawPrompt
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, ' ')
      .replace(/_{2,}|\.{3,}/g, ' à compléter ')
      .replace(/(\d)\s*[×xX*]\s*(\d)/g, '$1 fois $2')
      .replace(/(\d)\s*[÷/]\s*(\d)/g, '$1 divisé par $2')
      .replace(/\s*\+\s*/g, ' plus ')
      .replace(/\s*=\s*/g, ' égale ')
      .replace(/\bcm²\b/gi, 'centimètres carrés')
      .replace(/\bm²\b/gi, 'mètres carrés')
      .replace(/\bkm\b/gi, 'kilomètres')
      .replace(/\bkg\b/gi, 'kilogrammes')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Lit la question automatiquement si `autoReadOnQuestion` est actif, ou sur demande (`force = true`).
   */
  public speakQuestion(
    question: Pick<IQuestion, 'id' | 'hud_prompt'>,
    force = false
  ): boolean {
    if (!force && !this.autoReadOnQuestion) {
      return false;
    }
    if (!force && this.lastSpokenQuestionId === question.id) {
      return false;
    }
    this.lastSpokenQuestionId = question.id;
    const spokenText = this.formatForFrenchSpeech(question.hud_prompt);
    return this.speakText(spokenText);
  }

  /**
   * Déclenche une lecture asynchrone non-bloquante via `window.speechSynthesis`.
   */
  public speakText(text: string): boolean {
    if (!this.enabled || !this.isSupported()) {
      return false;
    }
    const cleaned = text.trim();
    if (!cleaned) {
      return false;
    }

    const synth = this.getSynthesis();
    if (!synth) {
      return false;
    }

    try {
      this.refreshVoiceSelection();
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = this.lang;
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;
      utterance.volume = this.volume;

      if (this.cachedFrenchVoice) {
        utterance.voice = this.cachedFrenchVoice;
      }

      this.lastSpokenText = cleaned;

      // Planification micro-asynchrone pour ne jamais bloquer la frame de gameplay
      window.setTimeout(() => {
        try {
          synth.speak(utterance);
        } catch {
          // Tolérance silencieuse si l'API vocale bloque hors geste utilisateur
        }
      }, 0);

      return true;
    } catch {
      return false;
    }
  }

  public stop(): void {
    const synth = this.getSynthesis();
    if (!synth) return;
    try {
      synth.cancel();
    } catch {
      // Ignorer
    }
  }

  public mountAudioButton(
    container: HTMLElement,
    getCurrentQuestion: () => Pick<IQuestion, 'id' | 'hud_prompt'> | null
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-tts-read-btn', 'true');
    button.textContent = '🔊 Écouter';
    button.style.cssText = `
      padding:6px 12px;border-radius:999px;border:2px solid rgba(56,189,248,0.6);
      background:rgba(15,23,42,0.85);color:#f8fafc;font-weight:800;font-size:12px;
      cursor:pointer;display:inline-flex;align-items:center;gap:6px;
    `;
    button.addEventListener('click', () => {
      const q = getCurrentQuestion();
      if (q) {
        this.speakQuestion(q, true);
      }
    });
    container.appendChild(button);
    return button;
  }

  private getSynthesis(): SpeechSynthesis | null {
    if (!this.isSupported()) {
      return null;
    }
    return window.speechSynthesis;
  }

  private refreshVoiceSelection(): void {
    const synth = this.getSynthesis();
    if (!synth) return;
    try {
      const voices = synth.getVoices();
      if (!voices || voices.length === 0) return;

      const frVoices = voices.filter((v) =>
        v.lang.toLowerCase().startsWith('fr')
      );
      if (frVoices.length === 0) return;

      const exactLocal = frVoices.find(
        (v) => v.lang.toLowerCase() === 'fr-fr' && v.localService
      );
      const exact = frVoices.find((v) => v.lang.toLowerCase() === 'fr-fr');
      const local = frVoices.find((v) => v.localService);

      this.cachedFrenchVoice = exactLocal ?? exact ?? local ?? frVoices[0];
    } catch {
      // Certains navigateurs chargent les voix de manière asynchrone
    }
  }

  private loadSettings(): { enabled?: boolean; autoReadOnQuestion?: boolean } {
    if (typeof localStorage === 'undefined') {
      return {};
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) as { enabled?: boolean; autoReadOnQuestion?: boolean };
    } catch {
      return {};
    }
  }

  private saveSettings(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          enabled: this.enabled,
          autoReadOnQuestion: this.autoReadOnQuestion,
        })
      );
    } catch {
      // Stockage local indisponible
    }
  }
}
