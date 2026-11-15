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

interface IRigAnimationExtras {
  weaponBasePos?: THREE.Vector3;
  skateWheels?: THREE.Object3D[];
  clockHourHand?: THREE.Object3D;
  clockMinuteHand?: THREE.Object3D;
  inkSwirlRing?: THREE.Object3D;
  ballOrbitRing?: THREE.Object3D;
}

interface IChibiFaceOptions {
  skinColor: number;
  eyeColor: number;
  browColor: number;
  browTilt?: number;
  cheekColor?: number;
  includeEars?: boolean;
}

let cachedToonGradient: THREE.DataTexture | null = null;

function getToonGradientMap(): THREE.DataTexture {
  if (cachedToonGradient) {
    return cachedToonGradient;
  }
  // 4-step Brawl-Stars style cel-shading ramp: shadow -> mid -> base -> rim pop
  const ramp = new Uint8Array([
    118, 118, 118, 255,
    182, 182, 182, 255,
    235, 235, 235, 255,
    255, 255, 255, 255,
  ]);
  const texture = new THREE.DataTexture(ramp, 4, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  cachedToonGradient = texture;
  return texture;
}

function toonMat(color: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    emissive,
    emissiveIntensity,
    gradientMap: getToonGradientMap(),
  });
}

function metalMat(
  color: number,
  emissive = 0x000000,
  emissiveIntensity = 0,
  roughness = 0.24,
  metalness = 0.72
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

function glassMat(
  color: number,
  opacity = 0.38,
  emissive = 0x000000,
  emissiveIntensity = 0.18
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.12,
    metalness: 0.15,
    transparent: true,
    opacity,
    emissive,
    emissiveIntensity,
    depthWrite: false,
  });
}

function attachOutline(
  parent: THREE.Object3D,
  sourceMesh: THREE.Mesh,
  scaleX = 1.075,
  scaleY = 1.075,
  scaleZ = 1.075,
  inkColor = 0x0f172a
): THREE.Mesh {
  const outline = new THREE.Mesh(
    sourceMesh.geometry,
    new THREE.MeshBasicMaterial({
      color: inkColor,
      side: THREE.BackSide,
    })
  );
  outline.position.copy(sourceMesh.position);
  outline.rotation.copy(sourceMesh.rotation);
  outline.scale.set(
    sourceMesh.scale.x * scaleX,
    sourceMesh.scale.y * scaleY,
    sourceMesh.scale.z * scaleZ
  );
  outline.castShadow = false;
  outline.receiveShadow = false;
  parent.add(outline);
  return outline;
}

function addChibiFace(headGroup: THREE.Group, options: IChibiFaceOptions): void {
  const {
    skinColor,
    eyeColor,
    browColor,
    browTilt = 0.2,
    cheekColor = 0xfb7185,
    includeEars = true,
  } = options;

  // Tête chibi arrondie avec silhouette toon encrée
  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 26, 20),
    toonMat(skinColor)
  );
  headMesh.castShadow = true;
  headGroup.add(headMesh);
  attachOutline(headGroup, headMesh, 1.072, 1.072, 1.072);

  // Oreilles stylisées
  if (includeEars) {
    for (const side of [-1, 1] as const) {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 10, 10),
        toonMat(skinColor)
      );
      ear.scale.set(0.58, 1.0, 0.82);
      ear.position.set(side * 0.445, -0.02, -0.02);
      headGroup.add(ear);
      attachOutline(headGroup, ear, 1.15, 1.12, 1.12);
    }
  }

  // Yeux Brawl Stars expressifs (blanc + iris coloré + pupille + double reflet + cil supérieur)
  const eyeWhiteMat = toonMat(0xffffff, 0xffffff, 0.08);
  const irisMat = toonMat(eyeColor, eyeColor, 0.18);
  const pupilMat = toonMat(0x0f172a);
  const lashMat = toonMat(0x0f172a);
  const browMat = toonMat(browColor);

  for (const side of [-1, 1] as const) {
    const eyeCluster = new THREE.Group();
    eyeCluster.position.set(side * 0.165, 0.02, 0.422);
    eyeCluster.rotation.y = side * 0.34;
    headGroup.add(eyeCluster);

    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), eyeWhiteMat);
    eyeWhite.scale.set(1.0, 1.18, 0.36);
    eyeCluster.add(eyeWhite);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 10), irisMat);
    iris.scale.set(1.0, 1.15, 0.34);
    iris.position.set(-side * 0.008, -0.006, 0.022);
    eyeCluster.add(iris);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), pupilMat);
    pupil.scale.set(1.0, 1.12, 0.32);
    pupil.position.set(-side * 0.008, -0.006, 0.032);
    eyeCluster.add(pupil);

    const glintMain = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeWhiteMat);
    glintMain.position.set(0.024, 0.032, 0.042);
    eyeCluster.add(glintMain);

    const glintTiny = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), eyeWhiteMat);
    glintTiny.position.set(-0.022, -0.024, 0.04);
    eyeCluster.add(glintTiny);

    // Arc supérieur façon trait d'encre
    const upperLash = new THREE.Mesh(
      new THREE.TorusGeometry(0.102, 0.016, 8, 16, Math.PI * 0.84),
      lashMat
    );
    upperLash.position.set(0, 0.014, 0.014);
    upperLash.rotation.z = Math.PI * 0.08;
    upperLash.scale.set(1.0, 1.14, 0.55);
    eyeCluster.add(upperLash);

    // Sourcils sculptés confiants
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.11, 6, 8), browMat);
    brow.position.set(side * 0.165, 0.17, 0.408);
    brow.rotation.y = side * 0.34;
    brow.rotation.z = Math.PI / 2 + side * browTilt;
    headGroup.add(brow);
  }

  // Petit nez chibi sculpté
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 10, 8),
    toonMat(0xfdba74)
  );
  nose.scale.set(1.15, 0.82, 0.72);
  nose.position.set(0, -0.045, 0.464);
  headGroup.add(nose);

  // Joues rosées chaleureuses
  const blushMat = toonMat(cheekColor, cheekColor, 0.12);
  for (const side of [-1, 1] as const) {
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.064, 10, 8), blushMat);
    blush.scale.set(1.25, 0.72, 0.34);
    blush.position.set(side * 0.255, -0.075, 0.376);
    blush.rotation.y = side * 0.56;
    headGroup.add(blush);
  }

  // Sourire assuré (bouche ouverte stylisée + dents)
  const smileRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.076, 0.016, 8, 16, Math.PI),
    toonMat(0x7c2d12)
  );
  smileRim.position.set(0, -0.125, 0.436);
  smileRim.rotation.z = Math.PI;
  smileRim.rotation.x = 0.24;
  headGroup.add(smileRim);

  const teeth = new THREE.Mesh(
    new THREE.BoxGeometry(0.095, 0.022, 0.022),
    eyeWhiteMat
  );
  teeth.position.set(0, -0.135, 0.438);
  teeth.rotation.x = 0.22;
  headGroup.add(teeth);
}

interface IChibiLimbStyle {
  torsoColor: number;
  sleeveColor: number;
  cuffColor: number;
  pantsColor: number;
  beltColor: number;
  shoeColor: number;
  soleColor: number;
  skinColor: number;
  legPivotY?: number;
}

