import type { ISkillMastery, SubjectCategory } from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';
import { getSubjectVisualMeta } from '../services/QuestionProvider';

export type CardRarity = 'COMMUNE' | 'RARE' | 'EPIQUE' | 'LEGENDAIRE';
export type CardFoilEffect = 'STANDARD' | 'HOLO_PRISM' | 'GOLD_FOIL';

export type CardUnlockCondition =
  | {
      type: 'SKILL_ELO';
      skill_code: string;
      min_elo: number;
      label: string;
    }
  | {
      type: 'SUBJECT_SUCCESSES';
      subject: SubjectCategory;
      min_successes: number;
      label: string;
    }
  | {
      type: 'TROPHIES';
      min_trophies: number;
      label: string;
    }
  | {
      type: 'OVERALL_ELO_AVG';
      min_elo_avg: number;
      label: string;
    };

export interface ICollectorCard {
  id: string;
  number_code: string;
  title: string;
  subtitle: string;
  subject: SubjectCategory;
  rarity: CardRarity;
  foil_effect: CardFoilEffect;
  icon: string;
  lore_tip_6e: string;
  accent_color: string;
  unlock_condition: CardUnlockCondition;
}

export interface ICollectorCardStatus {
  card: ICollectorCard;
  unlocked: boolean;
  progress_pct: number;
  unlocked_at?: string;
}

export interface ICollectorAlbumSummary {
  total_cards: number;
  unlocked_count: number;
  completion_pct: number;
  foil_unlocked_count: number;
  newly_unlocked_ids: string[];
}

const STORAGE_KEY = 'brawl_college_collector_album_v1';

