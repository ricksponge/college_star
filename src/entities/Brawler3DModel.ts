import * as THREE from 'three';
import type { BrawlerId } from '../types/cctp';

export interface IBrawler3DRig {
  brawlerId: BrawlerId;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  weaponMesh: THREE.Object3D;
  superRing: THREE.Mesh;
  shieldSphere: THREE.Mesh;
}

export interface IBrawler3DAnimationParams {
  timeSec: number;
  isMoving: boolean;
  aimAngle: number;
  superReady: boolean;
  hasShield: boolean;
  isErrorShield: boolean;
}

function toonMat(color: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.12,
    emissive,
    emissiveIntensity,
  });
}

function addChibiFace(headGroup: THREE.Group, skinColor: number): void {
  // Tête chibi arrondie
  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 20, 16),
    toonMat(skinColor)
  );
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Yeux expressifs
  const eyeWhiteMat = toonMat(0xffffff);
  const pupilMat = toonMat(0x0f172a);
  for (const side of [-1, 1]) {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), eyeWhiteMat);
    eyeWhite.position.set(side * 0.16, 0.03, 0.4);
    eyeWhite.scale.set(1, 1.15, 0.5);
    headGroup.add(eyeWhite);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), pupilMat);
    pupil.position.set(side * 0.16, 0.03, 0.44);
    pupil.scale.set(1, 1.1, 0.5);
    headGroup.add(pupil);

    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeWhiteMat);
    glint.position.set(side * 0.18, 0.06, 0.47);
    headGroup.add(glint);
  }

  // Sourire stylisé
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.08, 0.018, 8, 16, Math.PI),
    toonMat(0x7c2d12)
  );
  smile.position.set(0, -0.1, 0.43);
  smile.rotation.z = Math.PI;
  headGroup.add(smile);
}

function addBaseChibiLimbs(
  bodyGroup: THREE.Group,
  torsoColor: number,
  sleeveColor: number,
  pantsColor: number,
  shoeColor: number,
  skinColor: number
): {
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
} {
  // Torse
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.34, 0.56, 16),
    toonMat(torsoColor)
  );
  torso.position.y = 0.72;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Tête
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.38;
  addChibiFace(headGroup, skinColor);
  bodyGroup.add(headGroup);

  // Bras gauche & droit (pivot épaule à y = 0.92)
  const buildArm = (side: -1 | 1): THREE.Group => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.4, 0.92, 0);

    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.24, 6, 10),
      toonMat(sleeveColor)
    );
    sleeve.position.y = -0.14;
    sleeve.castShadow = true;
    armPivot.add(sleeve);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), toonMat(skinColor));
    hand.position.y = -0.32;
    armPivot.add(hand);

    bodyGroup.add(armPivot);
    return armPivot;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Jambes gauche & droite (pivot hanche à y = 0.44)
  const buildLeg = (side: -1 | 1): THREE.Group => {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.16, 0.44, 0);

    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.2, 6, 10),
      toonMat(pantsColor)
    );
    leg.position.y = -0.14;
    leg.castShadow = true;
    legPivot.add(leg);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.32), toonMat(shoeColor));
    shoe.position.set(0, -0.34, 0.05);
    shoe.castShadow = true;
    legPivot.add(shoe);

    bodyGroup.add(legPivot);
    return legPivot;
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  return { headGroup, leftArm, rightArm, leftLeg, rightLeg };
}

function decorateTimo(
  bodyGroup: THREE.Group,
  headGroup: THREE.Group,
  rightArm: THREE.Group
): THREE.Object3D {
  // Bande bleue sur le maillot jaune fluo
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.14, 0.62),
    toonMat(0x2563eb)
  );
  stripe.position.set(0, 0.72, 0);
  bodyGroup.add(stripe);

  // Cheveux blonds ondulés (mèches chibi)
  const hairMat = toonMat(0xfacc15, 0xf59e0b, 0.15);
  const hairBase = new THREE.Mesh(
    new THREE.SphereGeometry(0.47, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat
  );
  hairBase.position.y = 0.04;
  headGroup.add(hairBase);

  const tuftOffsets: Array<[number, number, number, number]> = [
    [-0.2, 0.45, 0.16, 0.15],
    [0.0, 0.5, 0.2, 0.18],
    [0.22, 0.44, 0.14, 0.15],
    [-0.1, 0.42, -0.22, 0.16],
    [0.14, 0.4, -0.22, 0.16],
  ];
  for (const [hx, hy, hz, r] of tuftOffsets) {
    const tuft = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), hairMat);
    tuft.position.set(hx, hy, hz);
    headGroup.add(tuft);
  }

  // Ballon d'énergie Frappe Brossée
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.22, 1),
    toonMat(0xfef08a, 0xfacc15, 0.45)
  );
  ball.position.set(0, -0.45, 0.25);
  rightArm.add(ball);
  return ball;
}