function addBaseChibiLimbs(
  bodyGroup: THREE.Group,
  style: IChibiLimbStyle,
  faceOptions: IChibiFaceOptions
): {
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
} {
  const {
    torsoColor,
    sleeveColor,
    cuffColor,
    pantsColor,
    beltColor,
    shoeColor,
    soleColor,
    skinColor,
    legPivotY = 0.44,
  } = style;

  // Bassin / Short
  const pelvis = new THREE.Mesh(
    new THREE.CylinderGeometry(0.285, 0.305, 0.22, 18),
    toonMat(pantsColor)
  );
  pelvis.position.y = 0.52;
  pelvis.castShadow = true;
  bodyGroup.add(pelvis);
  attachOutline(bodyGroup, pelvis, 1.08, 1.06, 1.08);

  // Ceinture + boucle métallique
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.302, 0.302, 0.075, 18),
    toonMat(beltColor)
  );
  belt.position.y = 0.625;
  bodyGroup.add(belt);

  const buckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.085, 0.05),
    metalMat(0xfbbf24)
  );
  buckle.position.set(0, 0.625, 0.295);
  bodyGroup.add(buckle);

  // Torse sculpté (légèrement évasé vers les épaules)
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.285, 0.4, 20),
    toonMat(torsoColor)
  );
  torso.position.y = 0.82;
  torso.castShadow = true;
  bodyGroup.add(torso);
  attachOutline(bodyGroup, torso, 1.08, 1.04, 1.08);

  // Cou stylisé
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.145, 0.14, 14),
    toonMat(skinColor)
  );
  neck.position.y = 1.04;
  bodyGroup.add(neck);

  // Tête
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.38;
  addChibiFace(headGroup, faceOptions);
  bodyGroup.add(headGroup);

  // Bras gauche & droit (pivot épaule à y = 0.94)
  const buildArm = (side: -1 | 1): THREE.Group => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.405, 0.94, 0);

    const shoulderCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 12, 10),
      toonMat(sleeveColor)
    );
    shoulderCap.castShadow = true;
    armPivot.add(shoulderCap);
    attachOutline(armPivot, shoulderCap, 1.12, 1.12, 1.12);

    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.1, 0.2, 6, 12),
      toonMat(sleeveColor)
    );
    sleeve.position.y = -0.15;
    sleeve.castShadow = true;
    armPivot.add(sleeve);
    attachOutline(armPivot, sleeve, 1.12, 1.08, 1.12);

    const cuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.108, 0.108, 0.055, 12),
      toonMat(cuffColor)
    );
    cuff.position.y = -0.255;
    armPivot.add(cuff);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 10), toonMat(skinColor));
    hand.position.y = -0.345;
    armPivot.add(hand);
    attachOutline(armPivot, hand, 1.12, 1.12, 1.12);

    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), toonMat(skinColor));
    thumb.position.set(-side * 0.075, -0.325, 0.068);
    armPivot.add(thumb);

    bodyGroup.add(armPivot);
    return armPivot;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Jambes gauche & droite
  const buildLeg = (side: -1 | 1): THREE.Group => {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.165, legPivotY, 0);

    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.105, 0.16, 6, 12),
      toonMat(pantsColor)
    );
    leg.position.y = -0.135;
    leg.castShadow = true;
    legPivot.add(leg);
    attachOutline(legPivot, leg, 1.12, 1.08, 1.12);

    // Chaussure chibi volumineuse
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(0, -0.33, 0.03);
    legPivot.add(shoeGroup);

    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(0.225, 0.125, 0.3),
      toonMat(shoeColor)
    );
    upper.castShadow = true;
    shoeGroup.add(upper);
    attachOutline(shoeGroup, upper, 1.1, 1.12, 1.08);

    const toeCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 12, 10),
      toonMat(shoeColor)
    );
    toeCap.scale.set(0.98, 0.56, 0.9);
    toeCap.position.set(0, -0.008, 0.14);
    shoeGroup.add(toeCap);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.245, 0.052, 0.34),
      toonMat(soleColor)
    );
    sole.position.set(0, -0.075, 0.02);
    sole.castShadow = true;
    shoeGroup.add(sole);

    const tongue = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.06, 0.09),
      toonMat(soleColor)
    );
    tongue.position.set(0, 0.07, 0.06);
    tongue.rotation.x = -0.35;
    shoeGroup.add(tongue);

    bodyGroup.add(legPivot);
    return legPivot;
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  return { headGroup, leftArm, rightArm, leftLeg, rightLeg };
}

function addJerseyNumberTen(parent: THREE.Object3D, zOffset: number, facingSign: 1 | -1): void {
  const numGroup = new THREE.Group();
  numGroup.position.set(0, 0.81, zOffset);
  if (facingSign < 0) {
    numGroup.rotation.y = Math.PI;
  }
  const numMat = toonMat(0xf8fafc, 0xf8fafc, 0.08);

  // Chiffre "1"
  const oneBar = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.14, 0.02), numMat);
  oneBar.position.set(-0.065, 0, 0);
  const oneSerif = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.032, 0.02), numMat);
  oneSerif.position.set(-0.08, 0.048, 0);
  oneSerif.rotation.z = 0.45;

  // Chiffre "0"
  const zeroRing = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.018, 6, 14), numMat);
  zeroRing.scale.set(0.78, 1.18, 1);
  zeroRing.position.set(0.052, 0, 0);

  numGroup.add(oneBar, oneSerif, zeroRing);
  parent.add(numGroup);
}

