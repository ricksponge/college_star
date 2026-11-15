import type { CampusRoomId, ICampusNpc, ICampusRoomZone } from '../types/cctp';
import {
  CAMPUS_BADGE_SPAWNS,
  CAMPUS_HEIGHT,
  CAMPUS_NPCS,
  CAMPUS_ROOMS,
  CAMPUS_SPAWN_POINT,
  CAMPUS_WIDTH,
  getNpcById,
  getRoomAtPosition,
  getRoomById,
  type ICampusBadgeSpawn,
} from './CampusMapLayout';

export interface ICampusExplorationInfo {
  id: 'EXPLORATION_COLLEGE';
  modeNumber: 6;
  title: string;
  subtitle: string;
  description: string;
  roomsCount: number;
  npcsCount: number;
  badgesCount: number;
  worldWidth: number;
  worldHeight: number;
}

export const CAMPUS_EXPLORATION_INFO: ICampusExplorationInfo = {
  id: 'EXPLORATION_COLLEGE',
  modeNumber: 6,
  title: 'Exploration du Collège 3D',
  subtitle: 'Mode Libre • 10 Salles & 9 PNJ',
  description:
    'Explore librement la carte ouverte du collège en 3D isométrique, échange avec les professeurs et personnels, ramasse les badges et déclenche les portails d’arène.',
  roomsCount: CAMPUS_ROOMS.length,
  npcsCount: CAMPUS_NPCS.length,
  badgesCount: CAMPUS_BADGE_SPAWNS.length,
  worldWidth: CAMPUS_WIDTH,
  worldHeight: CAMPUS_HEIGHT,
};

export interface ICampusExplorationState {
  currentRoomId: CampusRoomId | null;
  currentRoom: ICampusRoomZone | null;
  visitedRooms: CampusRoomId[];
  visitedRoomsCount: number;
  totalRoomsCount: number;
  collectedBadgeIds: string[];
  collectedBadgesCount: number;
  totalBadgesCount: number;
  talkedNpcIds: string[];
  nearbyNpc: ICampusNpc | null;
  playerPosition: { x: number; y: number };
}

export interface ICampusPositionUpdateResult {
  currentRoom: ICampusRoomZone | undefined;
  enteredNewRoom: CampusRoomId | null;
  nearbyNpc: ICampusNpc | null;
}

/**
 * Session de suivi pour le Mode 6 (Exploration du Collège) :
 * - salle actuelle et salles visitées,
 * - badges collectés dans les salles,
 * - PNJ à portée d'interaction.
 */
export class CampusExplorationSession {
  public readonly info = CAMPUS_EXPLORATION_INFO;

  private currentRoomId: CampusRoomId | null = null;
  private readonly visitedRooms = new Set<CampusRoomId>();
  private readonly collectedBadgeIds = new Set<string>();
  private readonly talkedNpcIds = new Set<string>();
  private nearbyNpc: ICampusNpc | null = null;
  private playerPosition = { ...CAMPUS_SPAWN_POINT };

  constructor(initialX = CAMPUS_SPAWN_POINT.x, initialY = CAMPUS_SPAWN_POINT.y) {
    this.updatePlayerPosition(initialX, initialY);
  }

  public updatePlayerPosition(x: number, y: number): ICampusPositionUpdateResult {
    this.playerPosition = { x, y };

    const currentRoom = getRoomAtPosition(x, y);
    let enteredNewRoom: CampusRoomId | null = null;

    if (currentRoom) {
      this.currentRoomId = currentRoom.id;
      if (!this.visitedRooms.has(currentRoom.id)) {
        this.visitedRooms.add(currentRoom.id);
        enteredNewRoom = currentRoom.id;
      }
    } else {
      this.currentRoomId = null;
    }

    this.nearbyNpc = this.findClosestInteractableNpc(x, y);

    return {
      currentRoom,
      enteredNewRoom,
      nearbyNpc: this.nearbyNpc,
    };
  }

  public collectBadge(badgeId: string): {
    collected: boolean;
    badge?: ICampusBadgeSpawn;
    roomBadgesCollectedCount: number;
  } {
    const badge = CAMPUS_BADGE_SPAWNS.find((b) => b.id === badgeId);
    if (!badge) {
      return { collected: false, roomBadgesCollectedCount: 0 };
    }

    if (this.collectedBadgeIds.has(badge.id)) {
      return {
        collected: false,
        badge,
        roomBadgesCollectedCount: this.getCollectedBadgesCountInRoom(badge.room_id),
      };
    }

    this.collectedBadgeIds.add(badge.id);
    return {
      collected: true,
      badge,
      roomBadgesCollectedCount: this.getCollectedBadgesCountInRoom(badge.room_id),
    };
  }

  public collectBadgeAtPosition(x: number, y: number, pickupRadius = 48): ICampusBadgeSpawn | null {
    for (const badge of CAMPUS_BADGE_SPAWNS) {
      if (this.collectedBadgeIds.has(badge.id)) continue;
      if (Math.hypot(x - badge.x, y - badge.y) <= pickupRadius) {
        this.collectedBadgeIds.add(badge.id);
        return badge;
      }
    }
    return null;
  }

  public markNpcTalked(npcId: string): ICampusNpc | undefined {
    const npc = getNpcById(npcId);
    if (npc) {
      this.talkedNpcIds.add(npc.id);
    }
    return npc;
  }

  public isBadgeCollected(badgeId: string): boolean {
    return this.collectedBadgeIds.has(badgeId);
  }

  public hasVisitedRoom(roomId: CampusRoomId): boolean {
    return this.visitedRooms.has(roomId);
  }

  public getCollectedBadgesCountInRoom(roomId: CampusRoomId): number {
    return CAMPUS_BADGE_SPAWNS.filter(
      (badge) => badge.room_id === roomId && this.collectedBadgeIds.has(badge.id)
    ).length;
  }

  public getRemainingBadges(): ICampusBadgeSpawn[] {
    return CAMPUS_BADGE_SPAWNS.filter((badge) => !this.collectedBadgeIds.has(badge.id));
  }

  public getState(): ICampusExplorationState {
    return {
      currentRoomId: this.currentRoomId,
      currentRoom: this.currentRoomId ? getRoomById(this.currentRoomId) : null,
      visitedRooms: Array.from(this.visitedRooms),
      visitedRoomsCount: this.visitedRooms.size,
      totalRoomsCount: CAMPUS_ROOMS.length,
      collectedBadgeIds: Array.from(this.collectedBadgeIds),
      collectedBadgesCount: this.collectedBadgeIds.size,
      totalBadgesCount: CAMPUS_BADGE_SPAWNS.length,
      talkedNpcIds: Array.from(this.talkedNpcIds),
      nearbyNpc: this.nearbyNpc,
      playerPosition: { ...this.playerPosition },
    };
  }

  public reset(): void {
    this.currentRoomId = null;
    this.visitedRooms.clear();
    this.collectedBadgeIds.clear();
    this.talkedNpcIds.clear();
    this.nearbyNpc = null;
    this.updatePlayerPosition(CAMPUS_SPAWN_POINT.x, CAMPUS_SPAWN_POINT.y);
  }

  private findClosestInteractableNpc(x: number, y: number): ICampusNpc | null {
    let closest: ICampusNpc | null = null;
    let bestDist = Infinity;

    for (const npc of CAMPUS_NPCS) {
      const dist = Math.hypot(x - npc.x, y - npc.y);
      if (dist <= npc.interaction_radius && dist < bestDist) {
        closest = npc;
        bestDist = dist;
      }
    }

    return closest;
  }
}
