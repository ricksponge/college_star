import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';

export type PassRewardType =
  | 'COINS'
  | 'STARR_DROP'
  | 'KNOWLEDGE_POINTS'
  | 'HONORARY_TITLE';

export interface IBrawlPassReward {
  type: PassRewardType;
  amount: number;
  label: string;
  icon: string;
  honorary_title?: string;
}

export interface IBrawlPassTier {
  tier: number;
  required_tokens: number;
  cumulative_tokens: number;
  milestone_name: string;
  reward: IBrawlPassReward;
  is_highlight: boolean;
}

export interface IBrawlPassState {
  season_id: string;
  season_name: string;
  total_tokens: number;
  current_tier: number;
  claimed_tiers: number[];
  unlocked_titles: string[];
}

export interface IPassClaimResult {
  claimed: boolean;
  tier: number;
  reward?: IBrawlPassReward;
  reason?: string;
}

export interface IPassTokenGainResult {
  previousTier: number;
  newTier: number;
  newlyUnlockedTiers: number[];
  totalTokens: number;
}

export const BRAWL_PASS_TOTAL_TIERS = 30;
export const BRAWL_PASS_SEASON_ID = 'RENTREE_6E_S1';
export const BRAWL_PASS_SEASON_NAME = 'Passe de Rentrée — Opération 6ème';

const STORAGE_KEY = 'brawl_college_pass_v1';

const HONORARY_TITLES_BY_TIER: Record<number, { title: string; milestone: string }> = {
  1: { title: 'Recrue de 6ème', milestone: 'Premiers Pas au Collège' },
  6: { title: 'Stratège du CDI', milestone: 'Lecteur Éclair' },
  14: { title: 'As de la Récré', milestone: 'Roi de la Cour' },
  21: { title: 'Délégué d’Élite', milestone: 'Voix de la Classe' },
  30: { title: 'Major de la Rentrée', milestone: 'Couronnement 6ème' },
};

const STARR_DROP_TIERS = new Set<number>([3, 5, 10, 12, 15, 20, 22, 25, 28]);

function createPassTiers(): IBrawlPassTier[] {
  const tiers: IBrawlPassTier[] = [];
  let cumulative = 0;

  for (let tier = 1; tier <= BRAWL_PASS_TOTAL_TIERS; tier++) {
    const requiredTokens = 40 + Math.floor((tier - 1) / 5) * 15;
    cumulative += requiredTokens;

    const titleSpec = HONORARY_TITLES_BY_TIER[tier];
    let reward: IBrawlPassReward;
    let milestoneName = `Palier ${tier}`;
    let isHighlight = false;

    if (titleSpec) {
      isHighlight = true;
      milestoneName = titleSpec.milestone;
      reward = {
        type: 'HONORARY_TITLE',
        amount: 1,
        label: `Titre : « ${titleSpec.title} »`,
        icon: '🏅',
        honorary_title: titleSpec.title,
      };
    } else if (STARR_DROP_TIERS.has(tier)) {
      isHighlight = tier % 5 === 0;
      milestoneName = isHighlight ? `Casier d’Étape #${tier}` : `Casier Bonus #${tier}`;
      reward = {
        type: 'STARR_DROP',
        amount: 1,
        label: '+1 Casier Mystère',
        icon: '🎁',
      };
    } else if (tier % 2 === 0) {
      const coinsAmount = 60 + Math.floor(tier / 3) * 15;
      reward = {
        type: 'COINS',
        amount: coinsAmount,
        label: `+${coinsAmount} Pièces`,
        icon: '🪙',
      };
    } else {
      const kpAmount = 20 + Math.floor(tier / 4) * 5;
      reward = {
        type: 'KNOWLEDGE_POINTS',
        amount: kpAmount,
        label: `+${kpAmount} Pts Savoir`,
        icon: '📘',
      };
    }

    tiers.push({
      tier,
      required_tokens: requiredTokens,
      cumulative_tokens: cumulative,
      milestone_name: milestoneName,
      reward,
      is_highlight: isHighlight,
    });
  }

  return tiers;
}

