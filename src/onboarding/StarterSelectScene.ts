import type { BrawlerId, IBrawler } from '../types/cctp';
import { getAllBrawlers, getBrawlerById } from '../entities/Brawlers';
import { getSubjectVisualMeta } from '../services/QuestionProvider';
import { soundManager } from '../services/SoundManager';

export interface IStarterSelectOptions {
  /** Héros présélectionné par défaut sur le podium */
  initialBrawlerId?: BrawlerId;
  /** Pseudo affiché sur le podium de rentrée */
  playerNickname?: string;
  /** Icône de profil choisie à l'étape 1 */
  profileIcon?: string;
  /** Callback déclenché lors du clic sur "Choisir ce Héros" */
  onSelect: (brawlerId: BrawlerId) => void;
  /** Callback optionnel pour revenir à la Carte de Collégien */
  onBack?: () => void;
}

interface IBrawlerCardVisual {
  accent: string;
  bgGlow: string;
  portraitPath: string;
  tagline: string;
  roleBadge: string;
}

const BRAWLER_VISUALS: Record<BrawlerId, IBrawlerCardVisual> = {
  TIMO: {
    accent: '#ffd426',
    bgGlow: 'rgba(250, 204, 21, 0.25)',
    portraitPath: '/assets/timo.jpg',
    tagline: 'Tireur rapide et précis : parfait pour enchaîner les calculs !',
    roleBadge: 'TIREUR D’ÉLITE',
  },
  LEO: {
    accent: '#c084fc',
    bgGlow: 'rgba(192, 132, 252, 0.25)',
    portraitPath: '/assets/leo.jpg',
    tagline: 'Lance des fioles d’encre par-dessus les murs et soigne avec son Dico !',
    roleBadge: 'ARTILLEUR ZONE',
  },
  MAYA: {
    accent: '#4ade80',
    bgGlow: 'rgba(74, 222, 128, 0.25)',
    portraitPath: '/assets/maya.jpg',
    tagline: 'Tank solide avec bouclier géant qui fige les cibles pour lire sans stress !',
    roleBadge: 'TANK CONTRÔLE',
  },
  ZACK: {
    accent: '#22d3ee',
    bgGlow: 'rgba(34, 211, 238, 0.25)',
    portraitPath: '/assets/zack.jpg',
    tagline: 'Super vitesse en rollers : double salve sonore et téléportation éclair !',
    roleBadge: 'ASSASSIN FURTIF',
  },
};

const MAX_HP_REF = 5500;
const MAX_SPEED_REF = 860;
const MAX_DAMAGE_REF = 1200;
const MAX_RANGE_REF = 580;

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

/**
 * Écran 2 du tunnel FTUE : Podium interactif « Choisis ton Champion de Rentrée ».
 * Présente les 4 Brawlers (Timo, Léo, Maya, Zack) avec statistiques visuelles,
 * spécialité scolaire et bouton « Choisir ce Héros ».
 */
export class StarterSelectScene {
  private readonly container: HTMLElement;
  private readonly options: IStarterSelectOptions;
  private focusedBrawlerId: BrawlerId;
  private rootEl: HTMLElement | null = null;

  constructor(container: HTMLElement, options: IStarterSelectOptions) {
    this.container = container;
    this.options = options;
    this.focusedBrawlerId = options.initialBrawlerId ?? 'TIMO';
  }

  public mount(): void {
    this.unmount();
    const wrapper = document.createElement('div');
    wrapper.className = 'ftue-starter-scene brawl-pop';
    this.rootEl = wrapper;
    this.container.appendChild(wrapper);
    this.render();
  }

  public unmount(): void {
    this.rootEl?.remove();
    this.rootEl = null;
  }

  public getFocusedBrawlerId(): BrawlerId {
    return this.focusedBrawlerId;
  }

  public focusBrawler(brawlerId: BrawlerId): void {
    this.focusedBrawlerId = brawlerId;
    this.render();
  }

