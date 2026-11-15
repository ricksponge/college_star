import type {
  IAccessibilitySettings,
  IQuestion,
  ISubjectVisualMeta,
  SubjectCategory,
} from '../types/cctp';
import { getSubjectVisualMeta } from '../services/QuestionProvider';
import { soundManager } from '../services/SoundManager';

export interface ICognitiveLogicTree {
  /** Ligne 1 gauche : repère court (2-4 mots max) */
  cue: string;
  /** Ligne 1 droite : règle éclair (4-6 mots max) */
  rule: string;
  /** Ligne 2 gauche : exemple flash ultra-court */
  example: string;
  /** Ligne 2 droite : réflexe 6ème actionnable */
  reflex: string;
}

export interface ICognitiveHintOverlayOptions {
  /** Conteneur hôte (défaut : document.body) */
  container?: HTMLElement;
  /** Durée d'affichage de la bulle flash en ms (défaut : 4800) */
  displayDurationMs?: number;
  /** Seuil d'erreurs consécutives (défaut : 2) */
  consecutiveErrorThreshold?: number;
  /** Paramètres d'accessibilité (auto_hint_assist active/désactive le déclenchement auto) */
  accessibility?: Partial<IAccessibilitySettings>;
  /** Active le son discret d'indice (défaut : true) */
  enableSound?: boolean;
  /** Callback déclenché à chaque affichage de bulle logique */
  onHintShown?: (subject: SubjectCategory, tree: ICognitiveLogicTree, question?: IQuestion) => void;
}

const STYLE_ID = 'brawl-ux-hint-styles';
const DEFAULT_DISPLAY_MS = 4800;
const DEFAULT_THRESHOLD = 2;

/** Dictionnaire de base par matière (5 piliers 6ème) */
export const SUBJECT_LOGIC_TREES: Record<SubjectCategory, ICognitiveLogicTree> = {
  mathematiques: {
    cue: 'Décompose en 10',
    rule: 'Arrondis puis ajuste',
    example: '7 × 8 = 70 − 14',
    reflex: 'Réflexe : 56',
  },
  francais: {
    cue: 'Teste un remplaçant',
    rule: 'Verbe = était / vendre',
    example: 'Il « avait » faim',
    reflex: 'Sans accent : a',
  },
  anglais: {
    cue: 'Qui agit ?',
    rule: 'BE = état • HAVE = avoir',
    example: 'She IS 11 • I HAVE a pen',
    reflex: 'Âge = toujours BE',
  },
  histoire_geo_sciences: {
    cue: 'Mot-clé repère',
    rule: 'Ordre chrono ou échelle',
    example: 'Terre = 3e planète',
    reflex: 'Mémo : MVTM',
  },
  vie_au_college: {
    cue: '1er chiffre = Étage',
    rule: '1xx ➔ 1er • 2xx ➔ 2e',
    example: 'Salle 204',
    reflex: '2e étage, porte 04',
  },
};

