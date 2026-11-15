import type { IGameMode } from '../types/cctp';

export const MODE_MATCH_DES_ACCORDS: IGameMode = {
  id: 'MATCH_DES_ACCORDS',
  mode_number: 2,
  name: 'Le Match des Accords',
  inspired_by: 'Brawl Ball',
  format: '3v3',
  duration_seconds: 120,
  target_subject: 'francais',
  description:
    'Une phrase à trou s’affiche sur le ballon central (ex. : « Les joueurs ont ___ le match »). Dribble les défenseurs et tire dans la cage affichant la bonne terminaison (-É ou -ER).',
  victory_condition: 'Marquer 2 buts dans la bonne cage grammaticale (ou mener à la fin des 2 minutes).',
};

export interface IMatchAccordsState {
  playerGoals: number;
  opponentGoals: number;
  leftGoalLabel: string;
  rightGoalLabel: string;
  correctSide: 'LEFT' | 'RIGHT';
}

export class MatchAccordsSession {
  public readonly config = MODE_MATCH_DES_ACCORDS;
  private playerGoals = 0;
  private opponentGoals = 0;
  private leftGoalLabel = '-É';
  private rightGoalLabel = '-ER';
  private correctSide: 'LEFT' | 'RIGHT' = 'LEFT';

  public configureGoals(leftLabel: string, rightLabel: string, correctSide: 'LEFT' | 'RIGHT'): void {
    this.leftGoalLabel = leftLabel;
    this.rightGoalLabel = rightLabel;
    this.correctSide = correctSide;
  }

  public shootAtGoal(side: 'LEFT' | 'RIGHT'): { scored: boolean; matchWon: boolean } {
    if (side === this.correctSide) {
      this.playerGoals += 1;
      return { scored: true, matchWon: this.playerGoals >= 2 };
    }
    this.opponentGoals += 1;
    return { scored: false, matchWon: false };
  }

  public getState(): IMatchAccordsState {
    return {
      playerGoals: this.playerGoals,
      opponentGoals: this.opponentGoals,
      leftGoalLabel: this.leftGoalLabel,
      rightGoalLabel: this.rightGoalLabel,
      correctSide: this.correctSide,
    };
  }
}
