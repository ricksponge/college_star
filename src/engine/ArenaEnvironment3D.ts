import * as THREE from 'three';
import type { GameModeId } from '../types/cctp';
import type { IRenderObstacle } from './IsometricRenderer';

export interface IArenaAnimationState {
  shrinkRadius3d?: number;
  laserSweepZ3d?: number;
}

interface IModeTheme {
  surroundColor: number;
  curbColor: number;
  tileA: number;
  tileB: number;
  groutColor: number;
  lineColor: number;
  trimColor: number;
  lockerColor: number;
  wallBodyColor: number;
  bleacherColors: [number, number, number];
  isSoccerPitch: boolean;
  isHallway: boolean;
}

interface IArenaAnimRefs {
  floodlightHalos: THREE.MeshBasicMaterial[];
  gemCrystal?: THREE.Group;
  gemRing?: THREE.Mesh;
  gemCoreMat?: THREE.MeshStandardMaterial;
  shrinkGroup?: THREE.Group;
  shrinkRingMat?: THREE.MeshBasicMaterial;
  shrinkStormMat?: THREE.MeshBasicMaterial;
  laserGroup?: THREE.Group;
  laserOuterBeam?: THREE.Mesh;
  laserCoreMat?: THREE.MeshStandardMaterial;
  holoRings: THREE.Mesh[];
  bushes: THREE.Group[];
}

function getModeTheme(modeId: GameModeId): IModeTheme {
  switch (modeId) {
    case 'MATCH_DES_ACCORDS':
      return {
        surroundColor: 0x1e3a2f,
        curbColor: 0x334155,
        tileA: 0x15803d,
        tileB: 0x16a34a,
        groutColor: 0x14532d,
        lineColor: 0xf8fafc,
        trimColor: 0xfacc15,
        lockerColor: 0x2563eb,
        wallBodyColor: 0xb45309,
        bleacherColors: [0x2563eb, 0xfacc15, 0xef4444],
        isSoccerPitch: true,
        isHallway: false,
      };
    case 'INTERRO_SURPRISE':
      return {
        surroundColor: 0x292524,
        curbColor: 0x57534e,
        tileA: 0x9a5b32,
        tileB: 0x854d27,
        groutColor: 0x451a03,
        lineColor: 0xfef3c7,
        trimColor: 0xf97316,
        lockerColor: 0xd97706,
        wallBodyColor: 0x991b1b,
        bleacherColors: [0xf97316, 0xfacc15, 0x16a34a],
        isSoccerPitch: false,
        isHallway: false,
      };
    case 'CHANGEMENT_DE_SALLE':
      return {
        surroundColor: 0x1e293b,
        curbColor: 0x334155,
        tileA: 0x475569,
        tileB: 0x64748b,
        groutColor: 0x1e293b,
        lineColor: 0x38bdf8,
        trimColor: 0xfacc15,
        lockerColor: 0x2563eb,
        wallBodyColor: 0x3b4d6b,
        bleacherColors: [0x0ea5e9, 0xfacc15, 0x2563eb],
        isSoccerPitch: false,
        isHallway: true,
      };
    case 'CONSEIL_DE_CLASSE':
      return {
        surroundColor: 0x171226,
        curbColor: 0x312e81,
        tileA: 0x2e2348,
        tileB: 0x241b38,
        groutColor: 0x130d24,
        lineColor: 0xf59e0b,
        trimColor: 0xef4444,
        lockerColor: 0x6d28d9,
        wallBodyColor: 0x7f1d1d,
        bleacherColors: [0xef4444, 0xf59e0b, 0x7c3aed],
        isSoccerPitch: false,
        isHallway: false,
      };
    case 'CHASSE_AUX_BONNES_NOTES':
    default:
      return {
        surroundColor: 0x1e293b,
        curbColor: 0x334155,
        tileA: 0x3b4d6b,
        tileB: 0x334155,
        groutColor: 0x1e293b,
        lineColor: 0xe2e8f0,
        trimColor: 0xfbbf24,
        lockerColor: 0x0284c7,
        wallBodyColor: 0x9f1239,
        bleacherColors: [0x3b82f6, 0xfacc15, 0x10b981],
        isSoccerPitch: false,
        isHallway: false,
      };
  }
}

/**
 * Construit l'environnement 3D style Brawl Stars de l'arène du collège
 * autour du terrain jouable [0..arenaWidth3d, 0..arenaHeight3d].
 */
export function buildArenaEnvironment3D(
  modeId: GameModeId,
  arenaWidth3d: number,
  arenaHeight3d: number,
  obstacles: IRenderObstacle[],
  worldScale3d = 1 / 40
): THREE.Group {
  const root = new THREE.Group();
  const theme = getModeTheme(modeId);
  const animRefs: IArenaAnimRefs = {
    floodlightHalos: [],
    holoRings: [],
    bushes: [],
  };

  buildSurroundAndFloor(root, theme, arenaWidth3d, arenaHeight3d);
  buildCourtMarkings(root, theme, modeId, arenaWidth3d, arenaHeight3d);
  buildPerimeterWallsAndCurbs(root, theme, arenaWidth3d, arenaHeight3d);
  buildSchoolyardPerimeterProps(root, theme, modeId, arenaWidth3d, arenaHeight3d, animRefs);
  buildModeCenterpiece(root, modeId, arenaWidth3d, arenaHeight3d, animRefs);
  buildObstacles3D(root, theme, modeId, obstacles, worldScale3d, animRefs);

  root.userData.animRefs = animRefs;
  return root;
}