  private render(): void {
    if (!this.rootEl) return;

    const brawlers = getAllBrawlers();
    const active: IBrawler = getBrawlerById(this.focusedBrawlerId);
    const visual = BRAWLER_VISUALS[active.id];
    const subjectMeta = getSubjectVisualMeta(active.favorite_subject);
    const secondaryMeta = active.secondary_subject
      ? getSubjectVisualMeta(active.secondary_subject)
      : null;

    const totalSalvoDmg = active.basic_attack.base_damage * active.basic_attack.projectiles_count;
    const hpPct = Math.min(100, Math.round((active.base_hp / MAX_HP_REF) * 100));
    const speedPct = Math.min(100, Math.round((active.speed_value / MAX_SPEED_REF) * 100));
    const dmgPct = Math.min(100, Math.round((totalSalvoDmg / MAX_DAMAGE_REF) * 100));
    const rangePct = Math.min(100, Math.round((active.basic_attack.range / MAX_RANGE_REF) * 100));

    const playerName = this.options.playerNickname?.trim() || 'Nouveau Collégien';
    const icon = this.options.profileIcon || '🎒';

    const rosterCardsHtml = brawlers
      .map((b) => {
        const bVis = BRAWLER_VISUALS[b.id];
        const bSubj = getSubjectVisualMeta(b.favorite_subject);
        const isSelected = b.id === active.id;
        return `
          <button
            type="button"
            data-starter-id="${b.id}"
            class="ftue-starter-chip ${isSelected ? 'is-selected' : ''}"
            style="--hero-accent:${bVis.accent}; --hero-glow:${bVis.bgGlow};"
            aria-pressed="${isSelected ? 'true' : 'false'}"
          >
            <div class="ftue-starter-avatar-wrap" style="border-color:${bVis.accent};">
              <img src="${bVis.portraitPath}" alt="${escapeHtml(b.name)}" class="ftue-starter-avatar" />
              ${isSelected ? '<span class="ftue-starter-selected-pin">★</span>' : ''}
            </div>
            <div class="ftue-starter-chip-meta">
              <div class="brawl-outline-text ftue-starter-chip-name" style="color:${bVis.accent};">
                ${escapeHtml(b.name)}
              </div>
              <div class="ftue-starter-chip-subj" style="color:${bSubj.accent_color};">
                ${bSubj.icon} ${escapeHtml(bSubj.short_label)}
              </div>
              <div class="ftue-starter-chip-hp">❤️ ${b.base_hp} PV</div>
            </div>
          </button>
        `;
      })
      .join('');

    this.rootEl.innerHTML = `
      <div class="ftue-wizard-panel brawl-modal-panel" style="width:min(940px, 96vw); padding:20px 22px;">
        <div class="ftue-header-row">
          <div>
            <div class="brawl-outline-text ftue-step-pill">ÉTAPE 2 / 2 • PODIUM DES ÉLÈVES-HÉROS</div>
            <h2 class="brawl-title ftue-main-title">🏆 CHOISIS TON CHAMPION DE RENTRÉE</h2>
          </div>
          <div class="ftue-badge-preview-mini">
            <span class="ftue-mini-icon">${escapeHtml(icon)}</span>
            <div>
              <div style="font-size:10px; color:#93c5fd; font-weight:800;">CARTE COLLÉGIEN</div>
              <div style="font-size:13px; color:#fef08a; font-weight:900;">${escapeHtml(playerName)}</div>
            </div>
          </div>
        </div>

        <div class="ftue-starter-layout">
          <!-- Colonne gauche : Sélecteur des 4 Brawlers -->
          <div class="ftue-starter-roster-col">
            <div class="ftue-section-label">LES 4 HÉROS DE LA 6ÈME</div>
            <div class="ftue-starter-grid">
              ${rosterCardsHtml}
            </div>
          </div>

          <!-- Colonne droite : Fiche détaillée & Stats visuelles -->
          <div class="ftue-starter-spotlight" style="--hero-accent:${visual.accent}; --hero-glow:${visual.bgGlow};">
            <div class="ftue-spotlight-hero-head">
              <div class="ftue-spotlight-portrait-frame" style="border-color:${visual.accent}; box-shadow:0 0 26px ${visual.bgGlow};">
                <img src="${visual.portraitPath}" alt="${escapeHtml(active.name)}" />
              </div>
              <div class="ftue-spotlight-identity">
                <div class="ftue-role-pill" style="border-color:${visual.accent}; color:${visual.accent};">
                  ${visual.roleBadge}
                </div>
                <h3 class="brawl-title" style="margin:4px 0 2px; font-size:28px; color:${visual.accent};">
                  ${escapeHtml(active.name)}
                </h3>
                <div style="font-size:13px; font-weight:800; color:#e2e8f0; margin-bottom:6px;">
                  ${escapeHtml(active.title)} • <span style="color:#94a3b8;">${escapeHtml(active.archetype)}</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  <span class="brawl-subject-tag" style="background:${subjectMeta.badge_bg}; color:#f8fafc; border-color:${subjectMeta.accent_color};">
                    ${subjectMeta.icon} Spécialité : ${escapeHtml(subjectMeta.short_label)}
                  </span>
                  ${
                    secondaryMeta
                      ? `<span class="brawl-subject-tag" style="background:${secondaryMeta.badge_bg}; color:#f8fafc; border-color:${secondaryMeta.accent_color};">
                          ${secondaryMeta.icon} + ${escapeHtml(secondaryMeta.short_label)}
                        </span>`
                      : ''
                  }
                </div>
              </div>
            </div>

            <div class="ftue-tagline-box">
              💬 « ${escapeHtml(visual.tagline)} »
            </div>

            <!-- Barres de statistiques visuelles -->
            <div class="ftue-stats-bars">
              <div class="ftue-stat-row">
                <span class="ftue-stat-label">❤️ Santé (PV)</span>
                <div class="ftue-stat-track">
                  <div class="ftue-stat-fill" style="width:${hpPct}%; background:linear-gradient(90deg,#22c55e,#4ade80);"></div>
                </div>
                <span class="ftue-stat-val">${active.base_hp}</span>
              </div>
              <div class="ftue-stat-row">
                <span class="ftue-stat-label">⚡ Vitesse</span>
                <div class="ftue-stat-track">
                  <div class="ftue-stat-fill" style="width:${speedPct}%; background:linear-gradient(90deg,#0284c7,#38bdf8);"></div>
                </div>
                <span class="ftue-stat-val">${active.speed_value}</span>
              </div>
              <div class="ftue-stat-row">
                <span class="ftue-stat-label">🎯 Attaque</span>
                <div class="ftue-stat-track">
                  <div class="ftue-stat-fill" style="width:${dmgPct}%; background:linear-gradient(90deg,#f59e0b,#ffd426);"></div>
                </div>
                <span class="ftue-stat-val">${
                  active.basic_attack.projectiles_count > 1
                    ? `${active.basic_attack.projectiles_count}×${active.basic_attack.base_damage}`
                    : `${active.basic_attack.base_damage}`
                }</span>
              </div>
              <div class="ftue-stat-row">
                <span class="ftue-stat-label">📏 Portée</span>
                <div class="ftue-stat-track">
                  <div class="ftue-stat-fill" style="width:${rangePct}%; background:linear-gradient(90deg,#9333ea,#c084fc);"></div>
                </div>
                <span class="ftue-stat-val">${active.basic_attack.range}</span>
              </div>
            </div>

            <!-- Capacités du Héros -->
            <div class="ftue-abilities-grid">
              <div class="ftue-ability-card">
                <div class="ftue-ability-title" style="color:#38bdf8;">🎯 ${escapeHtml(active.basic_attack.name)}</div>
                <div class="ftue-ability-desc">${escapeHtml(active.basic_attack.description)}</div>
              </div>
              <div class="ftue-ability-card">
                <div class="ftue-ability-title" style="color:#ffd426;">🟡 Super : ${escapeHtml(active.super_ability.name)}</div>
                <div class="ftue-ability-desc">${escapeHtml(active.super_ability.description)}</div>
              </div>
              <div class="ftue-ability-card">
                <div class="ftue-ability-title" style="color:#4ade80;">🟢 Gadget (×3) : ${escapeHtml(active.gadget.name)}</div>
                <div class="ftue-ability-desc">${escapeHtml(active.gadget.description)}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="ftue-actions-footer">
          ${
            this.options.onBack
              ? `<button id="ftue-starter-back" type="button" class="brawl-btn brawl-btn-blue">
                  ⬅ Modifier ma Carte
                </button>`
              : '<span></span>'
          }
          <button id="ftue-starter-confirm" type="button" class="brawl-btn brawl-btn-lg brawl-btn-yellow brawl-pulse" style="min-width:270px;">
            ⚡ CHOISIR CE HÉROS (${escapeHtml(active.name.toUpperCase())})
          </button>
        </div>
      </div>
    `;

    this.rootEl.querySelectorAll<HTMLButtonElement>('[data-starter-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bId = btn.dataset.starterId as BrawlerId | undefined;
        if (!bId || bId === this.focusedBrawlerId) return;
        playSafeClickSound();
        this.focusBrawler(bId);
      });
    });

    this.rootEl.querySelector<HTMLButtonElement>('#ftue-starter-back')?.addEventListener('click', () => {
      playSafeClickSound();
      this.options.onBack?.();
    });

    this.rootEl
      .querySelector<HTMLButtonElement>('#ftue-starter-confirm')
      ?.addEventListener('click', () => {
        soundManager.playSuperReady();
        this.options.onSelect(this.focusedBrawlerId);
      });
  }
}