export const BRAWL_PASS_TIERS: readonly IBrawlPassTier[] = createPassTiers();

/**
 * Frise de progression « Passe de Rentrée » sur 30 paliers (Agent 13 - Live-Ops).
 * Modèle 100% éthique sans Pay-to-Win débloquant Pièces, Casiers Mystères,
 * Points de Savoir et Titres Honorifiques au fil des jetons de quêtes.
 */
export class BrawlPassSystem {
  private readonly db: LocalSQLiteDB | null;
  private state: IBrawlPassState;

  constructor(db: LocalSQLiteDB | null = null) {
    this.db = db;
    this.state = this.loadFromStorage();
    this.state.current_tier = this.computeTierForTokens(this.state.total_tokens);
    this.saveToStorage();
  }

  public getTiers(): readonly IBrawlPassTier[] {
    return BRAWL_PASS_TIERS;
  }

  public getState(): IBrawlPassState {
    return {
      ...this.state,
      claimed_tiers: [...this.state.claimed_tiers],
      unlocked_titles: [...this.state.unlocked_titles],
    };
  }

  public computeTierForTokens(totalTokens: number): number {
    let reached = 0;
    for (const tierSpec of BRAWL_PASS_TIERS) {
      if (totalTokens >= tierSpec.cumulative_tokens) {
        reached = tierSpec.tier;
      } else {
        break;
      }
    }
    return reached;
  }

  public getTierProgress(): {
    currentTier: number;
    maxTiers: number;
    tokensInCurrentStep: number;
    tokensRequiredForNextStep: number;
    progressPct: number;
    isCompleted: boolean;
  } {
    const currentTier = this.state.current_tier;
    if (currentTier >= BRAWL_PASS_TOTAL_TIERS) {
      const last = BRAWL_PASS_TIERS[BRAWL_PASS_TIERS.length - 1];
      return {
        currentTier: BRAWL_PASS_TOTAL_TIERS,
        maxTiers: BRAWL_PASS_TOTAL_TIERS,
        tokensInCurrentStep: last.required_tokens,
        tokensRequiredForNextStep: last.required_tokens,
        progressPct: 100,
        isCompleted: true,
      };
    }

    const prevCumulative =
      currentTier > 0 ? BRAWL_PASS_TIERS[currentTier - 1].cumulative_tokens : 0;
    const nextTierSpec = BRAWL_PASS_TIERS[currentTier];
    const tokensInCurrentStep = Math.max(0, this.state.total_tokens - prevCumulative);
    const tokensRequiredForNextStep = nextTierSpec.required_tokens;
    const progressPct = Math.min(
      100,
      Math.round((tokensInCurrentStep / Math.max(1, tokensRequiredForNextStep)) * 100)
    );

    return {
      currentTier,
      maxTiers: BRAWL_PASS_TOTAL_TIERS,
      tokensInCurrentStep,
      tokensRequiredForNextStep,
      progressPct,
      isCompleted: false,
    };
  }

  public addPassTokens(tokensEarned: number): IPassTokenGainResult {
    const safeGain = Math.max(0, Math.round(tokensEarned));
    const previousTier = this.state.current_tier;
    this.state.total_tokens += safeGain;
    const newTier = this.computeTierForTokens(this.state.total_tokens);
    this.state.current_tier = newTier;

    const newlyUnlockedTiers: number[] = [];
    for (let t = previousTier + 1; t <= newTier; t++) {
      newlyUnlockedTiers.push(t);
    }

    this.saveToStorage();
    return {
      previousTier,
      newTier,
      newlyUnlockedTiers,
      totalTokens: this.state.total_tokens,
    };
  }