/**
 * Met à jour les éléments animés de la scène 3D (mine à gemmes, zone rétrécissante,
 * laser du Conseil de Classe, holo-pads, projecteurs et feuillage).
 */
export function updateArenaEnvironment3D(
  group: THREE.Group,
  timeSec: number,
  state: IArenaAnimationState
): void {
  const refs = group.userData.animRefs as IArenaAnimRefs | undefined;
  if (!refs) return;

  for (let i = 0; i < refs.floodlightHalos.length; i++) {
    refs.floodlightHalos[i].opacity = 0.22 + 0.05 * Math.sin(timeSec * 3.1 + i * 1.4);
  }

  if (refs.gemCrystal) {
    refs.gemCrystal.rotation.y = timeSec * 1.45;
    refs.gemCrystal.position.y = 0.72 + Math.sin(timeSec * 2.8) * 0.14;
  }
  if (refs.gemRing) {
    refs.gemRing.rotation.z = -timeSec * 0.95;
  }
  if (refs.gemCoreMat) {
    refs.gemCoreMat.emissiveIntensity = 0.75 + 0.3 * Math.sin(timeSec * 3.4);
  }

  if (refs.shrinkGroup) {
    if (state.shrinkRadius3d !== undefined && state.shrinkRadius3d > 0) {
      const r = Math.max(0.3, state.shrinkRadius3d);
      refs.shrinkGroup.visible = true;
      refs.shrinkGroup.scale.set(r, 1, r);
      if (refs.shrinkRingMat) {
        refs.shrinkRingMat.opacity = 0.78 + 0.2 * Math.sin(timeSec * 6.5);
      }
      if (refs.shrinkStormMat) {
        refs.shrinkStormMat.opacity = 0.22 + 0.06 * Math.sin(timeSec * 4.2);
      }
    } else {
      refs.shrinkGroup.visible = false;
    }
  }

  if (refs.laserGroup) {
    if (state.laserSweepZ3d !== undefined) {
      refs.laserGroup.visible = true;
      refs.laserGroup.position.z = state.laserSweepZ3d;
      if (refs.laserOuterBeam) {
        const pulse = 1 + 0.24 * Math.sin(timeSec * 14);
        refs.laserOuterBeam.scale.set(pulse, 1, pulse);
      }
      if (refs.laserCoreMat) {
        refs.laserCoreMat.emissiveIntensity = 1.2 + 0.4 * Math.sin(timeSec * 16);
      }
    } else {
      refs.laserGroup.visible = false;
    }
  }

  for (let i = 0; i < refs.holoRings.length; i++) {
    const ring = refs.holoRings[i];
    ring.rotation.z = timeSec * 1.15;
    ring.position.y = 0.18 + Math.sin(timeSec * 3.2 + i * 0.9) * 0.06;
  }

  for (let i = 0; i < refs.bushes.length; i++) {
    const bush = refs.bushes[i];
    const sway = 1 + Math.sin(timeSec * 2.6 + i * 1.37) * 0.025;
    bush.scale.set(sway, 1 / Math.sqrt(sway), sway);
  }
}

function buildSurroundAndFloor(
  root: THREE.Group,
  theme: IModeTheme,
  w3d: number,
  h3d: number
): void {
  // Grand socle extérieur pour masquer les bords hors-champ à 50°
  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(w3d + 36, h3d + 32),
    new THREE.MeshStandardMaterial({ color: theme.surroundColor, roughness: 0.95 })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.set(w3d * 0.5, -0.14, h3d * 0.5);
  surround.receiveShadow = true;
  root.add(surround);

  // Trottoir périphérique surélevé autour du terrain
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(w3d + 5.6, 0.1, h3d + 4.4),
    new THREE.MeshStandardMaterial({ color: theme.curbColor, roughness: 0.85 })
  );
  apron.position.set(w3d * 0.5, -0.07, h3d * 0.5);
  apron.receiveShadow = true;
  root.add(apron);

  // Couche jointive (grout) sous le dallage du terrain
  const groutFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(w3d, h3d),
    new THREE.MeshStandardMaterial({ color: theme.groutColor, roughness: 0.9 })
  );
  groutFloor.rotation.x = -Math.PI / 2;
  groutFloor.position.set(w3d * 0.5, -0.015, h3d * 0.5);
  groutFloor.receiveShadow = true;
  root.add(groutFloor);

  if (theme.isSoccerPitch) {
    // Bandes de pelouse tondue alternées (terrain de foot du collège)
    const stripeCount = 12;
    const stripeW = w3d / stripeCount;
    const stripeGeo = new THREE.BoxGeometry(stripeW, 0.03, h3d);
    const matA = new THREE.MeshStandardMaterial({ color: theme.tileA, roughness: 0.85 });
    const matB = new THREE.MeshStandardMaterial({ color: theme.tileB, roughness: 0.85 });

    for (let i = 0; i < stripeCount; i++) {
      const stripe = new THREE.Mesh(stripeGeo, i % 2 === 0 ? matA : matB);
      stripe.position.set((i + 0.5) * stripeW, -0.015, h3d * 0.5);
      stripe.receiveShadow = true;
      root.add(stripe);
    }
    return;
  }

  // Dallage en damier 3D légèrement surélevé (InstancedMesh = 2 draw calls)
  const cols = 12;
  const rows = 8;
  const tileW = w3d / cols;
  const tileD = h3d / rows;
  const tileGeo = new THREE.BoxGeometry(tileW * 0.955, 0.03, tileD * 0.955);
  const matA = new THREE.MeshStandardMaterial({ color: theme.tileA, roughness: 0.8 });
  const matB = new THREE.MeshStandardMaterial({ color: theme.tileB, roughness: 0.82 });

  const countA = Math.ceil((cols * rows) / 2);
  const countB = Math.floor((cols * rows) / 2);
  const instA = new THREE.InstancedMesh(tileGeo, matA, countA);
  const instB = new THREE.InstancedMesh(tileGeo, matB, countB);
  instA.receiveShadow = true;
  instB.receiveShadow = true;
  instA.frustumCulled = false;
  instB.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  let idxA = 0;
  let idxB = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tx = (c + 0.5) * tileW;
      const tz = (r + 0.5) * tileD;
      const isEven = (r + c) % 2 === 0;
      matrix.makeTranslation(tx, -0.015, tz);
      if (isEven) {
        instA.setMatrixAt(idxA++, matrix);
      } else {
        instB.setMatrixAt(idxB++, matrix);
      }
    }
  }
  instA.instanceMatrix.needsUpdate = true;
  instB.instanceMatrix.needsUpdate = true;
  root.add(instA, instB);
}