/** Spécialisations contextuelles selon question.skill_code */
export const SKILL_LOGIC_TREES: Record<string, ICognitiveLogicTree> = {
  MATH_MUL: {
    cue: 'Double ou 10−n',
    rule: '×4 = ×2×2 • ×9 = ×10−n',
    example: '8 × 9 = 80 − 8',
    reflex: 'Réflexe : 72',
  },
  MATH_DIV: {
    cue: 'Table à l’envers',
    rule: 'Diviseur × ? = Dividende',
    example: '56 ÷ 7 ➔ 7 × 8',
    reflex: 'Quotient = 8',
  },
  MATH_FRAC: {
    cue: 'Parts égales',
    rule: '1/2 = 0,5 • 1/4 = 0,25',
    example: '3/4 = 3 × 0,25',
    reflex: 'Réflexe : 0,75',
  },
  MATH_CONV: {
    cue: 'Tableau ×10 / ÷10',
    rule: 'kilo = 1000 • centi = ÷100',
    example: '2,5 m ➔ 250 cm',
    reflex: 'Décale de 2 rangs',
  },
  MATH_GEOM: {
    cue: 'Périmètre ≠ Aire',
    rule: 'Tour = + • Surface = ×',
    example: 'Carré 4cm : P=16 • A=16',
    reflex: 'Lis l’unité (cm / cm²)',
  },
  MATH_PRIO: {
    cue: 'Ordre strict',
    rule: '( ) puis ×/÷ puis +/−',
    example: '3 + 4 × 2 = 3 + 8',
    reflex: 'Réflexe : 11',
  },
  FR_HOMO: {
    cue: 'Remplace le mot',
    rule: 'avait=a • étaient=sont • et puis=et',
    example: 'Ces (montrer) ≠ Ses (à lui)',
    reflex: 'Test éclair 1s',
  },
  FR_ACC: {
    cue: 'Qui fait l’action ?',
    rule: 'Sujet pluriel = verbe -nt',
    example: 'Les amis (ils) arrivent',
    reflex: 'Ignore les mots entre !',
  },
  FR_TERM: {
    cue: '-É ou -ER ?',
    rule: 'vendu = -é • vendre = -er',
    example: 'Il a « vendu » ➔ -É',
    reflex: 'Après avoir/être = -é',
  },
  FR_NAT: {
    cue: 'Test du groupe',
    rule: 'Nom + Adj • Verbe = action',
    example: '« très » + mot = Adjectif',
    reflex: 'Pose « Qui/Quoi ? »',
  },
  FR_PREF: {
    cue: 'Coupe le radical',
    rule: 'Préfixe avant • Suffixe après',
    example: 'im + possible',
    reflex: 'in-/im-/dé- = contraire',
  },
  ANG_AUX: {
    cue: 'BE ou HAVE ?',
    rule: 'He/She/It ➔ IS / HAS',
    example: 'She IS happy • He HAS a dog',
    reflex: '3e pers. = -s final',
  },
  ANG_INT: {
    cue: 'Mot en WH-',
    rule: 'Who=Qui • Where=Où • When=Quand',
    example: 'How many = Combien',
    reflex: 'Repère le 1er mot',
  },
  ANG_NUM: {
    cue: '-TEEN ≠ -TY',
    rule: '13-19 = -teen • 20-90 = -ty',
    example: '15 fifteen ≠ 50 fifty',
    reflex: 'Dizaine avant unité',
  },
  ANG_PRON: {
    cue: 'Personne ciblée',
    rule: 'He=garçon • She=fille • They=eux',
    example: 'Tom & Léa ➔ They',
    reflex: 'Objet/Animal = It',
  },
  ANG_VOC: {
    cue: 'Sens transparent',
    rule: 'Indice = contexte école',
    example: 'Library = CDI / Bibliothèque',
    reflex: 'Élimine les intrus',
  },
  HG_PER: {
    cue: 'Frise chrono',
    rule: 'Préhist. ➔ Antiq. ➔ M.Âge ➔ Mod.',
    example: '-3000 Écriture = Antiquité',
    reflex: '1492 = Temps Modernes',
  },
  HG_GEO: {
    cue: 'Nord / Sud / Mer',
    rule: '6 continents • 5 océans',
    example: 'Atlantique à l’Ouest',
    reflex: 'Visualise la carte',
  },
  SCI_SOL: {
    cue: 'Soleil au centre',
    rule: 'Mercure-Vénus-Terre-Mars',
    example: 'Jupiter-Saturne-Uranus-Neptune',
    reflex: '8 planètes au total',
  },
  SCI_MAT: {
    cue: '3 états simples',
    rule: 'Solide • Liquide • Gaz',
    example: '0°C glace • 100°C vapeur',
    reflex: 'Masse en g/kg • Vol. en L',
  },
  SCI_VIV: {
    cue: 'Chaîne alimentaire',
    rule: 'Plante ➔ Herbivore ➔ Carnivore',
    example: 'Producteur = toujours végétal',
    reflex: 'Flèche = « est mangé par »',
  },
  COL_EDT: {
    cue: 'Lis Semaine & Salle',
    rule: 'Sem. A/B • 1er chiffre = étage',
    example: 'Salle 204 (Sem. B)',
    reflex: '2e étage, porte 04',
  },
  COL_ADU: {
    cue: 'Qui fait quoi ?',
    rule: 'CPE=absences • CDI=livres',
    example: 'Prof Principal = suivi classe',
    reflex: 'Principal = chef collège',
  },
  COL_CONS: {
    cue: 'Coupe la consigne',
    rule: '1 verbe = 1 action',
    example: '« Souligne puis entoure »',
    reflex: 'Fais dans l’ordre exact',
  },
  COL_SAC: {
    cue: 'Veille au soir',
    rule: 'Cahier du jour + trousse',
    example: 'Check emploi du temps',
    reflex: 'Zéro oubli le matin',
  },
  COL_LIEUX: {
    cue: 'Zone du collège',
    rule: 'CDI=calme • Vie Sco=billets',
    example: 'Infirmerie = bobo / santé',
    reflex: 'Repère sur le plan',
  },
  COL_CPS: {
    cue: 'Réflexe sérénité',
    rule: 'Observe 1s avant d’agir',
    example: 'Pause • Respire • Choisis',
    reflex: 'Calme = précision',
  },
  COL_STRESS: {
    cue: 'Zéro panique 6e',
    rule: '1 étape à la fois',
    example: 'Erreur = indice pour réussir',
    reflex: 'Tu gères le tempo !',
  },
};

function injectHintStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .brawl-ux-hint-host {
      position: fixed;
      top: 70px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9400;
      width: min(460px, calc(100vw - 32px));
      pointer-events: none !important;
      font-family: var(--brawl-font-ui, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif);
    }

    .brawl-ux-hint-host * {
      pointer-events: none !important;
      box-sizing: border-box;
    }

    .brawl-ux-hint-card {
      position: relative;
      overflow: hidden;
      padding: 10px 13px 12px;
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(19, 29, 71, 0.96) 0%, rgba(9, 14, 38, 0.97) 100%);
      border: 3px solid var(--brawl-ink, #090d16);
      box-shadow:
        0 5px 0 var(--brawl-ink, #090d16),
        0 14px 28px rgba(0, 0, 0, 0.6);
      animation: brawl-ux-hint-pop 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .brawl-ux-hint-tree {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .brawl-ux-hint-row {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }

    .brawl-ux-hint-row.is-branch {
      padding-left: 10px;
    }

    .brawl-ux-hint-elbow {
      flex-shrink: 0;
      width: 14px;
      height: 16px;
      border-left: 2.5px solid #ffd426;
      border-bottom: 2.5px solid #ffd426;
      border-bottom-left-radius: 6px;
      margin-top: -6px;
      opacity: 0.9;
    }

    .brawl-ux-hint-node {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 9px;
      border-radius: 10px;
      border: 2px solid var(--brawl-ink, #090d16);
      background: rgba(30, 41, 59, 0.95);
      color: #f8fafc;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 48%;
      box-shadow: 0 2px 0 var(--brawl-ink, #090d16);
    }

    .brawl-ux-hint-node.is-cue {
      font-weight: 900;
      color: #fef08a;
    }

    .brawl-ux-hint-node.is-reflex {
      background: linear-gradient(180deg, rgba(22, 163, 74, 0.35), rgba(15, 23, 42, 0.95));
      border-color: #38e54d;
      color: #bbf7d0;
      font-weight: 900;
    }

    .brawl-ux-hint-arrow {
      flex-shrink: 0;
      font-size: 13px;
      font-weight: 900;
      color: #ffd426;
      text-shadow: 0 1px 0 var(--brawl-ink, #090d16);
    }

    .brawl-ux-hint-timer {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3.5px;
      background: rgba(255, 255, 255, 0.08);
    }

    .brawl-ux-hint-timer-fill {
      height: 100%;
      width: 100%;
      transform-origin: left center;
      animation: brawl-ux-hint-shrink var(--hint-duration, 4800ms) linear forwards;
    }

    @keyframes brawl-ux-hint-pop {
      from { opacity: 0; transform: translateY(-10px) scale(0.92); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes brawl-ux-hint-shrink {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .brawl-ux-hint-card,
      .brawl-ux-hint-timer-fill {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Coach cognitif discret (« Zéro Friction Scolaire ») :
 * - Suit les erreurs consécutives par matière via recordAnswerResult().
 * - Dès 2 erreurs consécutives sur une même matière, affiche une bulle flash
 *   structurée en mini-arbre logique de 2 lignes ultra-visuelles.
 * - pointer-events: none strict pour ne jamais bloquer le double stick tactile.
 */
export class CognitiveHintOverlay {
  private readonly container: HTMLElement;
  private readonly displayDurationMs: number;
  private readonly threshold: number;
  private readonly enableSound: boolean;
  private readonly onHintShown?: ICognitiveHintOverlayOptions['onHintShown'];

  private autoHintEnabled: boolean;
  private readonly consecutiveErrors: Record<SubjectCategory, number> = {
    mathematiques: 0,
    francais: 0,
    anglais: 0,
    histoire_geo_sciences: 0,
    vie_au_college: 0,
  };

  private hostEl: HTMLDivElement | null = null;
  private dismissTimerId: number | null = null;
  private destroyed = false;

  constructor(options: ICognitiveHintOverlayOptions = {}) {
    this.container = options.container ?? document.body;
    this.displayDurationMs = Math.max(1500, options.displayDurationMs ?? DEFAULT_DISPLAY_MS);
    this.threshold = Math.max(1, options.consecutiveErrorThreshold ?? DEFAULT_THRESHOLD);
    this.autoHintEnabled = options.accessibility?.auto_hint_assist !== false;
    this.enableSound = options.enableSound !== false;
    this.onHintShown = options.onHintShown;
  }

  /**
   * Enregistre le résultat d'une tentative sur une matière.
   * Retourne true si une bulle flash d'astuce logique vient d'être déclenchée.
   */
  public recordAnswerResult(
    subject: SubjectCategory,
    isCorrect: boolean,
    question?: IQuestion
  ): boolean {
    if (this.destroyed) {
      return false;
    }

    if (isCorrect) {
      this.consecutiveErrors[subject] = 0;
      return false;
    }

    this.consecutiveErrors[subject] = (this.consecutiveErrors[subject] ?? 0) + 1;
    const count = this.consecutiveErrors[subject];

    if (!this.autoHintEnabled) {
      return false;
    }

    if (count >= this.threshold && count % this.threshold === 0) {
      this.showHint(subject, question);
      return true;
    }

    return false;
  }

  public showHint(subject: SubjectCategory, question?: IQuestion): void {
    if (this.destroyed) {
      return;
    }
    injectHintStyles();

    const meta = getSubjectVisualMeta(subject);
    const tree = this.resolveLogicTree(subject, question);

    this.renderLogicTreeCard(meta, tree);

    if (this.enableSound) {
      soundManager.playGadget();
    }

    this.onHintShown?.(subject, tree, question);
  }

  public hideHint(): void {
    if (this.dismissTimerId !== null) {
      window.clearTimeout(this.dismissTimerId);
      this.dismissTimerId = null;
    }
    this.hostEl?.remove();
    this.hostEl = null;
  }

  public getConsecutiveErrors(subject: SubjectCategory): number {
    return this.consecutiveErrors[subject] ?? 0;
  }

  public resetErrors(subject?: SubjectCategory): void {
    if (subject) {
      this.consecutiveErrors[subject] = 0;
      return;
    }
    (Object.keys(this.consecutiveErrors) as SubjectCategory[]).forEach((key) => {
      this.consecutiveErrors[key] = 0;
    });
  }

  public setAccessibility(settings: Partial<IAccessibilitySettings>): void {
    if (settings.auto_hint_assist !== undefined) {
      this.autoHintEnabled = settings.auto_hint_assist;
    }
  }

  public resolveLogicTree(
    subject: SubjectCategory,
    question?: IQuestion
  ): ICognitiveLogicTree {
    if (question?.skill_code) {
      const normalized = question.skill_code.trim().toUpperCase();
      if (SKILL_LOGIC_TREES[normalized]) {
        return SKILL_LOGIC_TREES[normalized];
      }
    }
    return SUBJECT_LOGIC_TREES[subject];
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.hideHint();
  }

  private renderLogicTreeCard(
    meta: ISubjectVisualMeta,
    tree: ICognitiveLogicTree
  ): void {
    this.hideHint();

    const host = document.createElement('div');
    host.className = 'brawl-ux-hint-host';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');

    const card = document.createElement('div');
    card.className = 'brawl-ux-hint-card';
    card.style.borderColor = meta.accent_color;
    card.style.setProperty('--hint-duration', `${this.displayDurationMs}ms`);

    const treeEl = document.createElement('div');
    treeEl.className = 'brawl-ux-hint-tree';

    // Ligne 1 : [Icône Matière] Repère -> Règle éclair
    const row1 = document.createElement('div');
    row1.className = 'brawl-ux-hint-row';

    const cueNode = document.createElement('span');
    cueNode.className = 'brawl-ux-hint-node is-cue';
    cueNode.style.background = meta.badge_bg;
    cueNode.style.borderColor = meta.accent_color;
    cueNode.textContent = `${meta.icon} ${tree.cue}`;

    const arrow1 = document.createElement('span');
    arrow1.className = 'brawl-ux-hint-arrow';
    arrow1.textContent = '➔';

    const ruleNode = document.createElement('span');
    ruleNode.className = 'brawl-ux-hint-node';
    ruleNode.style.maxWidth = '52%';
    ruleNode.textContent = tree.rule;

    row1.appendChild(cueNode);
    row1.appendChild(arrow1);
    row1.appendChild(ruleNode);

    // Ligne 2 : Exemple flash -> Réflexe 6ème
    const row2 = document.createElement('div');
    row2.className = 'brawl-ux-hint-row is-branch';

    const elbow = document.createElement('span');
    elbow.className = 'brawl-ux-hint-elbow';
    elbow.style.borderColor = meta.accent_color;

    const exampleNode = document.createElement('span');
    exampleNode.className = 'brawl-ux-hint-node';
    exampleNode.textContent = tree.example;

    const arrow2 = document.createElement('span');
    arrow2.className = 'brawl-ux-hint-arrow';
    arrow2.textContent = '➔';

    const reflexNode = document.createElement('span');
    reflexNode.className = 'brawl-ux-hint-node is-reflex';
    reflexNode.textContent = tree.reflex;

    row2.appendChild(elbow);
    row2.appendChild(exampleNode);
    row2.appendChild(arrow2);
    row2.appendChild(reflexNode);

    treeEl.appendChild(row1);
    treeEl.appendChild(row2);

    const timerBar = document.createElement('div');
    timerBar.className = 'brawl-ux-hint-timer';
    const timerFill = document.createElement('div');
    timerFill.className = 'brawl-ux-hint-timer-fill';
    timerFill.style.background = meta.accent_color;
    timerBar.appendChild(timerFill);

    card.appendChild(treeEl);
    card.appendChild(timerBar);
    host.appendChild(card);

    this.hostEl = host;
    this.container.appendChild(host);

    this.dismissTimerId = window.setTimeout(() => {
      this.hideHint();
    }, this.displayDurationMs);
  }
}