function decorateTimo(
  bodyGroup: THREE.Group,
  headGroup: THREE.Group,
  leftArm: THREE.Group,
  rightArm: THREE.Group,
  leftLeg: THREE.Group,
  rightLeg: THREE.Group,
  extras: IRigAnimationExtras
): THREE.Object3D {
  // Maillot rayé bleu & jaune + col V blanc
  const chestStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.39, 0.652),
    toonMat(0x2563eb)
  );
  chestStripe.position.set(0, 0.82, 0);
  bodyGroup.add(chestStripe);

  const vCollar = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.038, 8, 16),
    toonMat(0xf8fafc)
  );
  vCollar.rotation.x = Math.PI / 2;
  vCollar.position.set(0, 1.0, 0);
  bodyGroup.add(vCollar);

  // Numéro "10" devant et dans le dos
  addJerseyNumberTen(bodyGroup, 0.334, 1);
  addJerseyNumberTen(bodyGroup, -0.334, -1);

  // Brassard de capitaine sur le bras gauche
  const armband = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.115, 0.075, 14),
    toonMat(0xef4444, 0xdc2626, 0.15)
  );
  armband.position.y = -0.14;
  leftArm.add(armband);

  // Chaussettes rayées + crampons de foot sous les chaussures
  const sockStripeMat = toonMat(0xf8fafc);
  const cleatMat = metalMat(0x0f172a, 0x000000, 0, 0.4, 0.4);
  for (const leg of [leftLeg, rightLeg]) {
    const sockBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.112, 0.112, 0.05, 12),
      sockStripeMat
    );
    sockBand.position.y = -0.22;
    leg.add(sockBand);

    for (const [sx, sz] of [
      [-0.07, -0.07],
      [0.07, -0.07],
      [-0.07, 0.14],
      [0.07, 0.14],
    ] as const) {
      const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.035, 6), cleatMat);
      stud.position.set(sx, -0.445, sz);
      leg.add(stud);
    }
  }

  // Crête de cheveux blonds ondulés ultra dynamique
  const hairMat = toonMat(0xfacc15, 0xf59e0b, 0.15);
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.475, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat
  );
  hairCap.position.y = 0.04;
  hairCap.rotation.x = -0.12;
  headGroup.add(hairCap);
  attachOutline(headGroup, hairCap, 1.07, 1.07, 1.07);

  const waveSpecs: Array<{
    pos: [number, number, number];
    rot: [number, number, number];
    scale: [number, number, number];
    r: number;
  }> = [
    { pos: [0, 0.54, 0.16], rot: [-0.42, 0, 0], scale: [1.1, 1.65, 1.1], r: 0.16 },
    { pos: [-0.19, 0.47, 0.18], rot: [-0.35, 0, 0.38], scale: [0.95, 1.45, 0.95], r: 0.14 },
    { pos: [0.19, 0.47, 0.18], rot: [-0.35, 0, -0.38], scale: [0.95, 1.45, 0.95], r: 0.14 },
    { pos: [-0.08, 0.48, -0.15], rot: [-0.75, 0, 0.15], scale: [1.0, 1.5, 1.0], r: 0.15 },
    { pos: [0.1, 0.46, -0.18], rot: [-0.82, 0, -0.18], scale: [1.0, 1.45, 1.0], r: 0.15 },
    { pos: [-0.35, 0.24, 0.12], rot: [0.25, 0, 0.6], scale: [0.75, 1.35, 0.85], r: 0.11 },
    { pos: [0.35, 0.24, 0.12], rot: [0.25, 0, -0.6], scale: [0.75, 1.35, 0.85], r: 0.11 },
  ];
  for (const spec of waveSpecs) {
    const crest = new THREE.Mesh(new THREE.ConeGeometry(spec.r, spec.r * 2.2, 10), hairMat);
    crest.position.set(...spec.pos);
    crest.rotation.set(...spec.rot);
    crest.scale.set(...spec.scale);
    headGroup.add(crest);
    attachOutline(headGroup, crest, 1.12, 1.08, 1.12);
  }

  // Ballon d'énergie facetté « Frappe Brossée » avec anneau orbital
  const ballGroup = new THREE.Group();
  ballGroup.position.set(0.02, -0.44, 0.26);

  const ballCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.18, 0),
    toonMat(0xfef08a, 0xfacc15, 0.65)
  );
  ballGroup.add(ballCore);

  const ballShell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.225, 1),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      wireframe: true,
      roughness: 0.2,
    })
  );
  ballGroup.add(ballShell);

  const orbitRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.022, 8, 24),
    toonMat(0xfef08a, 0xfacc15, 0.75)
  );
  orbitRing.rotation.x = Math.PI / 2.6;
  ballGroup.add(orbitRing);

  rightArm.add(ballGroup);
  extras.weaponBasePos = ballGroup.position.clone();
  extras.ballOrbitRing = orbitRing;
  return ballGroup;
}

function decorateLeo(
  bodyGroup: THREE.Group,
  headGroup: THREE.Group,
  rightArm: THREE.Group,
  extras: IRigAnimationExtras
): THREE.Object3D {
  // Col de sweat épais + cordons de capuche
  const hoodCollar = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.075, 10, 18),
    toonMat(0x4338ca)
  );
  hoodCollar.rotation.x = Math.PI / 2;
  hoodCollar.position.set(0, 1.0, -0.02);
  bodyGroup.add(hoodCollar);
  attachOutline(bodyGroup, hoodCollar, 1.08, 1.08, 1.08);

  const cordMat = toonMat(0xf8fafc);
  const agletMat = metalMat(0xfbbf24);
  for (const side of [-1, 1] as const) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), cordMat);
    cord.position.set(side * 0.085, 0.87, 0.305);
    cord.rotation.z = side * 0.08;
    bodyGroup.add(cord);

    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), agletMat);
    tip.position.set(side * 0.09, 0.76, 0.308);
    bodyGroup.add(tip);
  }

  // Poche kangourou du hoodie
  const pocket = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.14, 0.07),
    toonMat(0x3730a3)
  );
  pocket.position.set(0, 0.72, 0.285);
  bodyGroup.add(pocket);

  // Capuche relevée bleu nuit + doublure arcanique
  const hoodOuter = new THREE.Mesh(
    new THREE.SphereGeometry(0.525, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.66),
    toonMat(0x312e81)
  );
  hoodOuter.rotation.x = -0.38;
  hoodOuter.position.set(0, 0.05, -0.07);
  headGroup.add(hoodOuter);
  attachOutline(headGroup, hoodOuter, 1.06, 1.06, 1.06);

  const hoodRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.47, 0.045, 10, 22),
    toonMat(0x4f46e5)
  );
  hoodRim.position.set(0, 0.05, 0.12);
  hoodRim.rotation.x = 0.2;
  headGroup.add(hoodRim);

  // Mèche de cheveux bruns sous la capuche
  const hairMat = toonMat(0x451a03);
  for (const [bx, by, bz, rz] of [
    [-0.14, 0.26, 0.36, 0.22],
    [0.0, 0.28, 0.38, -0.08],
    [0.14, 0.25, 0.36, -0.25],
  ] as const) {
    const bang = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 8), hairMat);
    bang.position.set(bx, by, bz);
    bang.rotation.set(Math.PI * 0.85, 0, rz);
    headGroup.add(bang);
  }

  // Lunettes rondes dorées avec verres teintés et branches
  const frameMat = metalMat(0xfbbf24, 0xf59e0b, 0.18, 0.2, 0.8);
  const lensTint = glassMat(0xbae6fd, 0.22, 0x38bdf8, 0.12);
  for (const side of [-1, 1] as const) {
    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 8, 20), frameMat);
    lensRing.position.set(side * 0.165, 0.02, 0.472);
    lensRing.rotation.y = side * 0.32;
    headGroup.add(lensRing);

    const glassLens = new THREE.Mesh(new THREE.CircleGeometry(0.105, 16), lensTint);
    glassLens.position.set(side * 0.165, 0.02, 0.47);
    glassLens.rotation.y = side * 0.32;
    headGroup.add(glassLens);

    const templeArm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.26), frameMat);
    templeArm.position.set(side * 0.31, 0.03, 0.31);
    templeArm.rotation.y = side * 0.38;
    headGroup.add(templeArm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.022), frameMat);
  bridge.position.set(0, 0.03, 0.48);
  headGroup.add(bridge);

  // Bandoulière + Sacoche avec grimoire runique lumineux
  const strap = new THREE.Mesh(
    new THREE.TorusGeometry(0.35, 0.032, 8, 22),
    toonMat(0x78350f)
  );
  strap.position.set(0, 0.78, 0);
  strap.rotation.set(0.3, 0.4, 0.75);
  bodyGroup.add(strap);

  const satchelGroup = new THREE.Group();
  satchelGroup.position.set(-0.36, 0.56, 0);
  bodyGroup.add(satchelGroup);

  const satchel = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.32, 0.34),
    toonMat(0x78350f)
  );
  satchelGroup.add(satchel);
  attachOutline(satchelGroup, satchel, 1.1, 1.08, 1.08);

  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.08), frameMat);
  clasp.position.set(-0.12, 0.02, 0);
  satchelGroup.add(clasp);

  // Grimoire à runes sortant de la sacoche
  const spellbook = new THREE.Group();
  spellbook.position.set(-0.02, 0.16, 0.03);
  spellbook.rotation.set(0.15, 0, 0.22);
  satchelGroup.add(spellbook);

  const bookCover = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.24, 0.2),
    toonMat(0x581c87, 0x9333ea, 0.25)
  );
  spellbook.add(bookCover);

  const pages = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.22, 0.18),
    toonMat(0xfef3c7)
  );
  pages.position.x = 0.02;
  spellbook.add(pages);

  const runeDiamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.055, 0),
    toonMat(0x22d3ee, 0x06b6d4, 0.85)
  );
  runeDiamond.scale.set(0.35, 1.1, 0.85);
  runeDiamond.position.set(-0.075, 0, 0);
  spellbook.add(runeDiamond);

  // Fiole d'encre violette tourbillonnante dans la main droite
  const flaskGroup = new THREE.Group();
  flaskGroup.position.set(0, -0.36, 0.22);

  const outerGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 14, 12),
    glassMat(0xe9d5ff, 0.42, 0xc084fc, 0.22)
  );
  flaskGroup.add(outerGlass);

  const liquidCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.115, 1),
    toonMat(0xa855f7, 0x9333ea, 0.78)
  );
  flaskGroup.add(liquidCore);

  const swirlRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.018, 8, 20),
    toonMat(0xe879f9, 0xd946ef, 0.75)
  );
  swirlRing.rotation.x = Math.PI / 3;
  flaskGroup.add(swirlRing);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.085, 0.13, 12),
    glassMat(0xf3e8ff, 0.55)
  );
  neck.position.y = 0.165;
  flaskGroup.add(neck);

  const neckRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.072, 0.018, 6, 14),
    frameMat
  );
  neckRing.rotation.x = Math.PI / 2;
  neckRing.position.y = 0.12;
  flaskGroup.add(neckRing);

  const cork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.045, 0.07, 10),
    toonMat(0xb45309)
  );
  cork.position.y = 0.245;
  flaskGroup.add(cork);

  rightArm.add(flaskGroup);
  extras.weaponBasePos = flaskGroup.position.clone();
  extras.inkSwirlRing = swirlRing;
  return flaskGroup;
}