function buildCourtMarkings(
  root: THREE.Group,
  theme: IModeTheme,
  modeId: GameModeId,
  w3d: number,
  h3d: number
): void {
  const lineMat = new THREE.MeshBasicMaterial({
    color: theme.lineColor,
    transparent: true,
    opacity: theme.isSoccerPitch ? 0.92 : 0.42,
  });
  const lineY = 0.012;
  const t = 0.09;

  // Lignes extérieures du terrain
  const topLine = new THREE.Mesh(new THREE.PlaneGeometry(w3d - 0.5, t), lineMat);
  topLine.rotation.x = -Math.PI / 2;
  topLine.position.set(w3d * 0.5, lineY, 0.32);

  const botLine = new THREE.Mesh(new THREE.PlaneGeometry(w3d - 0.5, t), lineMat);
  botLine.rotation.x = -Math.PI / 2;
  botLine.position.set(w3d * 0.5, lineY, h3d - 0.32);

  const leftLine = new THREE.Mesh(new THREE.PlaneGeometry(t, h3d - 0.5), lineMat);
  leftLine.rotation.x = -Math.PI / 2;
  leftLine.position.set(0.32, lineY, h3d * 0.5);

  const rightLine = new THREE.Mesh(new THREE.PlaneGeometry(t, h3d - 0.5), lineMat);
  rightLine.rotation.x = -Math.PI / 2;
  rightLine.position.set(w3d - 0.32, lineY, h3d * 0.5);

  // Ligne médiane & cercle central
  const midLine = new THREE.Mesh(new THREE.PlaneGeometry(w3d - 0.64, t * 0.9), lineMat);
  midLine.rotation.x = -Math.PI / 2;
  midLine.position.set(w3d * 0.5, lineY, h3d * 0.5);

  const centerCircle = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.12, 40), lineMat);
  centerCircle.rotation.x = -Math.PI / 2;
  centerCircle.position.set(w3d * 0.5, lineY + 0.002, h3d * 0.5);

  root.add(topLine, botLine, leftLine, rightLine, midLine, centerCircle);

  if (modeId === 'MATCH_DES_ACCORDS') {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), lineMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(w3d * 0.5, lineY + 0.003, h3d * 0.5);
    root.add(spot);

    // Surface de réparation côté joueur (bas)
    const boxW = Math.min(w3d * 0.56, 11);
    const boxD = 2.6;
    const penFront = new THREE.Mesh(new THREE.PlaneGeometry(boxW, t), lineMat);
    penFront.rotation.x = -Math.PI / 2;
    penFront.position.set(w3d * 0.5, lineY, h3d - 0.32 - boxD);

    const penL = new THREE.Mesh(new THREE.PlaneGeometry(t, boxD), lineMat);
    penL.rotation.x = -Math.PI / 2;
    penL.position.set(w3d * 0.5 - boxW * 0.5, lineY, h3d - 0.32 - boxD * 0.5);

    const penR = new THREE.Mesh(new THREE.PlaneGeometry(t, boxD), lineMat);
    penR.rotation.x = -Math.PI / 2;
    penR.position.set(w3d * 0.5 + boxW * 0.5, lineY, h3d - 0.32 - boxD * 0.5);

    root.add(penFront, penL, penR);
  } else if (theme.isHallway) {
    // Bandes de couloir jaune directionnelles
    const laneMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.48,
    });
    for (const zFrac of [0.28, 0.72]) {
      for (let i = 0; i < 6; i++) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.14), laneMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(2.2 + i * ((w3d - 4.4) / 5), lineY + 0.003, h3d * zFrac);
        root.add(dash);
      }
    }
  }
}

