import type { IStarrDropReward, StarrDropRarity } from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';

export interface ITrophyMilestone {
  trophies: number;
  title: string;
  rewardLabel: string;
}

export const TROPHY_ROAD_MILESTONES: ITrophyMilestone[] = [
  { trophies: 0, title: 'Rentrée CM2', rewardLabel: 'Début de l’aventure' },
  { trophies: 100, title: 'Première Récré', rewardLabel: '+1 Casier Mystère' },
  { trophies: 250, title: 'As du Compas', rewardLabel: 'Badge Équerre d’Or' },
  { trophies: 450, title: 'Délégué de Classe', rewardLabel: '+150 Pièces' },
  { trophies: 650, title: 'Gardien du CDI', rewardLabel: 'Skin Timo Survêt Bleu' },
  { trophies: 850, title: "Tableau d'Honneur", rewardLabel: '+1 Casier Mystère' },
  { trophies: 1000, title: 'Major de 6ème', rewardLabel: 'Diplôme Suprême 6e' },
];

const RARITY_STYLES: Record<
  StarrDropRarity,
  { label: string; color: string; bg: string; glow: string }
> = {
  RARE: {
    label: 'RARE',
    color: '#22c55e',
    bg: 'linear-gradient(135deg, #14532d, #16a34a)',
    glow: '0 0 28px rgba(34, 197, 94, 0.7)',
  },
  SUPER_RARE: {
    label: 'SUPER RARE',
    color: '#3b82f6',
    bg: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
    glow: '0 0 32px rgba(59, 130, 246, 0.8)',
  },
  EPIQUE: {
    label: 'ÉPIQUE',
    color: '#a855f7',
    bg: 'linear-gradient(135deg, #581c87, #9333ea)',
    glow: '0 0 38px rgba(168, 85, 247, 0.85)',
  },
  LEGENDAIRE: {
    label: 'LÉGENDAIRE',
    color: '#facc15',
    bg: 'linear-gradient(135deg, #854d0e, #eab308)',
    glow: '0 0 46px rgba(250, 204, 21, 0.95)',
  },
};

export function getCurrentTrophyRank(trophies: number): ITrophyMilestone {
  let current = TROPHY_ROAD_MILESTONES[0];
  for (const m of TROPHY_ROAD_MILESTONES) {
    if (trophies >= m.trophies) {
      current = m;
    }
  }
  return current;
}

export function renderTrophyRoadHtml(trophies: number): string {
  const pct = Math.min(100, Math.max(0, Math.round((trophies / 1000) * 100)));
  const rank = getCurrentTrophyRank(trophies);
  const stepsHtml = TROPHY_ROAD_MILESTONES.map((m) => {
    const reached = trophies >= m.trophies;
    return `
      <div style="flex:1; min-width:85px; text-align:center; padding:6px 4px; border-radius:8px;
                  background:${reached ? 'rgba(250,204,21,0.18)' : 'rgba(15,23,42,0.55)'};
                  border:1px solid ${reached ? '#facc15' : '#334155'};">
        <div style="font-size:11px; font-weight:800; color:${reached ? '#facc15' : '#94a3b8'};">🏆 ${m.trophies}</div>
        <div style="font-size:11px; font-weight:700; color:#f8fafc;">${m.title}</div>
        <div style="font-size:10px; color:#cbd5e1;">${m.rewardLabel}</div>
      </div>
    `;
  }).join('');

  return `
    <div style="background:rgba(15,23,42,0.85); border:1px solid #334155; border-radius:12px; padding:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:800; color:#facc15; font-size:14px;">🛣️ Route vers la 6ème — ${rank.title}</span>
        <span style="font-weight:700; color:#e2e8f0; font-size:13px;">${trophies} / 1000 🏆 (${pct}%)</span>
      </div>
      <div style="height:10px; background:#1e293b; border-radius:999px; overflow:hidden; margin-bottom:10px;">
        <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #38bdf8, #facc15); transition:width 0.3s;"></div>
      </div>
      <div style="display:flex; gap:6px; overflow-x:auto;">
        ${stepsHtml}
      </div>
    </div>
  `;
}

/**
 * Composant Casier Mystère (Starr Drop) :
 * - Ouverture en 4 tapotements (taps_count = 4) + clic de collecte (5ème clic)
 * - Probabilité de montée en rareté : Rare -> Super Rare -> Épique -> Légendaire
 * - Crédite immédiatement SQLite en Pièces, Trophées, Points de Savoir et Skins/Badges (100% sans Pay-to-Win).
 */
export class StarrDropModal {
  private readonly db: LocalSQLiteDB;

  constructor(db: LocalSQLiteDB) {
    this.db = db;
  }

  public rollUpgradeRarity(current: StarrDropRarity): StarrDropRarity {
    const roll = Math.random();
    if (current === 'RARE' && roll < 0.55) return 'SUPER_RARE';
    if (current === 'SUPER_RARE' && roll < 0.42) return 'EPIQUE';
    if (current === 'EPIQUE' && roll < 0.28) return 'LEGENDAIRE';
    return current;
  }

  public buildReward(finalRarity: StarrDropRarity): IStarrDropReward {
    switch (finalRarity) {
      case 'RARE':
        return {
          final_rarity: 'RARE',
          taps_count: 4,
          coins_granted: 50,
          trophies_granted: 15,
          knowledge_points_granted: 20,
        };
      case 'SUPER_RARE':
        return {
          final_rarity: 'SUPER_RARE',
          taps_count: 4,
          coins_granted: 110,
          trophies_granted: 30,
          knowledge_points_granted: 45,
          unlocked_badge_or_skin: 'Badge Calculateur Rapide',
        };
      case 'EPIQUE':
        return {
          final_rarity: 'EPIQUE',
          taps_count: 4,
          coins_granted: 200,
          trophies_granted: 50,
          knowledge_points_granted: 80,
          unlocked_badge_or_skin: 'Badge Plume d’Or 6ème',
        };
      case 'LEGENDAIRE':
        return {
          final_rarity: 'LEGENDAIRE',
          taps_count: 4,
          coins_granted: 400,
          trophies_granted: 80,
          knowledge_points_granted: 150,
          unlocked_badge_or_skin: 'Skin Légendaire Maître du Collège',
        };
    }
  }