function decorateMaya(
  bodyGroup: THREE.Group,
  headGroup: THREE.Group,
  leftArm: THREE.Group,
  rightArm: THREE.Group,
  extras: IRigAnimationExtras
): THREE.Object3D {
  const goldMat = metalMat(0xf59e0b, 0xd97706, 0.22, 0.22, 0.78);
  const leatherMat = toonMat(0x78350f);

  // Cheveux châtains sous le chapeau (mèches latérales + queue arrière)
  const hairMat = toonMat(0x7c2d12);
  for (const side of [-1, 1] as const) {
    const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 6, 8), hairMat);
    lock.position.set(side * 0.4, 0.05, -0.08);
    lock.rotation.z = side * 0.18;
    headGroup.add(lock);
  }
  const ponytail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 10), hairMat);
  ponytail.position.set(0, -0.05, -0.45);
  ponytail.rotation.x = 2.55;
  headGroup.add(ponytail);

  // Chapeau d'exploratrice détaillé avec ruban et boucle dorée
  const hatBrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.64, 0.68, 0.055, 22),
    toonMat(0x65a30d)
  );
  hatBrim.position.y = 0.34;
  hatBrim.rotation.x = -0.06;
  headGroup.add(hatBrim);
  attachOutline(headGroup, hatBrim, 1.05, 1.15, 1.05);

  const hatCrown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 0.28, 18),
    toonMat(0x4d7c0f)
  );
  hatCrown.position.y = 0.48;
  hatCrown.rotation.x = -0.06;
  headGroup.add(hatCrown);
  attachOutline(headGroup, hatCrown, 1.07, 1.08, 1.07);

  const hatBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.425, 0.445, 0.07, 18),
    leatherMat
  );
  hatBand.position.y = 0.39;
  hatBand.rotation.x = -0.06;
  headGroup.add(hatBand);

  const hatBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.095, 0.05), goldMat);
  hatBuckle.position.set(0, 0.405, 0.43);
  hatBuckle.rotation.x = -0.06;
  headGroup.add(hatBuckle);

  // Sac à dos d'expédition + bretelles sur les épaules + rouleau de carte
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.24), toonMat(0x713f12));
  pack.position.set(0, 0.78, -0.37);
  bodyGroup.add(pack);
  attachOutline(bodyGroup, pack, 1.08, 1.08, 1.1);

  const bedroll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.48, 12),
    toonMat(0xd97706)
  );
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 1.05, -0.36);
  bodyGroup.add(bedroll);

  for (const side of [-1, 1] as const) {
    const chestStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.36, 0.56),
      leatherMat
    );
    chestStrap.position.set(side * 0.18, 0.86, 0.01);
    chestStrap.rotation.x = -0.06;
    bodyGroup.add(chestStrap);

    const strapBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.04), goldMat);
    strapBuckle.position.set(side * 0.18, 0.78, 0.295);
    bodyGroup.add(strapBuckle);
  }

  // Boussole-Bouclier Chronométrique doré au bras gauche avec aiguilles animées
  const shieldGroup = new THREE.Group();
  shieldGroup.position.set(-0.2, -0.18, 0.14);
  shieldGroup.rotation.y = -0.38;

  const shieldRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.36, 0.055, 10, 24),
    goldMat
  );
  shieldRim.rotation.y = Math.PI / 2;
  shieldGroup.add(shieldRim);

  const shieldBack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 0.06, 22),
    toonMat(0x92400e)
  );
  shieldBack.rotation.z = Math.PI / 2;
  shieldGroup.add(shieldBack);
  attachOutline(shieldGroup, shieldBack, 1.08, 1.08, 1.08);

  const dialFace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.075, 22),
    toonMat(0x0284c7, 0x38bdf8, 0.52)
  );
  dialFace.rotation.z = Math.PI / 2;
  shieldGroup.add(dialFace);

  // Pointes cardinales de boussole + marques runiques
  const runeMat = toonMat(0xfef08a, 0xfacc15, 0.7);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 4), goldMat);
    spike.position.set(0, Math.cos(angle) * 0.43, Math.sin(angle) * 0.43);
    spike.rotation.x = angle;
    shieldGroup.add(spike);

    const tick = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 0), runeMat);
    tick.position.set(-0.045, Math.cos(angle + Math.PI / 4) * 0.24, Math.sin(angle + Math.PI / 4) * 0.24);
    shieldGroup.add(tick);
  }

  // Aiguilles d'horloge pivotantes sur la face du bouclier
  const hourPivot = new THREE.Group();
  hourPivot.position.x = -0.05;
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.035), goldMat);
  hourHand.position.y = 0.07;
  hourPivot.add(hourHand);
  shieldGroup.add(hourPivot);

  const minutePivot = new THREE.Group();
  minutePivot.position.x = -0.06;
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.24, 0.028), runeMat);
  minuteHand.position.y = 0.11;
  minutePivot.add(minuteHand);
  shieldGroup.add(minutePivot);

  const centerBoss = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), goldMat);
  centerBoss.position.x = -0.055;
  shieldGroup.add(centerBoss);

  leftArm.add(shieldGroup);

  // Sceptre sismique chronométrique dans la main droite
  const staffGroup = new THREE.Group();
  staffGroup.position.set(0, -0.34, 0.18);
  staffGroup.rotation.x = Math.PI / 2;

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.5, 10), goldMat);
  staffGroup.add(shaft);
  const headGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    toonMat(0x38bdf8, 0x0284c7, 0.65)
  );
  headGem.position.y = 0.28;
  staffGroup.add(headGem);
  rightArm.add(staffGroup);

  extras.weaponBasePos = shieldGroup.position.clone();
  extras.clockHourHand = hourPivot;
  extras.clockMinuteHand = minutePivot;
  return shieldGroup;
}