export const COLLECTOR_CARDS_CATALOG: readonly ICollectorCard[] = [
  {
    id: 'CARD_01_TIMO_PYTHAGORE',
    number_code: '01/15',
    title: 'Frappe de Timo',
    subtitle: 'Tables & Réflexe Maths',
    subject: 'mathematiques',
    rarity: 'COMMUNE',
    foil_effect: 'STANDARD',
    icon: '⚽',
    lore_tip_6e: 'Astuce 6e : connaître ses tables jusqu’à 12 fait gagner 2 secondes par calcul.',
    accent_color: '#facc15',
    unlock_condition: {
      type: 'SUBJECT_SUCCESSES',
      subject: 'mathematiques',
      min_successes: 5,
      label: '5 bonnes réponses en Maths',
    },
  },
  {
    id: 'CARD_02_FRACTIONS_OR',
    number_code: '02/15',
    title: 'Cristal des Fractions',
    subtitle: 'Parts égales & Décimaux',
    subject: 'mathematiques',
    rarity: 'RARE',
    foil_effect: 'HOLO_PRISM',
    icon: '💎',
    lore_tip_6e: '1/2 = 0,5 • 1/4 = 0,25 • 3/4 = 0,75 : retiens ce trio magique !',
    accent_color: '#38bdf8',
    unlock_condition: {
      type: 'SKILL_ELO',
      skill_code: 'MATH_FRAC',
      min_elo: 1060,
      label: 'Atteindre 1060 Elo en Fractions',
    },
  },
  {
    id: 'CARD_03_GEOMETRIE_PRISM',
    number_code: '03/15',
    title: 'Équerre Prismatique',
    subtitle: 'Périmètres & Aires',
    subject: 'mathematiques',
    rarity: 'EPIQUE',
    foil_effect: 'GOLD_FOIL',
    icon: '📐',
    lore_tip_6e: 'Le périmètre fait le tour (cm), l’aire mesure la surface (cm²).',
    accent_color: '#eab308',
    unlock_condition: {
      type: 'SKILL_ELO',
      skill_code: 'MATH_GEOM',
      min_elo: 1140,
      label: 'Atteindre 1140 Elo en Géométrie',
    },
  },
  {
    id: 'CARD_04_LEO_PLUME',
    number_code: '04/15',
    title: 'Fiole de Léo',
    subtitle: 'Homophones & Accords',
    subject: 'francais',
    rarity: 'COMMUNE',
    foil_effect: 'STANDARD',
    icon: '🖋️',
    lore_tip_6e: 'Remplace par « avait » pour savoir s’il faut écrire « a » sans accent !',
    accent_color: '#c084fc',
    unlock_condition: {
      type: 'SUBJECT_SUCCESSES',
      subject: 'francais',
      min_successes: 5,
      label: '5 bonnes réponses en Français',
    },
  },
  {
    id: 'CARD_05_GRAND_ROBERT',
    number_code: '05/15',
    title: 'Le Grand Robert',
    subtitle: 'Tourelle Correctrice',
    subject: 'francais',
    rarity: 'RARE',
    foil_effect: 'HOLO_PRISM',
    icon: '📘',
    lore_tip_6e: 'Si tu peux remplacer par « vendre », écris -ER ; par « vendu », écris -É.',
    accent_color: '#a855f7',
    unlock_condition: {
      type: 'SKILL_ELO',
      skill_code: 'FR_ACC',
      min_elo: 1060,
      label: 'Atteindre 1060 Elo en Accords',
    },
  },
  {
    id: 'CARD_06_GARDIEN_VERBES',
    number_code: '06/15',
    title: 'Sceau des Terminaisons',
    subtitle: 'Maître de la Conjugaison',
    subject: 'francais',
    rarity: 'EPIQUE',
    foil_effect: 'GOLD_FOIL',
    icon: '✨',
    lore_tip_6e: 'Cherche toujours le sujet avant d’accorder le verbe, même s’il est inversé.',
    accent_color: '#d946ef',
    unlock_condition: {
      type: 'SKILL_ELO',
      skill_code: 'FR_TERM',
      min_elo: 1140,
      label: 'Atteindre 1140 Elo en Terminaisons',
    },
  },
  {
    id: 'CARD_07_ZACK_BEAT',
    number_code: '07/15',
    title: 'Casque Néon de Zack',
    subtitle: 'First Words in English',
    subject: 'anglais',
    rarity: 'COMMUNE',
    foil_effect: 'STANDARD',
    icon: '🎧',
    lore_tip_6e: 'En anglais, l’adjectif se place toujours avant le nom : a blue pen !',
    accent_color: '#22d3ee',
    unlock_condition: {
      type: 'SUBJECT_SUCCESSES',
      subject: 'anglais',
      min_successes: 5,
      label: '5 bonnes réponses en Anglais',
    },
  },
  {
    id: 'CARD_08_PASSEPORT_LV1',
    number_code: '08/15',
    title: 'Passeport Bilingue',
    subtitle: 'Questions & Auxiliaires',
    subject: 'anglais',
    rarity: 'RARE',
    foil_effect: 'HOLO_PRISM',
    icon: '🇬🇧',
    lore_tip_6e: 'Where = Où, When = Quand, Who = Qui, How many = Combien.',
    accent_color: '#06b6d4',
    unlock_condition: {
      type: 'SKILL_ELO',
      skill_code: 'ANG_INT',
      min_elo: 1070,
      label: 'Atteindre 1070 Elo en Mots Interrogatifs',
    },
  },
  {
    id: 'CARD_09_MAYA_BOUSSOLE',
    number_code: '09/15',
    title: 'Bouclier de Maya',
    subtitle: 'Chronologie & Planètes',
    subject: 'histoire_geo_sciences',
    rarity: 'COMMUNE',
    foil_effect: 'STANDARD',
    icon: '🧭',
    lore_tip_6e: 'Les 5 grandes périodes : Préhistoire, Antiquité, Moyen Âge, Temps Modernes, Époque Contemporaine.',
    accent_color: '#4ade80',
    unlock_condition: {
      type: 'SUBJECT_SUCCESSES',
      subject: 'histoire_geo_sciences',
      min_successes: 5,
      label: '5 bonnes réponses en Hist-Géo / Sciences',
    },
  },
  {
    id: 'CARD_10_SYSTEME_SOLAIRE',
    number_code: '10/15',
    title: 'Astrolabe Stellaire',
    subtitle: 'Exploration Spatiale',
    subject: 'histoire_geo_sciences',
    rarity: 'RARE',
    foil_effect: 'HOLO_PRISM',
    icon: '🪐',
    lore_tip_6e: 'Ordre des planètes : Mercure, Vénus, Terre, Mars, Jupiter, Saturne, Uranus, Neptune.',
    accent_color: '#10b981',
    unlock_condition: {
      type: 'SKILL_ELO',
      skill_code: 'SCI_SOL',
      min_elo: 1070,
      label: 'Atteindre 1070 Elo en Système Solaire',
    },
  },
  {
    id: 'CARD_11_CLES_204',
    number_code: '11/15',
    title: 'Clé de la Salle 204',
    subtitle: 'Lecture d’Emploi du Temps',
    subject: 'vie_au_college',
    rarity: 'COMMUNE',
    foil_effect: 'STANDARD',
    icon: '🔑',
    lore_tip_6e: 'Salle 204 = 2ème étage, porte 04 ! Facile pour ne jamais être en retard.',
    accent_color: '#38bdf8',
    unlock_condition: {
      type: 'SUBJECT_SUCCESSES',
      subject: 'vie_au_college',
      min_successes: 5,
      label: '5 bonnes réponses en Vie au Collège',
    },
  },
  {
    id: 'CARD_12_ALLIE_CPE',
    number_code: '12/15',
    title: 'Carnet de Liaison Doré',
    subtitle: 'Autonomie & Sérénité',
    subject: 'vie_au_college',
    rarity: 'RARE',
    foil_effect: 'HOLO_PRISM',
    icon: '🏫',
    lore_tip_6e: 'Prépare ton cartable la veille au soir : zéro stress le matin avant le bus !',
    accent_color: '#0ea5e9',
    unlock_condition: {
      type: 'SKILL_ELO',
      skill_code: 'COL_EDT',
      min_elo: 1080,
      label: 'Atteindre 1080 Elo en Emploi du Temps',
    },
  },
  {
    id: 'CARD_13_TROPHY_250',
    number_code: '13/15',
    title: 'As du Compas',
    subtitle: 'Route vers la 6ème',
    subject: 'mathematiques',
    rarity: 'EPIQUE',
    foil_effect: 'GOLD_FOIL',
    icon: '🏆',
    lore_tip_6e: 'Chaque partie t’entraîne à décider vite sans paniquer face aux pièges.',
    accent_color: '#f59e0b',
    unlock_condition: {
      type: 'TROPHIES',
      min_trophies: 250,
      label: 'Atteindre 250 Trophées',
    },
  },
  {
    id: 'CARD_14_POLYVALENCE',
    number_code: '14/15',
    title: 'Étoile Polyvalente',
    subtitle: 'Équilibre des 5 Piliers',
    subject: 'vie_au_college',
    rarity: 'EPIQUE',
    foil_effect: 'HOLO_PRISM',
    icon: '🌟',
    lore_tip_6e: 'Maîtriser un peu chaque matière est le vrai secret des élèves sereins en 6ème.',
    accent_color: '#fbbf24',
    unlock_condition: {
      type: 'OVERALL_ELO_AVG',
      min_elo_avg: 1100,
      label: 'Moyenne globale >= 1100 Elo',
    },
  },
  {
    id: 'CARD_15_MAJOR_6EME',
    number_code: '15/15',
    title: 'Major de 6ème',
    subtitle: 'Carte Collector Mythique',
    subject: 'vie_au_college',
    rarity: 'LEGENDAIRE',
    foil_effect: 'GOLD_FOIL',
    icon: '👑',
    lore_tip_6e: 'Félicitations ! Tu maîtrises le collège comme un véritable champion !',
    accent_color: '#facc15',
    unlock_condition: {
      type: 'TROPHIES',
      min_trophies: 850,
      label: 'Atteindre 850 Trophées',
    },
  },
];