function buildPerimeterWallsAndCurbs(
  root: THREE.Group,
  theme: IModeTheme,
  w3d: number,
  h3d: number
): void {
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  const trimMat = new THREE.MeshStandardMaterial({ color: theme.trimColor, roughness: 0.35 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });

  const wallT = 0.42;
  const segments: Array<[number, number, number, number]> = [
    [w3d * 0.5, -wallT * 0.5, w3d + wallT * 2, wallT],
    [w3d * 0.5, h3d + wallT * 0.5, w3d + wallT * 2, wallT],
    [-wallT * 0.5, h3d * 0.5, wallT, h3d],
    [w3d + wallT * 0.5, h3d * 0.5, wallT, h3d],
  ];

  for (const [bx, bz, bw, bd] of segments) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.42, bd), baseMat);
    base.position.set(bx, 0.21, bz);
    base.castShadow = true;
    base.receiveShadow = true;

    const rail = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.04, 0.14, bd + 0.04), trimMat);
    rail.position.set(bx, 0.49, bz);
    rail.castShadow = true;

    root.add(base, rail);
  }

  // Piliers d'angle décoratifs
  const corners: Array<[number, number]> = [
    [-wallT * 0.5, -wallT * 0.5],
    [w3d + wallT * 0.5, -wallT * 0.5],
    [-wallT * 0.5, h3d + wallT * 0.5],
    [w3d + wallT * 0.5, h3d + wallT * 0.5],
  ];
  for (const [cx, cz] of corners) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.72), pillarMat);
    col.position.set(cx, 0.41, cz);
    col.castShadow = true;

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.16, 0.84), trimMat);
    cap.position.set(cx, 0.88, cz);
    cap.castShadow = true;

    root.add(col, cap);
  }
}

function buildSchoolyardPerimeterProps(
  root: THREE.Group,
  theme: IModeTheme,
  modeId: GameModeId,
  w3d: number,
  h3d: number,
  animRefs: IArenaAnimRefs
): void {
  // 1. Casiers scolaires le long du mur supérieur
  const lockerBanksX =
    modeId === 'MATCH_DES_ACCORDS'
      ? [1.8, w3d - 1.8]
      : [2.4, 5.4, w3d - 5.4, w3d - 2.4];

  for (const lx of lockerBanksX) {
    if (lx > 1.2 && lx < w3d - 1.2) {
      root.add(createLockerBank(lx, -1.05, theme.lockerColor));
    }
  }

  // Si mode couloir, casiers supplémentaires en fond central et sur les côtés
  if (theme.isHallway) {
    root.add(createLockerBank(w3d * 0.5 - 1.4, -1.05, theme.lockerColor));
    root.add(createLockerBank(w3d * 0.5 + 1.4, -1.05, theme.lockerColor));
  }

  // Panneau / Arche du Collège au centre haut
  root.add(createSchoolBannerArch(w3d * 0.5, -1.95, theme.trimColor));

  // 2. Gradins colorés de stade sur les flancs gauche & droite (hors terrain)
  root.add(createBleachers(-1.65, h3d * 0.5, h3d * 0.68, 1, theme.bleacherColors));
  root.add(createBleachers(w3d + 1.65, h3d * 0.5, h3d * 0.68, -1, theme.bleacherColors));

  // Gradins nord derrière les casiers
  root.add(createNorthBleacherStand(w3d * 0.3, -2.55, 5.2, theme.bleacherColors));
  root.add(createNorthBleacherStand(w3d * 0.7, -2.55, 5.2, theme.bleacherColors));

  // 3. Arbres & haies stylisés autour du périmètre extérieur (garder le bas bas pour la lisibilité caméra 50°)
  const treePositions: Array<[number, number, number]> = [
    [-2.9, -2.4, 1.15],
    [w3d + 2.9, -2.4, 1.15],
    [-3.4, h3d * 0.18, 0.95],
    [w3d + 3.4, h3d * 0.18, 0.95],
    [-3.3, h3d * 0.85, 1.0],
    [w3d + 3.3, h3d * 0.85, 1.0],
    [1.2, -3.2, 0.9],
    [w3d - 1.2, -3.2, 0.9],
  ];
  for (const [tx, tz, scale] of treePositions) {
    root.add(createStylizedTree(tx, tz, scale));
  }

  // Bancs & jardinières basses côté sud (hauteur réduite pour ne jamais masquer le joueur)
  for (const bx of [w3d * 0.25, w3d * 0.5, w3d * 0.75]) {
    root.add(createLowBench(bx, h3d + 1.15, theme.trimColor));
  }

  // 4. Quatre projecteurs de stade aux coins
  const floodCorners: Array<[number, number]> = [
    [-1.4, -1.4],
    [w3d + 1.4, -1.4],
    [-1.4, h3d + 1.1],
    [w3d + 1.4, h3d + 1.1],
  ];
  for (const [fx, fz] of floodCorners) {
    const { tower, haloMat } = createStadiumFloodlight(fx, fz, w3d * 0.5, h3d * 0.5);
    root.add(tower);
    animRefs.floodlightHalos.push(haloMat);
  }
}