function decorateZack(
  bodyGroup: THREE.Group,
  headGroup: THREE.Group,
  leftLeg: THREE.Group,
  rightLeg: THREE.Group,
  rightArm: THREE.Group,
  extras: IRigAnimationExtras
): THREE.Object3D {
  const stripeWhite = toonMat(0xf8fafc);
  const magentaMat = toonMat(0xec4899, 0xdb2777, 0.12);
  const darkSlate = toonMat(0x0f172a);
  const neonCyan = toonMat(0x22d3ee, 0x06b6d4, 0.72);

  // Col veste teddy rayé + bord côte + patte de boutonnage
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.255, 0.06, 8, 18),
    stripeWhite
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.99;
  bodyGroup.add(collar);

  const collarStripe = new THREE.Mesh(
    new THREE.TorusGeometry(0.268, 0.022, 6, 18),
    magentaMat
  );
  collarStripe.rotation.x = Math.PI / 2;
  collarStripe.position.y = 1.015;
  bodyGroup.add(collarStripe);

  const hemBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.298, 0.298, 0.065, 18),
    stripeWhite
  );
  hemBand.position.y = 0.64;
  bodyGroup.add(hemBand);

  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.05), stripeWhite);
  placket.position.set(0, 0.82, 0.308);
  placket.rotation.x = -0.085;
  bodyGroup.add(placket);

  const zBadge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), neonCyan);
  zBadge.position.set(0.14, 0.88, 0.295);
  zBadge.rotation.y = 0.35;
  bodyGroup.add(zBadge);

  // Cheveux noirs dynamiques + pointes
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.47, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    darkSlate
  );
  hairCap.position.y = 0.05;
  headGroup.add(hairCap);
  attachOutline(headGroup, hairCap, 1.07, 1.07, 1.07);

  for (const [sx, sy, sz, rz] of [
    [-0.14, 0.48, 0.16, 0.3],
    [0.04, 0.52, 0.18, -0.1],
    [0.18, 0.45, 0.14, -0.35],
  ] as const) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 8), darkSlate);
    spike.position.set(sx, sy, sz);
    spike.rotation.set(-0.35, 0, rz);
    headGroup.add(spike);
  }

  // Casque audio néon cyan avec arceau rembourré, anneaux LED et micro-perche
  const headband = new THREE.Mesh(
    new THREE.TorusGeometry(0.505, 0.046, 10, 24, Math.PI),
    darkSlate
  );
  headband.position.y = 0.06;
  headGroup.add(headband);

  const headbandGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.515, 0.02, 8, 24, Math.PI * 0.88),
    neonCyan
  );
  headbandGlow.position.y = 0.06;
  headbandGlow.rotation.z = Math.PI * 0.06;
  headGroup.add(headbandGlow);

  for (const side of [-1, 1] as const) {
    const cupHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.155, 0.1, 16),
      darkSlate
    );
    cupHousing.rotation.z = Math.PI / 2;
    cupHousing.position.set(side * 0.485, 0.03, 0);
    headGroup.add(cupHousing);
    attachOutline(headGroup, cupHousing, 1.1, 1.1, 1.1);

    const ledRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.024, 8, 18),
      neonCyan
    );
    ledRing.rotation.y = Math.PI / 2;
    ledRing.position.set(side * 0.538, 0.03, 0);
    headGroup.add(ledRing);
  }

  // Perche micro connectée avec précision de l'écouteur gauche vers la bouche
  const micStart = new THREE.Vector3(-0.48, -0.01, 0.04);
  const micEnd = new THREE.Vector3(-0.22, -0.135, 0.34);
  const micDir = new THREE.Vector3().subVectors(micEnd, micStart);
  const micLength = micDir.length();
  const micBoom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.018, micLength, 8),
    darkSlate
  );
  micBoom.position.copy(micStart).addScaledVector(micDir, 0.5);
  micBoom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), micDir.normalize());
  headGroup.add(micBoom);

  const micTip = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), neonCyan);
  micTip.position.copy(micEnd);
  headGroup.add(micTip);

  // Patins à doubles roues lumineuses cyan sous chaque chaussure
  const wheels: THREE.Object3D[] = [];
  for (const leg of [leftLeg, rightLeg]) {
    const skateRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.04, 0.3),
      darkSlate
    );
    skateRail.position.set(0, -0.415, 0.04);
    leg.add(skateRail);

    for (const wz of [-0.075, 0.135] as const) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(0, -0.425, wz);

      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.062, 0.25, 14),
        neonCyan
      );
      tire.rotation.z = Math.PI / 2;
      wheelGroup.add(tire);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.262, 10),
        darkSlate
      );
      hub.rotation.z = Math.PI / 2;
      wheelGroup.add(hub);

      leg.add(wheelGroup);
      wheels.push(wheelGroup);
    }
  }

  // Blaster Double Beat à deux canons néon
  const blasterGroup = new THREE.Group();
  blasterGroup.position.set(0, -0.32, 0.22);

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.16, 0.3),
    magentaMat
  );
  blasterGroup.add(chassis);
  attachOutline(blasterGroup, chassis, 1.1, 1.1, 1.08);

  const powerCore = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.07, 0.14),
    neonCyan
  );
  powerCore.position.set(0, 0.02, -0.02);
  blasterGroup.add(powerCore);

  for (const bx of [-0.048, 0.048] as const) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.038, 0.2, 10),
      darkSlate
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(bx, 0.015, 0.21);
    blasterGroup.add(barrel);

    const muzzle = new THREE.Mesh(
      new THREE.TorusGeometry(0.034, 0.012, 6, 12),
      neonCyan
    );
    muzzle.position.set(bx, 0.015, 0.312);
    blasterGroup.add(muzzle);
  }

  const topSight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.1), neonCyan);
  topSight.position.set(0, 0.105, 0.06);
  blasterGroup.add(topSight);

  rightArm.add(blasterGroup);
  extras.weaponBasePos = blasterGroup.position.clone();
  extras.skateWheels = wheels;
  return blasterGroup;
}