/**
 * Album de Cartes Collector brillantes (Agent 13 - Live-Ops).
 * Évalue automatiquement les cartes débloquées au fil des jalons de maîtrise
 * SQLite (`skill_mastery` & `trophies`) et génère la galerie brillante.
 */
export class CollectorAlbum {
  private readonly db: LocalSQLiteDB | null;
  private unlockedDates: Record<string, string>;

  constructor(db: LocalSQLiteDB | null = null) {
    this.db = db;
    this.unlockedDates = this.loadFromStorage();
  }

  public getCatalog(): readonly ICollectorCard[] {
    return COLLECTOR_CARDS_CATALOG;
  }

  /**
   * Évalue toutes les cartes face aux statistiques actuelles et enregistre les nouveaux déblocages.
   */
  public evaluateAlbum(params?: {
    masteries?: ISkillMastery[];
    trophies?: number;
  }): { cards: ICollectorCardStatus[]; summary: ICollectorAlbumSummary } {
    const masteries = params?.masteries ?? this.db?.getAllSkillMasteries() ?? [];
    const trophies = params?.trophies ?? this.db?.getPlayerProfile().trophies ?? 0;

    const avgOverallElo =
      masteries.length > 0
        ? Math.round(masteries.reduce((sum, m) => sum + m.elo_rating, 0) / masteries.length)
        : 1000;

    const newlyUnlockedIds: string[] = [];
    const nowIso = new Date().toISOString();

    const cards: ICollectorCardStatus[] = COLLECTOR_CARDS_CATALOG.map((card) => {
      const progressPct = this.computeCardProgress(card, masteries, trophies, avgOverallElo);
      const previouslyUnlocked = Boolean(this.unlockedDates[card.id]);
      const isUnlockedNow = previouslyUnlocked || progressPct >= 100;

      if (isUnlockedNow && !previouslyUnlocked) {
        this.unlockedDates[card.id] = nowIso;
        newlyUnlockedIds.push(card.id);
      }

      return {
        card,
        unlocked: isUnlockedNow,
        progress_pct: isUnlockedNow ? 100 : progressPct,
        unlocked_at: this.unlockedDates[card.id],
      };
    });

    if (newlyUnlockedIds.length > 0) {
      this.saveToStorage();
    }

    const unlockedCount = cards.filter((c) => c.unlocked).length;
    const foilUnlockedCount = cards.filter(
      (c) => c.unlocked && c.card.foil_effect !== 'STANDARD'
    ).length;

    return {
      cards,
      summary: {
        total_cards: cards.length,
        unlocked_count: unlockedCount,
        completion_pct: Math.round((unlockedCount / Math.max(1, cards.length)) * 100),
        foil_unlocked_count: foilUnlockedCount,
        newly_unlocked_ids: newlyUnlockedIds,
      },
    };
  }