  public open(onCompleted?: (reward: IStarrDropReward) => void): void {
    const profile = this.db.getPlayerProfile();
    if (profile.starr_drops_available <= 0) {
      return;
    }

    let taps = 0;
    let rarity: StarrDropRarity = 'RARE';
    let reward: IStarrDropReward | null = null;

    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed; inset:0; background:rgba(2,6,23,0.88); display:flex; align-items:center; justify-content:center; z-index:9999; font-family:system-ui,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText =
      'width:min(440px, 92vw); background:#0f172a; border:3px solid #facc15; border-radius:20px; padding:24px; text-align:center; color:#ffffff; box-shadow:0 20px 60px rgba(0,0,0,0.65);';
    overlay.appendChild(card);

    const renderCard = (): void => {
      const style = RARITY_STYLES[rarity];
      if (taps < 4) {
        const remainingTaps = 4 - taps;
        card.innerHTML = `
          <div style="font-size:13px; letter-spacing:1px; color:#94a3b8; font-weight:700;">CASIER MYSTÈRE (STARR DROP)</div>
          <h2 style="margin:8px 0 4px; color:${style.color}; font-size:26px; font-weight:900;">${style.label}</h2>
          <p style="margin:0 0 18px; color:#cbd5e1; font-size:14px;">Tapote encore <strong>${remainingTaps}</strong> fois pour ouvrir le casier !</p>
          <button id="sd-tap-btn" style="width:154px; height:154px; border-radius:24px; border:4px solid ${style.color};
                  background:${style.bg}; box-shadow:${style.glow}; color:#fff; font-size:58px; cursor:pointer;
                  transform:scale(${1 + taps * 0.05}); transition:transform 0.15s;">
            🎒
          </button>
          <div style="margin-top:16px; display:flex; justify-content:center; gap:8px;">
            ${[0, 1, 2, 3]
              .map(
                (idx) =>
                  `<span style="width:14px; height:14px; border-radius:999px; background:${idx < taps ? style.color : '#334155'}; display:inline-block;"></span>`
              )
              .join('')}
          </div>
        `;
        const btn = card.querySelector<HTMLButtonElement>('#sd-tap-btn');
        btn?.addEventListener('click', () => {
          taps += 1;
          rarity = this.rollUpgradeRarity(rarity);
          if (taps >= 4) {
            reward = this.buildReward(rarity);
            this.applyReward(reward);
          }
          renderCard();
        });
      } else if (reward) {
        const badgeLine = reward.unlocked_badge_or_skin
          ? `<div style="margin-top:8px; padding:8px; border-radius:10px; background:rgba(250,204,21,0.16); color:#fef08a; font-weight:700;">🏅 ${reward.unlocked_badge_or_skin}</div>`
          : '';
        card.innerHTML = `
          <div style="font-size:13px; color:#94a3b8; font-weight:700;">CASIER DÉVERROUILLÉ !</div>
          <h2 style="margin:6px 0 12px; color:${style.color}; font-size:28px; font-weight:900;">★ ${style.label} ★</h2>
          <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px;">
            <div style="background:#1e293b; padding:10px; border-radius:12px;">
              <div style="font-size:20px; font-weight:900; color:#facc15;">+${reward.coins_granted}</div>
              <div style="font-size:12px; color:#cbd5e1;">Pièces 🪙</div>
            </div>
            <div style="background:#1e293b; padding:10px; border-radius:12px;">
              <div style="font-size:20px; font-weight:900; color:#38bdf8;">+${reward.trophies_granted}</div>
              <div style="font-size:12px; color:#cbd5e1;">Trophées 🏆</div>
            </div>
            <div style="background:#1e293b; padding:10px; border-radius:12px;">
              <div style="font-size:20px; font-weight:900; color:#4ade80;">+${reward.knowledge_points_granted}</div>
              <div style="font-size:12px; color:#cbd5e1;">Savoir 📖</div>
            </div>
          </div>
          ${badgeLine}
          <button id="sd-claim-btn" style="margin-top:16px; width:100%; padding:12px; border-radius:12px; border:none;
                  background:#facc15; color:#0f172a; font-weight:900; font-size:16px; cursor:pointer;">
            RÉCUPÉRER ET CONTINUER
          </button>
        `;
        const claimBtn = card.querySelector<HTMLButtonElement>('#sd-claim-btn');
        claimBtn?.addEventListener('click', () => {
          overlay.remove();
          if (reward) {
            onCompleted?.(reward);
          }
        });
      }
    };

    renderCard();
    document.body.appendChild(overlay);
  }

  private applyReward(reward: IStarrDropReward): void {
    const profile = this.db.getPlayerProfile();
    this.db.updatePlayerProfile({
      coins: profile.coins + reward.coins_granted,
      trophies: profile.trophies + reward.trophies_granted,
      starr_drops_available: Math.max(0, profile.starr_drops_available - 1),
    });
    this.db.addKnowledgePoints(reward.knowledge_points_granted);
    if (reward.unlocked_badge_or_skin) {
      this.db.addUnlockedReward(reward.unlocked_badge_or_skin);
    }
  }
}