function decorateLeo(
  bodyGroup: THREE.Group,
  headGroup: THREE.Group,
  rightArm: THREE.Group
): THREE.Object3D {
  // Capuche relevée bleu nuit
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.51, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.65),
    toonMat(0x312e81)
  );
  hood.rotation.x = -0.35;
  hood.position.set(0, 0.05, -0.08);
  headGroup.add(hood);

  // Cheveux bruns sous la capuche
  const fringe = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.14, 0.22),
    toonMat(0x451a03)
  );
  fringe.position.set(0, 0.24, 0.34);
  headGroup.add(fringe);

  // Lunettes rondes dorées
  const frameMat = toonMat(0xfbbf24, 0xf59e0b, 0.2);
  for (const side of [-1, 1]) {
    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 18), frameMat);
    lensRing.position.set(side * 0.16, 0.03, 0.45);
    headGroup.add(lensRing);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), frameMat);
  bridge.position.set(0, 0.04, 0.45);
  headGroup.add(bridge);

  // Sacoche de grimoires lumineux sur la hanche
  const satchel = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.32, 0.34),
    toonMat(0x78350f, 0xa855f7, 0.15)
  );
  satchel.position.set(-0.36, 0.55, 0);
  bodyGroup.add(satchel);

  // Fiole d'encre violette dans la main droite
  const flaskGroup = new THREE.Group();
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 12),
    toonMat(0xa855f7, 0x9333ea, 0.55)
  );
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, 0.14, 10),
    toonMat(0xe9d5ff)
  );
  neck.position.y = 0.14;
  flaskGroup.add(bulb, neck);
  flaskGroup.position.set(0, -0.36, 0.18);
  rightArm.add(flaskGroup);
  return flaskGroup;
}

function decorateMaya(
  bodyGroup: THREE.Group,
  headGroup: THREE.Group,
  leftArm: THREE.Group,
  rightArm: THREE.Group
): THREE.Object3D {
  // Chapeau d'exploratrice kaki
  const hatBrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.65, 0.06, 20),
    toonMat(0x65a30d)
  );
  hatBrim.position.y = 0.35;
  headGroup.add(hatBrim);

  const hatCrown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.44, 0.28, 16),
    toonMat(0x4d7c0f)
  );
  hatCrown.position.y = 0.48;
  headGroup.add(hatCrown);

  // Sac à dos d'expédition
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.24), toonMat(0x713f12));
  pack.position.set(0, 0.76, -0.36);
  bodyGroup.add(pack);

  // Grande Boussole-Bouclier au bras gauche
  const shieldGroup = new THREE.Group();
  const shieldRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.08, 20),
    toonMat(0xf59e0b, 0xd97706, 0.2)
  );
  shieldRim.rotation.z = Math.PI / 2;
  const shieldCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.1, 16),
    toonMat(0x38bdf8, 0x0284c7, 0.4)
  );
  shieldCore.rotation.z = Math.PI / 2;
  shieldGroup.add(shieldRim, shieldCore);
  shieldGroup.position.set(-0.18, -0.18, 0.1);
  leftArm.add(shieldGroup);

  // Marteau/Sceptre sismique léger main droite
  const staff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8),
    toonMat(0xfbbf24)
  );
  staff.position.set(0, -0.34, 0.16);
  staff.rotation.x = Math.PI / 2;
  rightArm.add(staff);

  return shieldGroup;
}