  public renderAlbumHtml(params?: { masteries?: ISkillMastery[]; trophies?: number }): string {
    const { cards, summary } = this.evaluateAlbum(params);

    const gridHtml = cards
      .map(({ card, unlocked, progress_pct }) => {
        const subjectMeta = getSubjectVisualMeta(card.subject);
        const foilBg = !unlocked
          ? 'linear-gradient(145deg, rgba(15,23,42,0.92), rgba(30,41,59,0.85))'
          : card.foil_effect === 'GOLD_FOIL'
            ? 'linear-gradient(135deg, rgba(161,98,7,0.95), rgba(234,179,8,0.85), rgba(250,204,21,0.95))'
            : card.foil_effect === 'HOLO_PRISM'
              ? 'linear-gradient(135deg, rgba(49,46,129,0.95), rgba(14,116,144,0.9), rgba(168,85,247,0.9))'
              : 'linear-gradient(145deg, rgba(30,41,59,0.98), rgba(51,65,85,0.92))';

        const textColor = unlocked && card.foil_effect === 'GOLD_FOIL' ? '#0f172a' : '#f8fafc';
        const subColor = unlocked && card.foil_effect === 'GOLD_FOIL' ? '#334155' : '#cbd5e1';

        return `
          <article data-collector-card="${card.id}" style="
            border-radius:16px;padding:12px;background:${foilBg};
            border:2px solid ${unlocked ? card.accent_color : 'rgba(148,163,184,0.22)'};
            box-shadow:${unlocked && card.foil_effect !== 'STANDARD' ? `0 0 18px ${card.accent_color}55` : 'none'};
            opacity:${unlocked ? '1' : '0.72'};color:${textColor};
            display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:900;">
              <span>${card.number_code} • ${card.rarity}</span>
              <span>${subjectMeta.icon} ${subjectMeta.short_label}</span>
            </div>
            <div style="font-size:30px;text-align:center;margin:4px 0;filter:${unlocked ? 'none' : 'grayscale(1)'};">
              ${card.icon}
            </div>
            <div style="font-size:13px;font-weight:900;text-align:center;">${card.title}</div>
            <div style="font-size:11px;color:${subColor};text-align:center;">${card.subtitle}</div>
            <div style="font-size:10px;line-height:1.35;color:${subColor};margin-top:auto;padding-top:6px;border-top:1px solid rgba(255,255,255,0.14);">
              ${unlocked ? card.lore_tip_6e : `🔒 ${card.unlock_condition.label} (${progressPctLabel(progress_pct)})`}
            </div>
          </article>
        `;
      })
      .join('');

    return `
      <section style="background:rgba(15,23,42,0.92);border:2px solid rgba(56,189,248,0.35);
                      border-radius:18px;padding:16px;color:#f8fafc;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:16px;font-weight:900;color:#38bdf8;">🃏 Album de Cartes Collector 6ème</div>
            <div style="font-size:12px;color:#cbd5e1;">
              ${summary.unlocked_count} / ${summary.total_cards} cartes débloquées (${summary.completion_pct}%) • ${summary.foil_unlocked_count} brillantes
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:12px;">
          ${gridHtml}
        </div>
      </section>
    `;
  }