  public claimTier(tierNumber: number): IPassClaimResult {
    const tierSpec = BRAWL_PASS_TIERS.find((t) => t.tier === tierNumber);
    if (!tierSpec) {
      return { claimed: false, tier: tierNumber, reason: 'Palier inconnu.' };
    }
    if (this.state.current_tier < tierNumber) {
      return {
        claimed: false,
        tier: tierNumber,
        reason: `Obtiens ${tierSpec.cumulative_tokens} jetons pour atteindre le palier ${tierNumber}.`,
      };
    }
    if (this.state.claimed_tiers.includes(tierNumber)) {
      return { claimed: false, tier: tierNumber, reason: 'Palier déjà réclamé.' };
    }

    this.state.claimed_tiers.push(tierNumber);
    this.state.claimed_tiers.sort((a, b) => a - b);

    const reward = tierSpec.reward;
    if (reward.type === 'HONORARY_TITLE' && reward.honorary_title) {
      if (!this.state.unlocked_titles.includes(reward.honorary_title)) {
        this.state.unlocked_titles.push(reward.honorary_title);
      }
      this.db?.addUnlockedReward(`Titre : ${reward.honorary_title}`);
    } else if (reward.type === 'COINS' && this.db) {
      const profile = this.db.getPlayerProfile();
      this.db.updatePlayerProfile({ coins: profile.coins + reward.amount });
    } else if (reward.type === 'STARR_DROP' && this.db) {
      const profile = this.db.getPlayerProfile();
      this.db.updatePlayerProfile({
        starr_drops_available: profile.starr_drops_available + reward.amount,
      });
    } else if (reward.type === 'KNOWLEDGE_POINTS' && this.db) {
      this.db.addKnowledgePoints(reward.amount);
    }

    this.saveToStorage();
    return {
      claimed: true,
      tier: tierNumber,
      reward,
    };
  }

  public claimAllUnlockedTiers(): { claimedCount: number; rewards: IBrawlPassReward[] } {
    const rewards: IBrawlPassReward[] = [];
    for (let t = 1; t <= this.state.current_tier; t++) {
      if (!this.state.claimed_tiers.includes(t)) {
        const res = this.claimTier(t);
        if (res.claimed && res.reward) {
          rewards.push(res.reward);
        }
      }
    }
    return { claimedCount: rewards.length, rewards };
  }