function createLockerBank(cx: number, cz: number, lockerColor: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const bodyMat = new THREE.MeshStandardMaterial({ color: lockerColor, roughness: 0.45 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.6,
    roughness: 0.25,
  });

  const bankW = 2.1;
  const bankH = 1.42;
  const bankD = 0.62;

  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(bankW, bankH, bankD), bodyMat);
  cabinet.position.y = bankH * 0.5;
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  group.add(cabinet);

  const topCap = new THREE.Mesh(new THREE.BoxGeometry(bankW + 0.08, 0.1, bankD + 0.08), trimMat);
  topCap.position.y = bankH + 0.05;
  group.add(topCap);

  // 4 portes individuelles face avant (+Z)
  const doorW = bankW / 4 - 0.06;
  for (let i = 0; i < 4; i++) {
    const dx = -bankW * 0.5 + (i + 0.5) * (bankW / 4);
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, bankH - 0.18, 0.06), bodyMat);
    door.position.set(dx, bankH * 0.5, bankD * 0.5 + 0.02);

    const vent = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.62, 0.08, 0.03), trimMat);
    vent.position.set(dx, bankH * 0.82, bankD * 0.5 + 0.055);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.04), handleMat);
    handle.position.set(dx + doorW * 0.3, bankH * 0.52, bankD * 0.5 + 0.06);

    group.add(door, vent, handle);
  }

  return group;
}

function createSchoolBannerArch(cx: number, cz: number, trimColor: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45 });
  const accentMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    emissive: trimColor,
    emissiveIntensity: 0.25,
    roughness: 0.35,
  });

  for (const side of [-1.9, 1.9]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.1, 10), postMat);
    post.position.set(side, 1.05, 0);
    post.castShadow = true;
    group.add(post);
  }

  const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.88, 0.28), boardMat);
  board.position.set(0, 1.95, 0);
  board.castShadow = true;

  const border = new THREE.Mesh(new THREE.BoxGeometry(4.36, 1.02, 0.2), accentMat);
  border.position.set(0, 1.95, -0.02);

  // Horloge / emblème doré au centre du fronton
  const clockFace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.35 })
  );
  clockFace.rotation.x = Math.PI / 2;
  clockFace.position.set(0, 1.95, 0.14);

  group.add(border, board, clockFace);
  return group;
}

function createBleachers(
  cx: number,
  cz: number,
  lengthZ: number,
  inwardDirX: 1 | -1,
  colors: [number, number, number]
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
  const stepSpacing = 0.62;

  for (let tier = 0; tier < 3; tier++) {
    const offsetX = -inwardDirX * tier * stepSpacing;
    const stepH = 0.35 + tier * 0.36;

    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.56, stepH, lengthZ), frameMat);
    riser.position.set(offsetX, stepH * 0.5, 0);
    riser.castShadow = true;
    riser.receiveShadow = true;

    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.12, lengthZ - 0.12),
      new THREE.MeshStandardMaterial({ color: colors[tier], roughness: 0.45 })
    );
    plank.position.set(offsetX, stepH + 0.06, 0);
    plank.castShadow = true;

    group.add(riser, plank);
  }

  return group;
}

function createNorthBleacherStand(
  cx: number,
  cz: number,
  widthX: number,
  colors: [number, number, number]
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });

  for (let tier = 0; tier < 2; tier++) {
    const stepH = 0.4 + tier * 0.42;
    const offsetZ = -tier * 0.68;

    const riser = new THREE.Mesh(new THREE.BoxGeometry(widthX, stepH, 0.62), frameMat);
    riser.position.set(0, stepH * 0.5, offsetZ);
    riser.castShadow = true;

    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(widthX - 0.12, 0.12, 0.52),
      new THREE.MeshStandardMaterial({ color: colors[tier % colors.length], roughness: 0.45 })
    );
    plank.position.set(0, stepH + 0.06, offsetZ);
    group.add(riser, plank);
  }

  return group;
}

function createStylizedTree(cx: number, cz: number, scale: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  group.scale.setScalar(scale);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 1.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85, flatShading: true })
  );
  trunk.position.y = 0.65;
  trunk.castShadow = true;
  group.add(trunk);

  const crownMain = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.95, 1),
    new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.7, flatShading: true })
  );
  crownMain.position.y = 1.85;
  crownMain.castShadow = true;

  const crownTop = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.68, 1),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.65, flatShading: true })
  );
  crownTop.position.set(0.18, 2.48, -0.1);
  crownTop.castShadow = true;

  group.add(crownMain, crownTop);
  return group;
}

function createLowBench(cx: number, cz: number, accentColor: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.12, 0.55),
    new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5 })
  );
  seat.position.y = 0.34;
  seat.castShadow = true;

  const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
  for (const lx of [-0.82, 0.82]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.45), legMat);
    leg.position.set(lx, 0.16, 0);
    group.add(leg);
  }

  group.add(seat);
  return group;
}