  private computeCardProgress(
    card: ICollectorCard,
    masteries: ISkillMastery[],
    trophies: number,
    avgOverallElo: number
  ): number {
    const cond = card.unlock_condition;
    switch (cond.type) {
      case 'SKILL_ELO': {
        const entry = masteries.find((m) => m.skill_code === cond.skill_code);
        const currentElo = entry?.elo_rating ?? 1000;
        if (currentElo >= cond.min_elo) return 100;
        const base = 900;
        return Math.max(
          0,
          Math.min(99, Math.round(((currentElo - base) / Math.max(1, cond.min_elo - base)) * 100))
        );
      }
      case 'SUBJECT_SUCCESSES': {
        const totalSuccess = masteries
          .filter((m) => m.subject_category === cond.subject)
          .reduce((sum, m) => sum + m.success_count, 0);
        return Math.max(0, Math.min(100, Math.round((totalSuccess / cond.min_successes) * 100)));
      }
      case 'TROPHIES':
        return Math.max(0, Math.min(100, Math.round((trophies / cond.min_trophies) * 100)));
      case 'OVERALL_ELO_AVG': {
        if (avgOverallElo >= cond.min_elo_avg) return 100;
        const base = 950;
        return Math.max(
          0,
          Math.min(
            99,
            Math.round(((avgOverallElo - base) / Math.max(1, cond.min_elo_avg - base)) * 100)
          )
        );
      }
    }
  }

  private loadFromStorage(): Record<string, string> {
    if (typeof localStorage === 'undefined') {
      return {};
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return {};
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') {
          clean[k] = v;
        }
      }
      return clean;
    } catch {
      return {};
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.unlockedDates));
    } catch {
      // Stockage local indisponible
    }
  }
}

function progressPctLabel(progressPct: number): string {
  return `${Math.max(0, Math.min(100, Math.round(progressPct)))}%`;
}