/**
 * Construit le modèle 3D Chibi articulé complet de l'élève-héros demandé.
 */
export function createBrawler3DModel(brawlerId: BrawlerId): IBrawler3DRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const extras: IRigAnimationExtras = {};
  let limbs: ReturnType<typeof addBaseChibiLimbs>;
  let weaponMesh: THREE.Object3D;

  switch (brawlerId) {
    case 'TIMO':
      limbs = addBaseChibiLimbs(
        bodyGroup,
        {
          torsoColor: 0xfacc15,
          sleeveColor: 0xfde047,
          cuffColor: 0x2563eb,
          pantsColor: 0x1d4ed8,
          beltColor: 0xf8fafc,
          shoeColor: 0x2563eb,
          soleColor: 0xf8fafc,
          skinColor: 0xfed7aa,
        },
        {
          skinColor: 0xfed7aa,
          eyeColor: 0x0284c7,
          browColor: 0xb45309,
          browTilt: 0.22,
        }
      );
      weaponMesh = decorateTimo(
        bodyGroup,
        limbs.headGroup,
        limbs.leftArm,
        limbs.rightArm,
        limbs.leftLeg,
        limbs.rightLeg,
        extras
      );
      break;

    case 'LEO':
      limbs = addBaseChibiLimbs(
        bodyGroup,
        {
          torsoColor: 0x312e81,
          sleeveColor: 0x3730a3,
          cuffColor: 0xa855f7,
          pantsColor: 0x1e1b4b,
          beltColor: 0x78350f,
          shoeColor: 0x6d28d9,
          soleColor: 0xfbbf24,
          skinColor: 0xfed7aa,
        },
        {
          skinColor: 0xfed7aa,
          eyeColor: 0x9333ea,
          browColor: 0x451a03,
          browTilt: 0.14,
          includeEars: false,
        }
      );
      weaponMesh = decorateLeo(bodyGroup, limbs.headGroup, limbs.rightArm, extras);
      break;

    case 'MAYA':
      limbs = addBaseChibiLimbs(
        bodyGroup,
        {
          torsoColor: 0x4d7c0f,
          sleeveColor: 0x65a30d,
          cuffColor: 0xd97706,
          pantsColor: 0x3f6212,
          beltColor: 0x78350f,
          shoeColor: 0x78350f,
          soleColor: 0xd97706,
          skinColor: 0xfdba74,
        },
        {
          skinColor: 0xfdba74,
          eyeColor: 0x10b981,
          browColor: 0x7c2d12,
          browTilt: 0.24,
        }
      );
      weaponMesh = decorateMaya(
        bodyGroup,
        limbs.headGroup,
        limbs.leftArm,
        limbs.rightArm,
        extras
      );
      break;

    case 'ZACK':
      limbs = addBaseChibiLimbs(
        bodyGroup,
        {
          torsoColor: 0x06b6d4,
          sleeveColor: 0xec4899,
          cuffColor: 0xf8fafc,
          pantsColor: 0x0f172a,
          beltColor: 0xec4899,
          shoeColor: 0x1e293b,
          soleColor: 0x22d3ee,
          skinColor: 0xfed7aa,
          legPivotY: 0.49,
        },
        {
          skinColor: 0xfed7aa,
          eyeColor: 0x06b6d4,
          browColor: 0x0f172a,
          browTilt: 0.2,
          includeEars: false,
        }
      );
      weaponMesh = decorateZack(
        bodyGroup,
        limbs.headGroup,
        limbs.leftLeg,
        limbs.rightLeg,
        limbs.rightArm,
        extras
      );
      break;
  }

  // Anneau Super au sol (visible quand Super = 100%)
  const superRing = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.8, 32),
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    })
  );
  superRing.rotation.x = -Math.PI / 2;
  superRing.position.y = 0.04;
  superRing.visible = false;
  root.add(superRing);

  // Bulle de bouclier translucide
  const shieldSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.96, 20, 16),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    })
  );
  shieldSphere.position.y = 0.95;
  shieldSphere.visible = false;
  root.add(shieldSphere);

  root.userData.animExtras = extras;

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
 * Anime le modèle 3D Chibi (marche, visée, squash-and-stretch, tête, arme, halo Super, bouclier).
 */
export function animateBrawler3DRig(
  rig: IBrawler3DRig,
  params: IBrawler3DAnimationParams
): void {
  const { timeSec, isMoving, aimAngle, superReady, hasShield, isErrorShield } = params;
  const extras = rig.root.userData?.animExtras as IRigAnimationExtras | undefined;

  // Orientation 3D (+Z local aligné vers aimAngle dans le plan X-Z)
  rig.bodyGroup.rotation.y = Math.PI / 2 - aimAngle;

  if (isMoving) {
    const cycle = timeSec * 12.5;
    const stride = Math.sin(cycle) * 0.68;
    const bounce = Math.abs(Math.sin(cycle));

    rig.leftLeg.rotation.x = stride;
    rig.rightLeg.rotation.x = -stride;
    rig.leftArm.rotation.x = -stride * 0.72;
    rig.rightArm.rotation.x = stride * 0.45 - 0.36;

    // Élan sportif + squash-and-stretch rythmé sur la foulée
    rig.bodyGroup.position.y = bounce * 0.095;
    rig.bodyGroup.rotation.x = 0.12;
    rig.bodyGroup.rotation.z = Math.cos(cycle) * 0.045;
    const stretch = 1 + bounce * 0.06 - 0.025;
    const squash = 1 - bounce * 0.03 + 0.012;
    rig.bodyGroup.scale.set(squash, stretch, squash);

    // Contre-balancement expressif de la tête
    rig.headGroup.rotation.z = Math.cos(cycle) * 0.055;
    rig.headGroup.rotation.x = -0.07 + Math.sin(cycle * 2) * 0.028;
    rig.headGroup.rotation.y *= 0.85;
  } else {
    const breath = Math.sin(timeSec * 3.1);
    rig.leftLeg.rotation.x *= 0.84;
    rig.rightLeg.rotation.x *= 0.84;
    rig.leftArm.rotation.x = Math.sin(timeSec * 2.4) * 0.09;
    rig.rightArm.rotation.x = -0.34 + Math.cos(timeSec * 2.4) * 0.08;

    // Respiration idle + léger squash-and-stretch
    rig.bodyGroup.position.y = (breath * 0.5 + 0.5) * 0.045;
    rig.bodyGroup.rotation.x *= 0.84;
    rig.bodyGroup.rotation.z *= 0.84;
    const idleY = 1 + breath * 0.022;
    const idleXZ = 1 - breath * 0.011;
    rig.bodyGroup.scale.set(idleXZ, idleY, idleXZ);

    // Inclinaison vivante de la tête
    rig.headGroup.rotation.z = Math.sin(timeSec * 1.6) * 0.05;
    rig.headGroup.rotation.y = Math.sin(timeSec * 1.05) * 0.065;
    rig.headGroup.rotation.x = Math.cos(timeSec * 2.1) * 0.025;
  }

  // Animation spécifique de l'arme et des équipements
  if (rig.brawlerId === 'TIMO') {
    rig.weaponMesh.rotation.y = timeSec * 4.2;
    rig.weaponMesh.rotation.x = timeSec * 2.0;
    if (extras?.weaponBasePos) {
      rig.weaponMesh.position.y = extras.weaponBasePos.y + Math.sin(timeSec * 4.8) * 0.04;
    }
    if (extras?.ballOrbitRing) {
      extras.ballOrbitRing.rotation.z = timeSec * 5.2;
    }
  } else if (rig.brawlerId === 'LEO') {
    rig.weaponMesh.rotation.z = Math.sin(timeSec * 3.4) * 0.14;
    if (extras?.weaponBasePos) {
      rig.weaponMesh.position.y = extras.weaponBasePos.y + Math.sin(timeSec * 4.0) * 0.03;
    }
    if (extras?.inkSwirlRing) {
      extras.inkSwirlRing.rotation.z = timeSec * 4.6;
      extras.inkSwirlRing.rotation.y = timeSec * 2.8;
    }
  } else if (rig.brawlerId === 'MAYA') {
    if (extras?.clockHourHand) {
      extras.clockHourHand.rotation.x = -timeSec * 0.9;
    }
    if (extras?.clockMinuteHand) {
      extras.clockMinuteHand.rotation.x = -timeSec * 4.5;
    }
  } else if (rig.brawlerId === 'ZACK') {
    if (extras?.weaponBasePos) {
      rig.weaponMesh.position.y = extras.weaponBasePos.y + Math.sin(timeSec * 7.5) * 0.018;
    }
    if (extras?.skateWheels && isMoving) {
      for (const wheel of extras.skateWheels) {
        wheel.rotation.x = timeSec * 18;
      }
    }
  }

  rig.superRing.visible = superReady;
  if (superReady) {
    rig.superRing.rotation.z = timeSec * 2.6;
    const pulse = 1 + Math.sin(timeSec * 6.5) * 0.09;
    rig.superRing.scale.set(pulse, pulse, 1);
  }

  rig.shieldSphere.visible = hasShield;
  if (hasShield) {
    const mat = rig.shieldSphere.material as THREE.MeshBasicMaterial;
    mat.color.setHex(isErrorShield ? 0xf87171 : 0x38bdf8);
    mat.opacity = 0.22 + Math.sin(timeSec * 8) * 0.06;
  }
}

