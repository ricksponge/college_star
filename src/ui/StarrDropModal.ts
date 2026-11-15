import type { IStarrDropReward, StarrDropRarity } from '../types/cctp';
import type { LocalSQLiteDB } from '../db/LocalSQLiteDB';
import { soundManager } from '../services/SoundManager';

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

export function renderTrophyRoadHtml(
  trophies: number,
  claimedMilestones: number[] = []
): string {
  const pct = Math.min(100, Math.max(0, Math.round((trophies / 1000) * 100)));
  const rank = getCurrentTrophyRank(trophies);
  const stepsHtml = TROPHY_ROAD_MILESTONES.map((m) => {
    const reached = trophies >= m.trophies;
    const isClaimed = claimedMilestones.includes(m.trophies);

    let actionHtml = '';
    if (m.trophies > 0) {
      if (isClaimed) {
        actionHtml =
          '<div style="margin-top:5px; font-size:10px; font-weight:800; color:#4ade80;">✔ Réclamé</div>';
      } else if (reached) {
        actionHtml = `<button type="button" data-claim-milestone="${m.trophies}" class="pulse-glow"
          style="margin-top:5px; padding:4px 8px; border:none; border-radius:7px; cursor:pointer;
                 background:linear-gradient(135deg, #facc15, #f97316); color:#0f172a;
                 font-size:10px; font-weight:900;">🎁 Réclamer</button>`;
      }
    }

    return `
      <div style="flex:1; min-width:96px; text-align:center; padding:6px 6px; border-radius:8px;
                  display:flex; flex-direction:column; justify-content:space-between; align-items:center;
                  background:${reached ? 'rgba(250,204,21,0.18)' : 'rgba(15,23,42,0.55)'};
                  border:1px solid ${isClaimed ? '#4ade80' : reached ? '#facc15' : '#334155'};">
        <div>
          <div style="font-size:11px; font-weight:800; color:${reached ? '#facc15' : '#94a3b8'};">🏆 ${m.trophies}</div>
          <div style="font-size:11px; font-weight:700; color:#f8fafc;">${m.title}</div>
          <div style="font-size:10px; color:#cbd5e1;">${m.rewardLabel}</div>
        </div>
        ${actionHtml}
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
      <div style="display:flex; gap:6px; overflow-x:auto; padding-bottom:2px;">
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

  private static readonly SECRETS_DE_6EME: readonly string[] = [
    'La première semaine de 6ème, tout le monde cherche encore sa salle — c’est normal !',
    'Au self, les agents sont là pour t’aider : tu peux toujours demander sans hésiter.',
    'La Vie Scolaire (CPE et surveillants) est ton QG ami dès que tu as un doute ou un souci.',
    'Préparer son cartable la veille au soir offre 10 minutes de calme en plus le matin.',
    'Pas besoin de tout réussir du premier coup : au collège, chaque essai fait progresser.',
    'En 6ème, sourire ou proposer un crayon à son voisin suffit souvent à lancer une belle amitié.',
    'Si un camarade est embêté ou seul dans la cour, prévenir un adulte ou l’inviter à jouer change tout.',
    'Un casier rangé à la récré évite de porter des cahiers trop lourds toute la journée.',
  ];

  private static readonly SUPER_RARE_BADGES: readonly string[] = [
    'Badge Calculateur Rapide',
    'Badge Camarade Solidaire',
    'Badge Champion Anti-Stress',
  ];

  private static readonly EPIQUE_BADGES: readonly string[] = [
    'Badge Plume d’Or 6ème',
    'Badge Super Délégué Bienveillant',
    'Badge Explorateur du Campus',
  ];

  private static readonly LEGENDAIRE_REWARDS: readonly string[] = [
    'Skin Légendaire Maître du Collège',
    'Skin Légendaire Ambassadeur 6ème',
    'Skin Légendaire Gardien de l’Entraide',
  ];

  private pickRandom(items: readonly string[]): string {
    return items[Math.floor(Math.random() * items.length)];
  }

  public buildReward(finalRarity: StarrDropRarity): IStarrDropReward {
    const secretTip = this.pickRandom(StarrDropModal.SECRETS_DE_6EME);

    switch (finalRarity) {
      case 'RARE':
        return {
          final_rarity: 'RARE',
          taps_count: 4,
          coins_granted: 50,
          trophies_granted: 15,
          knowledge_points_granted: 20,
          secret_tip_6e: secretTip,
        };
      case 'SUPER_RARE':
        return {
          final_rarity: 'SUPER_RARE',
          taps_count: 4,
          coins_granted: 110,
          trophies_granted: 30,
          knowledge_points_granted: 45,
          unlocked_badge_or_skin: this.pickRandom(StarrDropModal.SUPER_RARE_BADGES),
          secret_tip_6e: secretTip,
        };
      case 'EPIQUE':
        return {
          final_rarity: 'EPIQUE',
          taps_count: 4,
          coins_granted: 200,
          trophies_granted: 50,
          knowledge_points_granted: 80,
          unlocked_badge_or_skin: this.pickRandom(StarrDropModal.EPIQUE_BADGES),
          secret_tip_6e: secretTip,
        };
      case 'LEGENDAIRE':
        return {
          final_rarity: 'LEGENDAIRE',
          taps_count: 4,
          coins_granted: 400,
          trophies_granted: 80,
          knowledge_points_granted: 150,
          unlocked_badge_or_skin: this.pickRandom(StarrDropModal.LEGENDAIRE_REWARDS),
          secret_tip_6e: secretTip,
        };
    }
  }

  public open(onCompleted?: (reward: IStarrDropReward) => void): void {
    const profile = this.db.getPlayerProfile();
    if (profile.starr_drops_available <= 0) {
      return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed; inset:0; background:rgba(2,6,23,0.88); display:flex; align-items:center; justify-content:center; z-index:9999; font-family:system-ui,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText =
      'position:relative; overflow:hidden; width:min(440px, 92vw); background:#0f172a; border:3px solid #facc15; border-radius:20px; padding:24px; text-align:center; color:#ffffff; box-shadow:0 20px 60px rgba(0,0,0,0.65);';
    overlay.appendChild(card);

    let floatTimeout: number | null = null;
    const clearTimers = (): void => {
      if (floatTimeout !== null) {
        window.clearTimeout(floatTimeout);
        floatTimeout = null;
      }
    };

    const startDropSequence = (): void => {
      clearTimers();
      if (this.db.getPlayerProfile().starr_drops_available <= 0) {
        return;
      }

      let taps = 0;
      let rarity: StarrDropRarity = 'RARE';
      let reward: IStarrDropReward | null = null;
      const initialStyle = RARITY_STYLES[rarity];

      card.innerHTML = `
        <div id="sd-flash-layer" style="pointer-events:none; position:absolute; inset:0; border-radius:18px;
             background:radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(250,204,21,0.35) 45%, transparent 75%); opacity:0;"></div>
        <div style="position:relative; z-index:1;">
          <div style="font-size:13px; letter-spacing:1px; color:#94a3b8; font-weight:700;">CASIER MYSTÈRE (STARR DROP)</div>
          <h2 id="sd-rarity-badge" style="margin:8px 0 4px; color:${initialStyle.color}; font-size:26px; font-weight:900; transition:color 0.2s;">${initialStyle.label}</h2>
          <p id="sd-status-text" style="margin:0 0 22px; color:#cbd5e1; font-size:14px;">Tapote encore <strong>4</strong> fois pour ouvrir le casier !</p>
          <div style="position:relative; display:inline-flex; align-items:center; justify-content:center;">
            <div id="sd-upgrade-float" style="pointer-events:none; position:absolute; top:-28px; left:50%; transform:translateX(-50%);
                 white-space:nowrap; font-size:13px; font-weight:900; color:#fef08a; text-shadow:0 2px 10px rgba(0,0,0,0.9);
                 opacity:0; transition:opacity 0.2s, transform 0.25s;"></div>
            <button id="sd-tap-btn" type="button" style="width:154px; height:154px; border-radius:24px; border:4px solid ${initialStyle.color};
                    background:${initialStyle.bg}; box-shadow:${initialStyle.glow}; color:#fff; font-size:58px; cursor:pointer;
                    transform:scale(1); transition:transform 0.15s, border-color 0.2s, box-shadow 0.2s; touch-action:manipulation;">
              🎒
            </button>
          </div>
          <div id="sd-progress-dots" style="margin-top:18px; display:flex; justify-content:center; gap:8px;">
            <span data-dot="0" style="width:14px; height:14px; border-radius:999px; background:#334155; display:inline-block; transition:background 0.15s, transform 0.15s;"></span>
            <span data-dot="1" style="width:14px; height:14px; border-radius:999px; background:#334155; display:inline-block; transition:background 0.15s, transform 0.15s;"></span>
            <span data-dot="2" style="width:14px; height:14px; border-radius:999px; background:#334155; display:inline-block; transition:background 0.15s, transform 0.15s;"></span>
            <span data-dot="3" style="width:14px; height:14px; border-radius:999px; background:#334155; display:inline-block; transition:background 0.15s, transform 0.15s;"></span>
          </div>
        </div>
      `;

      const tapBtn = card.querySelector<HTMLButtonElement>('#sd-tap-btn');
      const rarityBadge = card.querySelector<HTMLElement>('#sd-rarity-badge');
      const statusText = card.querySelector<HTMLElement>('#sd-status-text');
      const upgradeFloat = card.querySelector<HTMLElement>('#sd-upgrade-float');
      const flashLayer = card.querySelector<HTMLElement>('#sd-flash-layer');
      const dots = Array.from(card.querySelectorAll<HTMLElement>('#sd-progress-dots [data-dot]'));

      if (!tapBtn) return;

      const renderRewardView = (finalReward: IStarrDropReward): void => {
        clearTimers();
        const style = RARITY_STYLES[finalReward.final_rarity];
        const remaining = this.db.getPlayerProfile().starr_drops_available;
        const badgeLine = finalReward.unlocked_badge_or_skin
          ? `<div style="margin-top:8px; padding:8px; border-radius:10px; background:rgba(250,204,21,0.16); color:#fef08a; font-weight:700;">🏅 ${finalReward.unlocked_badge_or_skin}</div>`
          : '';
        const secretTipLine = finalReward.secret_tip_6e
          ? `<div style="margin-top:8px; padding:10px 12px; border-radius:10px; background:rgba(56,189,248,0.14); border:1px solid rgba(56,189,248,0.4); color:#e0f2fe; font-size:12px; line-height:1.4; text-align:left;"><strong style="color:#7dd3fc;">🗝️ Secret de 6ème :</strong> ${finalReward.secret_tip_6e}</div>`
          : '';
        const nextBtnHtml =
          remaining > 0
            ? `<button id="sd-next-btn" type="button" class="pulse-glow" style="margin-top:14px; width:100%; padding:12px; border-radius:12px; border:none;
                      background:linear-gradient(135deg, #38bdf8, #2563eb); color:#ffffff; font-weight:900; font-size:15px; cursor:pointer;">
                 🎁 OUVRIR LE SUIVANT (${remaining})
               </button>`
            : '';

        card.innerHTML = `
          <div class="sd-flash-burst" style="pointer-events:none; position:absolute; inset:0; border-radius:18px;
               background:radial-gradient(circle, rgba(255,255,255,0.85) 0%, ${style.color}44 50%, transparent 75%);"></div>
          <div style="position:relative; z-index:1;">
            <div style="font-size:13px; color:#94a3b8; font-weight:700;">CASIER DÉVERROUILLÉ !</div>
            <h2 style="margin:6px 0 12px; color:${style.color}; font-size:28px; font-weight:900;">★ ${style.label} ★</h2>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:12px;">
              <div style="background:#1e293b; padding:10px; border-radius:12px;">
                <div style="font-size:20px; font-weight:900; color:#facc15;">+${finalReward.coins_granted}</div>
                <div style="font-size:12px; color:#cbd5e1;">Pièces 🪙</div>
              </div>
              <div style="background:#1e293b; padding:10px; border-radius:12px;">
                <div style="font-size:20px; font-weight:900; color:#38bdf8;">+${finalReward.trophies_granted}</div>
                <div style="font-size:12px; color:#cbd5e1;">Trophées 🏆</div>
              </div>
              <div style="background:#1e293b; padding:10px; border-radius:12px;">
                <div style="font-size:20px; font-weight:900; color:#4ade80;">+${finalReward.knowledge_points_granted}</div>
                <div style="font-size:12px; color:#cbd5e1;">Savoir 📖</div>
              </div>
            </div>
            ${badgeLine}
            ${secretTipLine}
            ${nextBtnHtml}
            <button id="sd-claim-btn" type="button" style="margin-top:${remaining > 0 ? '10px' : '16px'}; width:100%; padding:12px; border-radius:12px; border:none;
                    background:#facc15; color:#0f172a; font-weight:900; font-size:16px; cursor:pointer;">
              RÉCUPÉRER ET CONTINUER
            </button>
          </div>
        `;

        card.querySelector<HTMLButtonElement>('#sd-next-btn')?.addEventListener('click', () => {
          startDropSequence();
        });

        card.querySelector<HTMLButtonElement>('#sd-claim-btn')?.addEventListener('click', () => {
          clearTimers();
          overlay.remove();
          onCompleted?.(finalReward);
        });
      };

      const handleTap = (): void => {
        if (taps >= 4) {
          return;
        }
        taps += 1;
        const prevRarity = rarity;
        rarity = this.rollUpgradeRarity(rarity);
        const upgraded = rarity !== prevRarity;

        soundManager.playStarrDropTap(taps, upgraded);

        if (taps < 4) {
          const style = RARITY_STYLES[rarity];
          const remainingTaps = 4 - taps;

          if (rarityBadge) {
            rarityBadge.textContent = style.label;
            rarityBadge.style.color = style.color;
          }
          if (statusText) {
            statusText.innerHTML = `Tapote encore <strong>${remainingTaps}</strong> fois pour ouvrir le casier !`;
          }

          tapBtn.style.borderColor = style.color;
          tapBtn.style.background = style.bg;
          tapBtn.style.boxShadow = style.glow;
          tapBtn.style.transform = `scale(${1 + taps * 0.05})`;

          tapBtn.classList.remove('sd-shaking');
          void tapBtn.offsetWidth;
          tapBtn.classList.add('sd-shaking');

          dots.forEach((dot, idx) => {
            dot.style.background = idx < taps ? style.color : '#334155';
            dot.style.transform = idx < taps ? 'scale(1.15)' : 'scale(1)';
          });

          if (upgraded) {
            const prevLabel = RARITY_STYLES[prevRarity].label;
            if (upgradeFloat) {
              upgradeFloat.textContent = `✨ ${prevLabel} ➔ ${style.label} !`;
              upgradeFloat.style.color = style.color;
              upgradeFloat.style.opacity = '1';
              upgradeFloat.style.transform = 'translateX(-50%) translateY(-8px)';
              clearTimers();
              floatTimeout = window.setTimeout(() => {
                upgradeFloat.style.opacity = '0';
                upgradeFloat.style.transform = 'translateX(-50%) translateY(0)';
              }, 900);
            }
            if (flashLayer) {
              flashLayer.classList.remove('sd-flash-burst');
              void flashLayer.offsetWidth;
              flashLayer.classList.add('sd-flash-burst');
            }
          }
        } else {
          reward = this.buildReward(rarity);
          this.applyReward(reward);
          soundManager.playStarrDropReveal(reward.final_rarity);
          renderRewardView(reward);
        }
      };

      let suppressClick = false;
      tapBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        suppressClick = true;
        handleTap();
      });
      const clearSuppressionSoon = (): void => {
        window.setTimeout(() => {
          suppressClick = false;
        }, 80);
      };
      tapBtn.addEventListener('pointercancel', clearSuppressionSoon);
      tapBtn.addEventListener('pointerleave', clearSuppressionSoon);
      tapBtn.addEventListener('click', () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        handleTap();
      });
    };

    startDropSequence();
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