function decorateZack(
  bodyGroup: THREE.Group,
  headGroup: THREE.Group,
  leftLeg: THREE.Group,
  rightLeg: THREE.Group,
  rightArm: THREE.Group
): THREE.Object3D {
  // Col veste teddy
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.06, 8, 16),
    toonMat(0xf8fafc)
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.98;
  bodyGroup.add(collar);

  // Cheveux noirs stylés
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.47, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    toonMat(0x0f172a)
  );
  hair.position.y = 0.06;
  headGroup.add(hair);

  // Casque audio néon cyan
  const neonMat = toonMat(0x22d3ee, 0x06b6d4, 0.55);
  const headband = new THREE.Mesh(
    new THREE.TorusGeometry(0.49, 0.045, 10, 22, Math.PI),
    neonMat
  );
  headband.position.y = 0.05;
  headGroup.add(headband);

  for (const side of [-1, 1]) {
    const earcup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.1, 14),
      neonMat
    );
    earcup.rotation.z = Math.PI / 2;
    earcup.position.set(side * 0.48, 0.04, 0);
    headGroup.add(earcup);
  }

  // Rollers magnétiques néon aux pieds
  for (const leg of [leftLeg, rightLeg]) {
    for (const wz of [-0.08, 0.12]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 0.26, 12),
        neonMat
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, -0.43, wz);
      leg.add(wheel);
    }
  }

  // Blaster Double Beat
  const blaster = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.16, 0.34),
    toonMat(0xec4899, 0x22d3ee, 0.3)
  );
  blaster.position.set(0, -0.32, 0.22);
  rightArm.add(blaster);
  return blaster;
}

/**
 * Construit le modèle 3D Chibi articulé complet de l'élève-héros demandé.
 */
export function createBrawler3DModel(brawlerId: BrawlerId): IBrawler3DRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const skinColor = 0xfed7aa;
  let limbs: ReturnType<typeof addBaseChibiLimbs>;
  let weaponMesh: THREE.Object3D;

  switch (brawlerId) {
    case 'TIMO':
      limbs = addBaseChibiLimbs(bodyGroup, 0xfacc15, 0xfde047, 0x1d4ed8, 0xfacc15, skinColor);
      weaponMesh = decorateTimo(bodyGroup, limbs.headGroup, limbs.rightArm);
      break;
    case 'LEO':
      limbs = addBaseChibiLimbs(bodyGroup, 0x312e81, 0x3730a3, 0x1e1b4b, 0xa855f7, skinColor);
      weaponMesh = decorateLeo(bodyGroup, limbs.headGroup, limbs.rightArm);
      break;
    case 'MAYA':
      limbs = addBaseChibiLimbs(bodyGroup, 0x4d7c0f, 0x65a30d, 0x3f6212, 0x78350f, skinColor);
      weaponMesh = decorateMaya(bodyGroup, limbs.headGroup, limbs.leftArm, limbs.rightArm);
      break;
    case 'ZACK':
      limbs = addBaseChibiLimbs(bodyGroup, 0x06b6d4, 0xec4899, 0x0f172a, 0x22d3ee, skinColor);
      weaponMesh = decorateZack(
        bodyGroup,
        limbs.headGroup,
        limbs.leftLeg,
        limbs.rightLeg,
        limbs.rightArm
      );
      break;
  }

  // Anneau Super au sol (visible quand Super = 100%)
  const superRing = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.78, 28),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
  );
  superRing.rotation.x = -Math.PI / 2;
  superRing.position.y = 0.04;
  superRing.visible = false;
  root.add(superRing);

  // Bulle de bouclier translucide
  const shieldSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.95, 18, 14),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.25,
      wireframe: false,
    })
  );
  shieldSphere.position.y = 0.95;
  shieldSphere.visible = false;
  root.add(shieldSphere);

  return {
    brawlerId,
    root,
    bodyGroup,
    headGroup: limbs.headGroup,
    leftArm: limbs.leftArm,
    rightArm: limbs.rightArm,
    leftLeg: limbs.leftLeg,
    rightLeg: limbs.rightLeg,
    weaponMesh,
    superRing,
    shieldSphere,
  };
}

/**
 * Anime le modèle 3D Chibi (marche, visée, respiration, halo Super, bouclier).
 */