/**
 * Construit les modèles 3D des cibles pédagogiques (Drone scolaire, Cristal bleu, Boss Conseil de Classe).
 */
export function createTarget3DModel(kind: 'drone' | 'crystal' | 'boss'): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'crystal') {
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.56, 0),
      toonMat(0x38bdf8, 0x0284c7, 0.52)
    );
    crystal.scale.set(0.86, 1.38, 0.86);
    crystal.position.y = 0.95;
    crystal.castShadow = true;
    group.add(crystal);
    attachOutline(group, crystal, 1.09, 1.07, 1.09);

    const innerSpark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      toonMat(0xe0f2fe, 0x7dd3fc, 0.85)
    );
    innerSpark.scale.set(0.85, 1.35, 0.85);
    innerSpark.position.y = 0.95;
    group.add(innerSpark);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.045, 8, 26),
      metalMat(0xfacc15, 0xf59e0b, 0.4, 0.22, 0.78)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.88;
    group.add(ring);

    // Éclats cristallins flottants autour de la gemme
    const shardMat = toonMat(0x7dd3fc, 0x0ea5e9, 0.6);
    const shardPositions: Array<[number, number, number, number]> = [
      [0.64, 1.12, 0.22, 0.4],
      [-0.62, 0.72, -0.25, -0.5],
      [0.2, 0.62, -0.66, 0.65],
      [-0.28, 1.25, 0.56, -0.35],
    ];
    for (const [sx, sy, sz, tilt] of shardPositions) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), shardMat);
      shard.scale.set(0.65, 1.5, 0.65);
      shard.position.set(sx, sy, sz);
      shard.rotation.set(tilt, tilt * 1.3, -tilt);
      group.add(shard);
    }
    return group;
  }

  if (kind === 'boss') {
    const armorMat = toonMat(0x1e293b);
    const goldMat = metalMat(0xfacc15, 0xd97706, 0.32, 0.22, 0.82);

    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.95, 0),
      toonMat(0xdc2626, 0x991b1b, 0.42)
    );
    core.position.y = 1.2;
    core.castShadow = true;
    group.add(core);
    attachOutline(group, core, 1.07, 1.07, 1.07);

    // Visière féroce avec yeux lumineux
    const visorPlate = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.34, 0.34), armorMat);
    visorPlate.position.set(0, 1.28, 0.76);
    group.add(visorPlate);
    attachOutline(group, visorPlate, 1.08, 1.12, 1.08);

    const bossEyeMat = toonMat(0xfef08a, 0xfacc15, 0.9);
    for (const side of [-1, 1] as const) {
      const eyeSlit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.08), bossEyeMat);
      eyeSlit.position.set(side * 0.25, 1.29, 0.92);
      eyeSlit.rotation.z = side * 0.22;
      group.add(eyeSlit);
    }

    // Épaulières blindées latérales
    for (const side of [-1, 1] as const) {
      const pauldron = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.58, 0.72),
        armorMat
      );
      pauldron.position.set(side * 1.02, 1.32, 0);
      pauldron.rotation.z = -side * 0.25;
      pauldron.castShadow = true;
      group.add(pauldron);
      attachOutline(group, pauldron, 1.08, 1.08, 1.08);

      const pauldronTrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.76), goldMat);
      pauldronTrim.position.set(side * 1.05, 1.52, 0);
      pauldronTrim.rotation.z = -side * 0.25;
      group.add(pauldronTrim);
    }

    // Couronne blindée à pointes dorées
    const crownBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.74, 0.32, 6),
      armorMat
    );
    crownBase.position.y = 2.1;
    group.add(crownBase);
    attachOutline(group, crownBase, 1.08, 1.1, 1.08);

    const crownRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.09, 6),
      goldMat
    );
    crownRim.position.y = 1.98;
    group.add(crownRim);

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 4), goldMat);
      spike.position.set(Math.cos(angle) * 0.48, 2.38, Math.sin(angle) * 0.48);
      group.add(spike);
    }

    const crownGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      toonMat(0xf43f5e, 0xe11d48, 0.8)
    );
    crownGem.position.set(0, 2.12, 0.62);
    group.add(crownGem);

    // Double anneaux d'énergie gyroscopiques
    const auraRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.36, 0.055, 8, 32),
      toonMat(0xf87171, 0xef4444, 0.65)
    );
    auraRing1.rotation.set(Math.PI / 2.2, 0.25, 0);
    auraRing1.position.y = 1.18;
    group.add(auraRing1);

    const auraRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.52, 0.04, 8, 32),
      toonMat(0xfacc15, 0xf59e0b, 0.6)
    );
    auraRing2.rotation.set(Math.PI / 2.6, -0.35, 0);
    auraRing2.position.y = 1.18;
    group.add(auraRing2);

    return group;
  }

  // Drone scolaire quadricoptère détaillé
  const droneOrange = toonMat(0xf97316, 0xea580c, 0.22);
  const darkSlate = toonMat(0x0f172a);
  const rotorMetal = metalMat(0x94a3b8);
  const scannerGlow = toonMat(0x38bdf8, 0x0ea5e9, 0.85);
  const rotorDiscMat = glassMat(0x38bdf8, 0.36, 0x0284c7, 0.35);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 14), droneOrange);
  body.scale.set(1.18, 0.7, 1.18);
  body.position.y = 0.88;
  body.castShadow = true;
  group.add(body);
  attachOutline(group, body, 1.09, 1.1, 1.09);

  const bellyPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.14, 14), darkSlate);
  bellyPlate.position.y = 0.62;
  group.add(bellyPlate);

  // Visière frontale + œil scanner lumineux
  const visorHousing = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.22, 0.16), darkSlate);
  visorHousing.position.set(0, 0.9, 0.44);
  group.add(visorHousing);

  const scannerLens = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), scannerGlow);
  scannerLens.scale.set(1.1, 1.0, 0.55);
  scannerLens.position.set(0, 0.9, 0.51);
  group.add(scannerLens);

  const scannerIris = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.018, 6, 16),
    toonMat(0xe0f2fe, 0x38bdf8, 0.6)
  );
  scannerIris.position.set(0, 0.9, 0.525);
  group.add(scannerIris);

  // Antennes supérieures
  for (const side of [-1, 1] as const) {
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.22, 6), rotorMetal);
    antenna.position.set(side * 0.16, 1.24, -0.08);
    antenna.rotation.z = -side * 0.25;
    group.add(antenna);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), scannerGlow);
    beacon.position.set(side * 0.19, 1.35, -0.08);
    group.add(beacon);
  }

  // 4 bras de rotor + moteurs + pales croisées + disques de rotation
  const corners: Array<[number, number]> = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ];
  for (const [cx, cz] of corners) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.72), darkSlate);
    arm.position.set(cx * 0.5, 0.92, cz * 0.5);
    arm.rotation.y = Math.atan2(cx, cz);
    group.add(arm);

    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.1, 0.12, 12), rotorMetal);
    pod.position.set(cx, 0.95, cz);
    group.add(pod);
    attachOutline(group, pod, 1.12, 1.12, 1.12);

    const bladeA = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.016, 0.045), darkSlate);
    bladeA.position.set(cx, 1.03, cz);
    bladeA.rotation.y = cx * cz * 1.4;
    group.add(bladeA);

    const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.016, 0.42), darkSlate);
    bladeB.position.set(cx, 1.03, cz);
    bladeB.rotation.y = cx * cz * 1.4;
    group.add(bladeB);

    const rotorDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.014, 16),
      rotorDiscMat
    );
    rotorDisc.position.set(cx, 1.035, cz);
    group.add(rotorDisc);

    const rotorRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 6, 18), scannerGlow);
    rotorRing.rotation.x = Math.PI / 2;
    rotorRing.position.set(cx, 1.035, cz);
    group.add(rotorRing);
  }

  return group;
}

