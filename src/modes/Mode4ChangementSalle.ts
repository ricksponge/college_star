import type { IGameMode, IQuestion } from '../types/cctp';

export const MODE_CHANGEMENT_DE_SALLE: IGameMode = {
  id: 'CHANGEMENT_DE_SALLE',
  mode_number: 4,
  name: 'Changement de Salle',
  inspired_by: 'Zone Réservée (Hot Zone)',
  format: 'SOLO_COOP',
  duration_seconds: 120,
  target_subject: 'vie_au_college',
  description:
    'Spécial Autonomie 6ème : un extrait d’emploi du temps s’affiche (ex. : « Semaine B - 10h : SVT en Salle 204 »). Évite les Ralentisseurs de Bavardage et capture la bonne salle avant la sonnerie.',
  victory_condition: 'Atteindre 100% de capture sur la salle exacte avant la fin des 2 minutes.',
};

export interface IScheduleDirective {
  week: 'A' | 'B';
  hourLabel: string;
  subjectLabel: string;
  roomCode: string;
  expectedFloorLabel: string;
}

export interface ICampusRoomZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  isCorrect: boolean;
}

export interface IChatterDrone {
  id: string;
  x: number;
  y: number;
  vx: number;
  radius: number;
}

export interface IChangementSalleState {
  directive: IScheduleDirective;
  capturePct: number;
  slowedByChatterMs: number;
  rooms: ICampusRoomZone[];
  chatterDrones: IChatterDrone[];
}

export class ChangementSalleSession {
  public readonly config = MODE_CHANGEMENT_DE_SALLE;
  private directive: IScheduleDirective = {
    week: 'B',
    hourLabel: '10h00',
    subjectLabel: 'SVT',
    roomCode: '204',
    expectedFloorLabel: '2e étage',
  };
  private capturePct = 0;
  private slowedByChatterMs = 0;
  private rooms: ICampusRoomZone[] = [];
  private chatterDrones: IChatterDrone[] = [
    { id: 'chatter_1', x: 240, y: 240, vx: 150, radius: 22 },
    { id: 'chatter_2', x: 720, y: 390, vx: -175, radius: 22 },
  ];

  public setScheduleDirective(directive: IScheduleDirective): void {
    this.directive = directive;
  }

  public setupRoomsFromQuestion(question: IQuestion): void {
    const slots = [
      { x: 70, y: 95 },
      { x: 300, y: 95 },
      { x: 530, y: 95 },
      { x: 760, y: 95 },
    ];
    const targets = question.targets.slice(0, slots.length);
    this.rooms = targets.map((target, index) => ({
      id: `room_${index + 1}`,
      x: slots[index].x,
      y: slots[index].y,
      width: 130,
      height: 74,
      label: target.label,
      isCorrect: target.is_correct,
    }));
  }

  public isPlayerInCorrectRoom(playerX: number, playerY: number): boolean {
    return this.rooms.some(
      (room) =>
        room.isCorrect &&
        playerX >= room.x &&
        playerX <= room.x + room.width &&
        playerY >= room.y &&
        playerY <= room.y + room.height
    );
  }

  public updateChatterDrones(
    dtSec: number,
    playerX: number,
    playerY: number,
    arenaW = 960
  ): boolean {
    const dt = Math.max(0, dtSec);
    let hit = false;

    for (const drone of this.chatterDrones) {
      drone.x += drone.vx * dt;
      const minX = 36 + drone.radius;
      const maxX = arenaW - 36 - drone.radius;
      if (maxX >= minX) {
        if (drone.x < minX) {
          drone.x = minX;
          drone.vx = Math.abs(drone.vx);
        } else if (drone.x > maxX) {
          drone.x = maxX;
          drone.vx = -Math.abs(drone.vx);
        }
      }

      if (!hit && this.slowedByChatterMs <= 0) {
        const dist = Math.hypot(drone.x - playerX, drone.y - playerY);
        if (dist < drone.radius + 22) {
          this.hitChatterTrap();
          hit = true;
        }
      }
    }

    return hit;
  }

  public hitChatterTrap(): void {
    this.slowedByChatterMs = 2000;
  }

  public advanceCapture(dtSec: number, isInsideCorrectRoom: boolean): boolean {
    if (this.slowedByChatterMs > 0) {
      this.slowedByChatterMs = Math.max(0, this.slowedByChatterMs - dtSec * 1000);
    }
    if (isInsideCorrectRoom) {
      this.capturePct = Math.min(100, this.capturePct + dtSec * 25);
    }
    return this.capturePct >= 100;
  }

  public getState(): IChangementSalleState {
    return {
      directive: this.directive,
      capturePct: Math.round(this.capturePct),
      slowedByChatterMs: this.slowedByChatterMs,
      rooms: this.rooms.map((room) => ({ ...room })),
      chatterDrones: this.chatterDrones.map((drone) => ({ ...drone })),
    };
  }
}