function createStadiumFloodlight(
  fx: number,
  fz: number,
  targetX: number,
  targetZ: number
): { tower: THREE.Group; haloMat: THREE.MeshBasicMaterial } {
  const tower = new THREE.Group();
  tower.position.set(fx, 0, fz);
  tower.updateMatrixWorld(true);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.5, 10), baseMat);
  collar.position.y = 0.25;
  collar.castShadow = true;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 4.2, 10), poleMat);
  pole.position.y = 2.1;
  pole.castShadow = true;

  const headPivot = new THREE.Group();
  headPivot.position.y = 4.25;
  tower.add(collar, pole, headPivot);
  headPivot.updateMatrixWorld(true);
  headPivot.lookAt(targetX, 0.6, targetZ);

  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.48, 0.3), poleMat);
  const lampPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 0.34),
    new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
  );
  lampPanel.position.z = 0.16;

  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const lightCone = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.8, 12, 1, true), haloMat);
  lightCone.rotation.x = -Math.PI / 2;
  lightCone.position.z = 1.55;

  headPivot.add(housing, lampPanel, lightCone);
  return { tower, haloMat };
}

function buildModeCenterpiece(
  root: THREE.Group,
  modeId: GameModeId,
  w3d: number,
  h3d: number,
  animRefs: IArenaAnimRefs
): void {
  const cx = w3d * 0.5;
  const cz = h3d * 0.5;

  if (modeId === 'CHASSE_AUX_BONNES_NOTES') {
    const wellGroup = new THREE.Group();
    wellGroup.position.set(cx, 0, cz);

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.65, 0.24, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, flatShading: true })
    );
    rim.position.y = 0.12;
    rim.receiveShadow = true;

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.85,
      roughness: 0.2,
    });
    const corePool = new THREE.Mesh(new THREE.CircleGeometry(1.18, 24), coreMat);
    corePool.rotation.x = -Math.PI / 2;
    corePool.position.y = 0.25;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.11, 10, 28),
      new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0xc084fc,
        emissiveIntensity: 0.7,
        roughness: 0.25,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.28;

    const crystalCluster = new THREE.Group();
    crystalCluster.position.y = 0.72;
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x7dd3fc,
      emissiveIntensity: 0.65,
      roughness: 0.15,
      flatShading: true,
    });
    const mainGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), gemMat);
    mainGem.scale.set(0.85, 1.45, 0.85);
    const shardL = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gemMat);
    shardL.position.set(-0.34, -0.1, 0.14);
    shardL.rotation.z = 0.45;
    const shardR = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gemMat);
    shardR.position.set(0.34, -0.08, -0.12);
    shardR.rotation.z = -0.4;
    crystalCluster.add(mainGem, shardL, shardR);

    wellGroup.add(rim, corePool, ring, crystalCluster);
    root.add(wellGroup);

    animRefs.gemCrystal = crystalCluster;
    animRefs.gemRing = ring;
    animRefs.gemCoreMat = coreMat;
  } else if (modeId === 'INTERRO_SURPRISE') {
    // Caisses d'énergie scolaires décoratives aux abords extérieurs
    const crateCoords: Array<[number, number]> = [
      [-0.95, 2.2],
      [-0.95, h3d - 2.4],
      [w3d + 0.95, 2.2],
      [w3d + 0.95, h3d - 2.4],
    ];
    for (const [kx, kz] of crateCoords) {
      root.add(createEnergyCrate3D(kx, kz));
    }

    // Anneau dynamique de rétrécissement de la Sonnerie de Fin d'Heure
    const shrinkGroup = new THREE.Group();
    shrinkGroup.position.set(cx, 0.035, cz);
    shrinkGroup.visible = false;

    const shrinkRingMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const borderRing = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 48), shrinkRingMat);
    borderRing.rotation.x = -Math.PI / 2;

    const shrinkStormMat = new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const stormField = new THREE.Mesh(new THREE.RingGeometry(1.0, 24.0, 48), shrinkStormMat);
    stormField.rotation.x = -Math.PI / 2;

    shrinkGroup.add(stormField, borderRing);
    root.add(shrinkGroup);

    animRefs.shrinkGroup = shrinkGroup;
    animRefs.shrinkRingMat = shrinkRingMat;
    animRefs.shrinkStormMat = shrinkStormMat;
  } else if (modeId === 'CONSEIL_DE_CLASSE') {
    // Podium / estrade du Conseil de Classe au nord du terrain
    const dais = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 0.08, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.5 })
    );
    dais.position.set(cx, 0.04, 1.8);
    dais.receiveShadow = true;

    const daisTrim = new THREE.Mesh(
      new THREE.BoxGeometry(7.0, 0.06, 2.8),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.3,
      })
    );
    daisTrim.position.set(cx, 0.025, 1.8);
    root.add(daisTrim, dais);

    // Faisceau laser cylindrique 3D traversant toute l'arène sur l'axe Z
    const laserGroup = new THREE.Group();
    laserGroup.position.set(cx, 0.45, cz);
    laserGroup.visible = false;

    const laserCoreMat = new THREE.MeshStandardMaterial({
      color: 0xfca5a5,
      emissive: 0xef4444,
      emissiveIntensity: 1.4,
      roughness: 0.1,
    });
    const coreBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, w3d + 0.8, 14),
      laserCoreMat
    );
    coreBeam.rotation.z = Math.PI / 2;

    const outerBeamMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const outerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, w3d + 0.8, 16),
      outerBeamMat
    );
    outerBeam.rotation.z = Math.PI / 2;

    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 });
    const emitterMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    for (const px of [-w3d * 0.5 - 0.2, w3d * 0.5 + 0.2]) {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 12), pylonMat);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), emitterMat);
      pylon.position.set(px, -0.05, 0);
      bulb.position.set(px, 0.12, 0);
      laserGroup.add(pylon, bulb);
    }

    laserGroup.add(outerBeam, coreBeam);
    root.add(laserGroup);

    animRefs.laserGroup = laserGroup;
    animRefs.laserOuterBeam = outerBeam;
    animRefs.laserCoreMat = laserCoreMat;
  }
}