/**
 * Construit un PNJ Chibi 3D stylisé pour le mode Exploration du Collège,
 * teinté selon primaryHex / accentHex avec marqueur flottant doré `!` optionnel.
 */
export function createCampusNpc3DModel(
  primaryHex: string,
  accentHex: string,
  hasQuestMarker: boolean
): THREE.Group {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const primaryColor = new THREE.Color(primaryHex);
  const accentColor = new THREE.Color(accentHex);
  const pantsColor = primaryColor.clone().lerp(new THREE.Color(0x0f172a), 0.55);
  const hairColor = primaryColor.clone().lerp(new THREE.Color(0x1e293b), 0.65);

  const limbs = addBaseChibiLimbs(
    bodyGroup,
    {
      torsoColor: primaryColor.getHex(),
      sleeveColor: accentColor.getHex(),
      cuffColor: primaryColor.getHex(),
      pantsColor: pantsColor.getHex(),
      beltColor: accentColor.getHex(),
      shoeColor: accentColor.getHex(),
      soleColor: 0xf8fafc,
      skinColor: 0xfed7aa,
    },
    {
      skinColor: 0xfed7aa,
      eyeColor: accentColor.getHex(),
      browColor: hairColor.getHex(),
      browTilt: 0.12,
    }
  );

  // Chevelure / coiffe stylisée et col accentué
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.47, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.54),
    toonMat(hairColor.getHex())
  );
  hair.position.y = 0.05;
  hair.castShadow = true;
  limbs.headGroup.add(hair);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.055, 8, 18),
    toonMat(accentColor.getHex(), accentColor.getHex(), 0.15)
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.99;
  bodyGroup.add(collar);

  // Badge / tablette tenue par le PNJ
  const tablet = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.24, 0.05),
    toonMat(accentColor.getHex(), accentColor.getHex(), 0.2)
  );
  tablet.position.set(0, -0.3, 0.16);
  limbs.rightArm.add(tablet);

  // Socle discret au sol
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.54, 0.6, 0.06, 22),
    toonMat(0x1e293b)
  );
  pedestal.position.y = 0.03;
  pedestal.receiveShadow = true;
  root.add(pedestal);

  const pedestalRing = new THREE.Mesh(
    new THREE.RingGeometry(0.54, 0.63, 24),
    new THREE.MeshBasicMaterial({
      color: accentColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
    })
  );
  pedestalRing.rotation.x = -Math.PI / 2;
  pedestalRing.position.y = 0.04;
  root.add(pedestalRing);

  root.userData.bodyGroup = bodyGroup;
  root.userData.headGroup = limbs.headGroup;

  if (hasQuestMarker) {
    const questMarker = new THREE.Group();
    questMarker.name = 'questMarker';
    questMarker.position.set(0, 2.28, 0);

    const goldMat = toonMat(0xfacc15, 0xf59e0b, 0.75);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.045, 0.42, 14), goldMat);
    bar.position.y = 0.22;
    questMarker.add(bar);

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), goldMat);
    dot.position.y = -0.1;
    questMarker.add(dot);

    root.add(questMarker);
    root.userData.questMarker = questMarker;
    root.userData.questMarkerBaseY = 2.28;
  }

  return root;
}

/**
 * Construit une médaille / cristal doré flottant entouré d'un anneau lumineux cyan/or
 * à collecter dans les salles du collège.
 */
export function createCampusBadge3DModel(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'campusBadge';

  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.38, 0),
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.35,
    })
  );
  core.position.y = 0.9;
  core.scale.set(1, 1.25, 0.65);
  core.castShadow = true;
  group.add(core);

  const medalRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.055, 10, 24),
    toonMat(0xfef08a, 0xfacc15, 0.45)
  );
  medalRing.position.y = 0.9;
  group.add(medalRing);

  const cyanAuraRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.04, 8, 28),
    toonMat(0x22d3ee, 0x06b6d4, 0.65)
  );
  cyanAuraRing.rotation.x = Math.PI / 2;
  cyanAuraRing.position.y = 0.85;
  group.add(cyanAuraRing);

  const groundRing = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.68, 24),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    })
  );
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = 0.04;
  group.add(groundRing);

  group.userData.core = core;
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