  public renderPassTrackHtml(): string {
    const progress = this.getTierProgress();
    const cardsHtml = BRAWL_PASS_TIERS.map((tierSpec) => {
      const unlocked = this.state.current_tier >= tierSpec.tier;
      const claimed = this.state.claimed_tiers.includes(tierSpec.tier);
      const borderColor = claimed
        ? '#4ade80'
        : unlocked
          ? '#facc15'
          : tierSpec.is_highlight
            ? '#38bdf8'
            : 'rgba(148, 163, 184, 0.25)';

      const statusHtml = claimed
        ? '<span style="color:#4ade80;font-weight:900;font-size:11px;">✔ Réclamé</span>'
        : unlocked
          ? `<button type="button" data-claim-pass-tier="${tierSpec.tier}"
               style="padding:5px 10px;border:none;border-radius:8px;cursor:pointer;
                      background:linear-gradient(135deg,#facc15,#f97316);color:#0f172a;
                      font-weight:900;font-size:11px;">Réclamer</button>`
          : `<span style="color:#94a3b8;font-size:11px;font-weight:700;">🔒 ${tierSpec.cumulative_tokens} jetons</span>`;

      return `
        <div data-pass-tier="${tierSpec.tier}" style="
          min-width:136px;padding:10px;border-radius:14px;
          background:${unlocked ? 'rgba(30,41,59,0.95)' : 'rgba(15,23,42,0.78)'};
          border:2px solid ${borderColor};display:flex;flex-direction:column;
          align-items:center;gap:6px;text-align:center;flex-shrink:0;">
          <div style="font-size:11px;font-weight:900;color:#cbd5e1;">PALIER ${tierSpec.tier}</div>
          <div style="font-size:24px;line-height:1;">${tierSpec.reward.icon}</div>
          <div style="font-size:12px;font-weight:800;color:#f8fafc;">${tierSpec.reward.label}</div>
          <div style="font-size:10px;color:#94a3b8;">${tierSpec.milestone_name}</div>
          <div style="margin-top:auto;">${statusHtml}</div>
        </div>
      `;
    }).join('');

    return `
      <div style="background:linear-gradient(160deg,#0f172a,#1e1b4b);border:2px solid rgba(250,204,21,0.4);
                  border-radius:18px;padding:16px;color:#f8fafc;font-family:inherit;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:16px;font-weight:900;color:#facc15;">🎟️ ${this.state.season_name}</div>
            <div style="font-size:12px;color:#cbd5e1;">
              Palier ${progress.currentTier} / ${progress.maxTiers} • ${this.state.total_tokens} jetons accumulés
            </div>
          </div>
          <button type="button" data-claim-all-pass="true" style="
            padding:8px 14px;border:none;border-radius:10px;cursor:pointer;
            background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;font-weight:900;font-size:12px;">
            Tout réclamer
          </button>
        </div>
        <div style="height:10px;border-radius:999px;background:rgba(255,255,255,0.12);overflow:hidden;margin-bottom:14px;">
          <div style="height:100%;width:${progress.progressPct}%;background:linear-gradient(90deg,#38bdf8,#facc15);"></div>
        </div>
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  public mountPassTrack(container: HTMLElement, onUpdate?: (state: IBrawlPassState) => void): void {
    const refresh = (): void => {
      container.innerHTML = this.renderPassTrackHtml();
      const claimAllBtn = container.querySelector<HTMLButtonElement>('[data-claim-all-pass]');
      if (claimAllBtn) {
        claimAllBtn.addEventListener('click', () => {
          this.claimAllUnlockedTiers();
          refresh();
          onUpdate?.(this.getState());
        });
      }
      const tierButtons = container.querySelectorAll<HTMLButtonElement>('[data-claim-pass-tier]');
      tierButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const tierNum = Number(btn.dataset.claimPassTier);
          if (Number.isFinite(tierNum)) {
            this.claimTier(tierNum);
            refresh();
            onUpdate?.(this.getState());
          }
        });
      });
    };
    refresh();
  }

  private loadFromStorage(): IBrawlPassState {
    const fallback: IBrawlPassState = {
      season_id: BRAWL_PASS_SEASON_ID,
      season_name: BRAWL_PASS_SEASON_NAME,
      total_tokens: 0,
      current_tier: 0,
      claimed_tiers: [],
      unlocked_titles: [],
    };
    if (typeof localStorage === 'undefined') {
      return fallback;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<IBrawlPassState>;
      return {
        season_id: typeof parsed.season_id === 'string' ? parsed.season_id : BRAWL_PASS_SEASON_ID,
        season_name:
          typeof parsed.season_name === 'string' ? parsed.season_name : BRAWL_PASS_SEASON_NAME,
        total_tokens:
          typeof parsed.total_tokens === 'number' && Number.isFinite(parsed.total_tokens)
            ? Math.max(0, parsed.total_tokens)
            : 0,
        current_tier:
          typeof parsed.current_tier === 'number' && Number.isFinite(parsed.current_tier)
            ? Math.max(0, Math.min(BRAWL_PASS_TOTAL_TIERS, parsed.current_tier))
            : 0,
        claimed_tiers: Array.isArray(parsed.claimed_tiers)
          ? parsed.claimed_tiers.filter((n): n is number => typeof n === 'number')
          : [],
        unlocked_titles: Array.isArray(parsed.unlocked_titles)
          ? parsed.unlocked_titles.filter((t): t is string => typeof t === 'string')
          : [],
      };
    } catch {
      return fallback;
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Stockage local indisponible
    }
  }
}
