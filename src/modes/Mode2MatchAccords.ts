import type { IGameMode, IQuestion } from '../types/cctp';

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

export interface IArenaBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface IMatchAccordsState {
  playerGoals: number;
  opponentGoals: number;
  leftGoalLabel: string;
  rightGoalLabel: string;
  correctSide: 'LEFT' | 'RIGHT';
  ball: IArenaBall;
}

export class MatchAccordsSession {
  public readonly config = MODE_MATCH_DES_ACCORDS;
  private playerGoals = 0;
  private opponentGoals = 0;
  private leftGoalLabel = '-É';
  private rightGoalLabel = '-ER';
  private correctSide: 'LEFT' | 'RIGHT' = 'LEFT';
  private ball: IArenaBall = { x: 480, y: 340, vx: 0, vy: 0, radius: 16 };

  public configureGoals(leftLabel: string, rightLabel: string, correctSide: 'LEFT' | 'RIGHT'): void {
    this.leftGoalLabel = leftLabel;
    this.rightGoalLabel = rightLabel;
    this.correctSide = correctSide;
  }

  public setupGoalsFromQuestion(question: IQuestion): void {
    const correctTarget = question.targets.find((target) => target.is_correct);
    const wrongTarget = question.targets.find((target) => !target.is_correct);
    const correctLabel = correctTarget?.label ?? this.leftGoalLabel;
    const fallbackWrong =
      correctLabel === this.rightGoalLabel ? this.leftGoalLabel : this.rightGoalLabel;
    const wrongLabel = wrongTarget?.label ?? fallbackWrong;

    if (Math.random() < 0.5) {
      this.configureGoals(correctLabel, wrongLabel, 'LEFT');
    } else {
      this.configureGoals(wrongLabel, correctLabel, 'RIGHT');
    }
  }

  public resetBall(): void {
    this.ball = { x: 480, y: 340, vx: 0, vy: 0, radius: 16 };
  }

  public kickBall(angle: number, speed = 520): void {
    this.ball.vx = Math.cos(angle) * speed;
    this.ball.vy = Math.sin(angle) * speed;
  }

  public updateBall(
    dtSec: number,
    playerX: number,
    playerY: number,
    arenaW = 960,
    arenaH = 640
  ): { scoredSide: 'LEFT' | 'RIGHT' | null; isGoalCorrect: boolean; matchWon: boolean } {
    const dt = Math.max(0, dtSec);

    const dx = this.ball.x - playerX;
    const dy = this.ball.y - playerY;
    const dist = Math.hypot(dx, dy);
    if (dist < this.ball.radius + 24) {
      const nx = dist > 0.0001 ? dx / dist : 0;
      const ny = dist > 0.0001 ? dy / dist : -1;
      this.ball.vx = nx * 340;
      this.ball.vy = ny * 340;
    }

    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;

    const friction = Math.pow(0.25, dt);
    this.ball.vx *= friction;
    this.ball.vy *= friction;

    const inLeftGoalX = this.ball.x >= 120 && this.ball.x <= 380;
    const inRightGoalX = this.ball.x >= 580 && this.ball.x <= 840;

    if (this.ball.y <= 82 && (inLeftGoalX || inRightGoalX)) {
      const side: 'LEFT' | 'RIGHT' = inLeftGoalX ? 'LEFT' : 'RIGHT';
      const res = this.shootAtGoal(side);
      this.resetBall();
      return {
        scoredSide: side,
        isGoalCorrect: res.scored,
        matchWon: res.matchWon,
      };
    }

    const minX = 36;
    const maxX = arenaW - 36;
    const minY = 60;
    const maxY = arenaH - 36;

    if (this.ball.x < minX) {
      this.ball.x = minX;
      this.ball.vx = Math.abs(this.ball.vx);
    } else if (this.ball.x > maxX) {
      this.ball.x = maxX;
      this.ball.vx = -Math.abs(this.ball.vx);
    }

    if (this.ball.y > maxY) {
      this.ball.y = maxY;
      this.ball.vy = -Math.abs(this.ball.vy);
    } else if (this.ball.y < minY && !inLeftGoalX && !inRightGoalX) {
      this.ball.y = minY;
      this.ball.vy = Math.abs(this.ball.vy);
    }

    return {
      scoredSide: null,
      isGoalCorrect: false,
      matchWon: false,
    };
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
      ball: { ...this.ball },
    };
  }
}