function createEnergyCrate3D(cx: number, cz: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.82, 0.82),
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.55 })
  );
  box.position.y = 0.41;
  box.castShadow = true;

  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.2, 0.86),
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.55,
      roughness: 0.3,
    })
  );
  band.position.y = 0.45;

  const topCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18, 0),
    new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      emissive: 0x22c55e,
      emissiveIntensity: 0.8,
    })
  );
  topCrystal.position.y = 0.94;

  group.add(box, band, topCrystal);
  return group;
}

function buildObstacles3D(
  root: THREE.Group,
  theme: IModeTheme,
  modeId: GameModeId,
  obstacles: IRenderObstacle[],
  worldScale3d: number,
  animRefs: IArenaAnimRefs
): void {
  let hasGoal = false;

  for (const obs of obstacles) {
    const ow = Math.max(0.4, obs.width * worldScale3d);
    const od = Math.max(0.4, obs.height * worldScale3d);
    const ox = obs.x * worldScale3d + ow * 0.5;
    const oz = obs.y * worldScale3d + od * 0.5;

    if (obs.kind === 'goal_left' || obs.kind === 'goal_right') {
      hasGoal = true;
      const teamColor = obs.kind === 'goal_left' ? 0x3b82f6 : 0xeab308;
      root.add(createSoccerGoal3D(ox, oz, ow, od, teamColor));
    } else if (obs.kind === 'safe_zone') {
      const { padGroup, holoRing } = createHoloSafeZone3D(ox, oz, ow, od);
      root.add(padGroup);
      animRefs.holoRings.push(holoRing);
    } else if (obs.kind === 'desk') {
      root.add(createSchoolDesk3D(ox, oz, ow, od));
    } else if (obs.kind === 'bush') {
      const bush = createFoliageBush3D(ox, oz, ow, od);
      root.add(bush);
      animRefs.bushes.push(bush);
    } else {
      root.add(createSchoolWall3D(ox, oz, ow, od, theme.wallBodyColor));
    }
  }

  // Fallback si le mode foot est construit sans obstacles goal explicites
  if (modeId === 'MATCH_DES_ACCORDS' && !hasGoal) {
    root.add(createSoccerGoal3D(6.5, 1.4, 3.6, 1.4, 0x3b82f6));
    root.add(createSoccerGoal3D(17.5, 1.4, 3.6, 1.4, 0xeab308));
  }
}

function createSoccerGoal3D(
  ox: number,
  oz: number,
  ow: number,
  od: number,
  teamColor: number
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(ox, 0, oz);

  // Tapis lumineux de zone de but
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(ow, 0.05, od),
    new THREE.MeshStandardMaterial({
      color: teamColor,
      emissive: teamColor,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.45,
    })
  );
  pad.position.y = 0.025;
  group.add(pad);

  // Cage blanche 3D ouverte vers le sud (+Z)
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 });
  const teamBarMat = new THREE.MeshStandardMaterial({
    color: teamColor,
    emissive: teamColor,
    emissiveIntensity: 0.35,
  });

  const goalW = ow * 0.9;
  const goalD = Math.min(od * 0.78, 1.15);
  const goalH = 1.28;
  const frontZ = od * 0.34;
  const backZ = frontZ - goalD;
  const postR = 0.075;

  // Poteaux avant & barre transversale
  for (const px of [-goalW * 0.5, goalW * 0.5]) {
    const frontPost = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, goalH, 10), postMat);
    frontPost.position.set(px, goalH * 0.5, frontZ);
    frontPost.castShadow = true;

    const backBasePost = new THREE.Mesh(
      new THREE.CylinderGeometry(postR * 0.8, postR * 0.8, goalD, 8),
      postMat
    );
    backBasePost.rotation.x = Math.PI / 2;
    backBasePost.position.set(px, postR, (frontZ + backZ) * 0.5);

    const rearStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(postR * 0.75, postR * 0.75, Math.hypot(goalH, goalD), 8),
      postMat
    );
    rearStrut.position.set(px, goalH * 0.5, (frontZ + backZ) * 0.5);
    rearStrut.rotation.x = Math.atan2(goalD, goalH);

    group.add(frontPost, backBasePost, rearStrut);
  }

  const crossbar = new THREE.Mesh(
    new THREE.CylinderGeometry(postR, postR, goalW + postR * 2, 10),
    postMat
  );
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, goalH, frontZ);
  crossbar.castShadow = true;

  const teamBanner = new THREE.Mesh(new THREE.BoxGeometry(goalW * 0.88, 0.14, 0.08), teamBarMat);
  teamBanner.position.set(0, goalH + 0.11, frontZ);

  // Filet semi-transparent
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
  });
  const backNet = new THREE.Mesh(
    new THREE.PlaneGeometry(goalW, Math.hypot(goalH, goalD)),
    netMat
  );
  backNet.position.set(0, goalH * 0.5, (frontZ + backZ) * 0.5);
  backNet.rotation.x = -Math.atan2(goalD, goalH);

  group.add(crossbar, teamBanner, backNet);
  return group;
}