export function animateBrawler3DRig(
  rig: IBrawler3DRig,
  params: IBrawler3DAnimationParams
): void {
  const { timeSec, isMoving, aimAngle, superReady, hasShield, isErrorShield } = params;

  // Orientation 3D (+Z local aligné vers aimAngle dans le plan X-Z)
  rig.bodyGroup.rotation.y = Math.PI / 2 - aimAngle;

  if (isMoving) {
    const stride = Math.sin(timeSec * 12) * 0.65;
    rig.leftLeg.rotation.x = stride;
    rig.rightLeg.rotation.x = -stride;
    rig.leftArm.rotation.x = -stride * 0.7;
    rig.rightArm.rotation.x = stride * 0.5 - 0.35;
    rig.bodyGroup.position.y = Math.abs(Math.sin(timeSec * 12)) * 0.08;
  } else {
    const idleBob = Math.sin(timeSec * 3) * 0.04;
    rig.leftLeg.rotation.x *= 0.85;
    rig.rightLeg.rotation.x *= 0.85;
    rig.leftArm.rotation.x = Math.sin(timeSec * 2.5) * 0.08;
    rig.rightArm.rotation.x = -0.35 + Math.cos(timeSec * 2.5) * 0.08;
    rig.bodyGroup.position.y = idleBob;
  }

  rig.superRing.visible = superReady;
  if (superReady) {
    rig.superRing.rotation.z = timeSec * 2.4;
    const pulse = 1 + Math.sin(timeSec * 6) * 0.08;
    rig.superRing.scale.set(pulse, pulse, 1);
  }

  rig.shieldSphere.visible = hasShield;
  if (hasShield) {
    const mat = rig.shieldSphere.material as THREE.MeshBasicMaterial;
    mat.color.setHex(isErrorShield ? 0xf87171 : 0x38bdf8);
  }
}

/**
 * Construit les modèles 3D des cibles pédagogiques (Drone scolaire, Cristal bleu, Boss Conseil de Classe).
 */
export function createTarget3DModel(kind: 'drone' | 'crystal' | 'boss'): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'crystal') {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      toonMat(0x38bdf8, 0x0284c7, 0.5)
    );
    crystal.position.y = 0.85;
    crystal.castShadow = true;
    group.add(crystal);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.04, 8, 24),
      toonMat(0xfacc15, 0xf59e0b, 0.35)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.85;
    group.add(ring);
    return group;
  }

  if (kind === 'boss') {
    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.95, 0),
      toonMat(0xdc2626, 0x991b1b, 0.4)
    );
    core.position.y = 1.15;
    core.castShadow = true;
    group.add(core);

    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.72, 0.35, 6),
      toonMat(0xfacc15, 0xd97706, 0.3)
    );
    crown.position.y = 2.05;
    group.add(crown);

    const auraRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.06, 8, 28),
      toonMat(0xf87171, 0xef4444, 0.5)
    );
    auraRing.rotation.x = Math.PI / 2;
    auraRing.position.y = 1.15;
    group.add(auraRing);
    return group;
  }

  // Drone scolaire quadricoptère
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.44, 16, 12),
    toonMat(0xf97316, 0xea580c, 0.25)
  );
  body.scale.set(1.15, 0.72, 1.15);
  body.position.y = 0.85;
  body.castShadow = true;
  group.add(body);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.16, 0.12),
    toonMat(0x0f172a, 0x38bdf8, 0.35)
  );
  visor.position.set(0, 0.88, 0.44);
  group.add(visor);

  const rotorMat = toonMat(0x94a3b8);
  const propMat = toonMat(0x38bdf8, 0x0284c7, 0.25);
  const corners: Array<[number, number]> = [
    [-0.48, -0.48],
    [0.48, -0.48],
    [-0.48, 0.48],
    [0.48, 0.48],
  ];
  for (const [cx, cz] of corners) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), rotorMat);
    pod.position.set(cx, 0.95, cz);
    group.add(pod);

    const rotorRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), propMat);
    rotorRing.rotation.x = Math.PI / 2;
    rotorRing.position.set(cx, 0.99, cz);
    group.add(rotorRing);
  }

  return group;
}

/**
 * Libère proprement les géométries et matériaux d'un arbre Three.js.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        for (const mat of obj.material) {
          mat.dispose();
        }
      } else {
        obj.material.dispose();
      }
    }
  });
}