function createHoloSafeZone3D(
  ox: number,
  oz: number,
  ow: number,
  od: number
): { padGroup: THREE.Group; holoRing: THREE.Mesh } {
  const padGroup = new THREE.Group();
  padGroup.position.set(ox, 0, oz);

  const radius = Math.min(ow, od) * 0.44;
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(ow, 0.06, od),
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.45,
    })
  );
  pad.position.y = 0.03;

  const holoRing = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(0.45, radius), 0.065, 10, 28),
    new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.82,
    })
  );
  holoRing.rotation.x = Math.PI / 2;
  holoRing.position.y = 0.18;

  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
  const tipMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  for (const bx of [-ow * 0.44, ow * 0.44]) {
    for (const bz of [-od * 0.44, od * 0.44]) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.32, 8), bollardMat);
      bollard.position.set(bx, 0.16, bz);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), tipMat);
      tip.position.set(bx, 0.34, bz);
      padGroup.add(bollard, tip);
    }
  }

  padGroup.add(pad, holoRing);
  return { padGroup, holoRing };
}

function createSchoolDesk3D(ox: number, oz: number, ow: number, od: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(ox, 0, oz);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.55 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.65 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.4 });

  const tableY = 0.62;
  const tabletop = new THREE.Mesh(new THREE.BoxGeometry(ow, 0.12, od), woodMat);
  tabletop.position.y = tableY;
  tabletop.castShadow = true;
  tabletop.receiveShadow = true;

  const apron = new THREE.Mesh(new THREE.BoxGeometry(ow * 0.88, 0.1, od * 0.85), trimMat);
  apron.position.y = tableY - 0.1;

  const legX = Math.max(0.14, ow * 0.4);
  const legZ = Math.max(0.14, od * 0.38);
  for (const lx of [-legX, legX]) {
    for (const lz of [-legZ, legZ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, tableY - 0.04, 8), legMat);
      leg.position.set(lx, (tableY - 0.04) * 0.5, lz);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  // Petit cahier + crayon sur le bureau d'écolier
  if (ow >= 0.7 && od >= 0.5) {
    const notebook = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(0.45, ow * 0.36), 0.045, Math.min(0.32, od * 0.36)),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 })
    );
    notebook.position.set(-ow * 0.14, tableY + 0.08, 0.02);
    notebook.rotation.y = 0.18;
    group.add(notebook);

    const pencil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 })
    );
    pencil.rotation.z = Math.PI / 2;
    pencil.rotation.y = -0.3;
    pencil.position.set(ow * 0.18, tableY + 0.08, 0.05);
    group.add(pencil);
  }

  group.add(apron, tabletop);
  return group;
}

function createFoliageBush3D(ox: number, oz: number, ow: number, od: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(ox, 0, oz);

  const rx = Math.max(0.35, ow * 0.45);
  const rz = Math.max(0.35, od * 0.45);
  const baseRadius = Math.min(rx, rz);

  const darkGreen = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.75,
    flatShading: true,
  });
  const brightGreen = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    roughness: 0.65,
    flatShading: true,
  });

  const offsets: Array<[number, number, number, number, boolean]> = [
    [0, baseRadius * 0.72, 0, baseRadius * 0.92, true],
    [-rx * 0.42, baseRadius * 0.48, rz * 0.18, baseRadius * 0.68, false],
    [rx * 0.42, baseRadius * 0.48, -rz * 0.18, baseRadius * 0.68, false],
    [0, baseRadius * 0.5, rz * 0.36, baseRadius * 0.6, true],
  ];

  for (const [px, py, pz, r, isBright] of offsets) {
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(Math.max(0.24, r), 1),
      isBright ? brightGreen : darkGreen
    );
    puff.position.set(px, py, pz);
    puff.castShadow = true;
    puff.receiveShadow = true;
    group.add(puff);
  }

  // Petites fleurs / baies colorées
  const flowerMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const berry = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), flowerMat);
  berry.position.set(rx * 0.15, baseRadius * 1.15, rz * 0.25);
  group.add(berry);

  return group;
}

function createSchoolWall3D(
  ox: number,
  oz: number,
  ow: number,
  od: number,
  wallBodyColor: number
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(ox, 0, oz);

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(ow + 0.04, 0.18, od + 0.04),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
  );
  plinth.position.y = 0.09;
  plinth.castShadow = true;
  plinth.receiveShadow = true;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(ow, 0.86, od),
    new THREE.MeshStandardMaterial({ color: wallBodyColor, roughness: 0.6 })
  );
  body.position.y = 0.61;
  body.castShadow = true;
  body.receiveShadow = true;

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(ow + 0.08, 0.12, od + 0.08),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
  );
  cap.position.y = 1.1;
  cap.castShadow = true;

  group.add(plinth, body, cap);
  return group;
}
