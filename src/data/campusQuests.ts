import type { ICampusQuest } from '../types/cctp';

/**
 * Catalogue initial des 12 quêtes/missions progressives d'exploration du collège (Jalon M4, Ticket #22).
 * Couvre la vie au collège (emploi du temps, casiers, cantine, CPE) et les 5 piliers du programme de 6ème.
 */
export const INITIAL_CAMPUS_QUESTS: ICampusQuest[] = [
  {
    id: 'Q_01_BIENVENUE',
    chapter_order: 1,
    category: 'PRINCIPALE',
    title: 'Rentrée en 6ème : Le Grand Repérage',
    giver_npc_id: 'NPC_DELEGUE',
    briefing_short:
      "Bienvenue au collège ! Retrouve le Délégué, consulte l'emploi du temps et passe saluer la CPE.",
    objectives: [
      {
        id: 'Q01_OBJ_1',
        type: 'TALK_NPC',
        description: "Parler au Délégué dans la Cour d'Honneur",
        target_room_id: 'COUR_HONNEUR',
        target_npc_id: 'NPC_DELEGUE',
        required_count: 1,
      },
      {
        id: 'Q01_OBJ_2',
        type: 'TALK_NPC',
        description: "Consulter le Panneau Emploi du Temps au Hall des Casiers",
        target_room_id: 'HALL_CASIERS',
        target_npc_id: 'NPC_PANNEAU_EDT',
        required_count: 1,
      },
      {
        id: 'Q01_OBJ_3',
        type: 'TALK_NPC',
        description: 'Rencontrer la CPE à la Vie Scolaire',
        target_room_id: 'VIE_SCOLAIRE_CPE',
        target_npc_id: 'NPC_CPE',
        required_count: 1,
      },
    ],
    reward: {
      coins: 80,
      trophies: 20,
      combat_stars: 1,
      knowledge_points: 15,
      unlocked_title_or_badge: 'Badge Nouveau de 6e',
    },
  },
  {
    id: 'Q_02_VIE_SCOLAIRE',
    chapter_order: 2,
    category: 'VIE_COLLEGE',
    title: 'Opération Semaine A / Semaine B',
    giver_npc_id: 'NPC_CPE',
    briefing_short:
      'Repère la zone des casiers puis réussis 3 défis express de Vie au Collège avec la CPE !',
    objectives: [
      {
        id: 'Q02_OBJ_1',
        type: 'VISIT_ROOM',
        description: 'Visiter le Hall des Casiers',
        target_room_id: 'HALL_CASIERS',
        required_count: 1,
      },
      {
        id: 'Q02_OBJ_2',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: 'Réussir 3 défis Vie au Collège à la Vie Scolaire',
        target_room_id: 'VIE_SCOLAIRE_CPE',
        subject: 'vie_au_college',
        required_count: 3,
      },
    ],
    reward: {
      coins: 100,
      trophies: 25,
      combat_stars: 1,
      knowledge_points: 20,
    },
  },
  {
    id: 'Q_03_SALLE_101_MATHS',
    chapter_order: 3,
    category: 'MATIERE',
    title: 'Urgence Calcul en Salle 101',
    giver_npc_id: 'NPC_PROF_MATHS',
    briefing_short:
      'Cap sur la Salle 101 au 1er étage ! Parle au prof de Maths et valide 3 calculs flash.',
    objectives: [
      {
        id: 'Q03_OBJ_1',
        type: 'TALK_NPC',
        description: 'Parler au Prof de Maths en Salle 101',
        target_room_id: 'SALLE_101_MATHS',
        target_npc_id: 'NPC_PROF_MATHS',
        required_count: 1,
      },
      {
        id: 'Q03_OBJ_2',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: 'Résoudre 3 défis de Mathématiques en Salle 101',
        target_room_id: 'SALLE_101_MATHS',
        subject: 'mathematiques',
        required_count: 3,
      },
    ],
    reward: {
      coins: 120,
      trophies: 30,
      combat_stars: 1,
      knowledge_points: 25,
    },
  },
  {
    id: 'Q_04_SALLE_102_FRANCAIS',
    chapter_order: 4,
    category: 'MATIERE',
    title: 'Les Grimoires de la Salle 102',
    giver_npc_id: 'NPC_PROF_FRANCAIS',
    briefing_short:
      'Entre en Salle 102 et maîtrise accords et homophones en 3 tirs de précision !',
    objectives: [
      {
        id: 'Q04_OBJ_1',
        type: 'TALK_NPC',
        description: 'Parler à la Prof de Français en Salle 102',
        target_room_id: 'SALLE_102_FRANCAIS',
        target_npc_id: 'NPC_PROF_FRANCAIS',
        required_count: 1,
      },
      {
        id: 'Q04_OBJ_2',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: 'Réussir 3 défis de Français en Salle 102',
        target_room_id: 'SALLE_102_FRANCAIS',
        subject: 'francais',
        required_count: 3,
      },
    ],
    reward: {
      coins: 130,
      trophies: 30,
      combat_stars: 1,
      knowledge_points: 25,
    },
  },
  {
    id: 'Q_05_MYSTERE_CDI',
    chapter_order: 5,
    category: 'PRINCIPALE',
    title: 'Enquête au CDI avec Mme Page',
    giver_npc_id: 'NPC_DOC_CDI',
    briefing_short:
      "File au CDI, parle à Mme Page et résous 3 énigmes d'Histoire-Géo & Sciences !",
    objectives: [
      {
        id: 'Q05_OBJ_1',
        type: 'VISIT_ROOM',
        description: 'Entrer au CDI (Bibliothèque)',
        target_room_id: 'CDI_BIBLIOTHEque',
        required_count: 1,
      },
      {
        id: 'Q05_OBJ_2',
        type: 'TALK_NPC',
        description: 'Parler à Mme Page au CDI',
        target_room_id: 'CDI_BIBLIOTHEque',
        target_npc_id: 'NPC_DOC_CDI',
        required_count: 1,
      },
      {
        id: 'Q05_OBJ_3',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: "Résoudre 3 défis d'Histoire-Géo & Sciences au CDI",
        target_room_id: 'CDI_BIBLIOTHEque',
        subject: 'histoire_geo_sciences',
        required_count: 3,
      },
    ],
    reward: {
      coins: 160,
      trophies: 40,
      combat_stars: 2,
      knowledge_points: 35,
      starr_drop_bonus: 1,
      unlocked_title_or_badge: 'Badge Enquêteur du CDI',
    },
  },
  {
    id: 'Q_06_LONDON_LAB_201',
    chapter_order: 6,
    category: 'MATIERE',
    title: 'Tea Time en Salle 201 (Anglais)',
    giver_npc_id: 'NPC_PROF_ANGLAIS',
    briefing_short:
      "Monte au 2e étage en Salle 201 pour un sprint bilingue avec le prof d'Anglais !",
    objectives: [
      {
        id: 'Q06_OBJ_1',
        type: 'TALK_NPC',
        description: "Parler au Prof d'Anglais en Salle 201",
        target_room_id: 'SALLE_201_ANGLAIS',
        target_npc_id: 'NPC_PROF_ANGLAIS',
        required_count: 1,
      },
      {
        id: 'Q06_OBJ_2',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: "Réussir 3 défis d'Anglais en Salle 201",
        target_room_id: 'SALLE_201_ANGLAIS',
        subject: 'anglais',
        required_count: 3,
      },
    ],
    reward: {
      coins: 150,
      trophies: 35,
      combat_stars: 1,
      knowledge_points: 30,
    },
  },
  {
    id: 'Q_07_MISSION_SALLE_204',
    chapter_order: 7,
    category: 'DEFIS_204',
    title: 'Alerte au Labo SVT — Salle 204 !',
    giver_npc_id: 'NPC_PROF_SCIENCES',
    briefing_short:
      'Salle 204 = 2e étage, porte 04 ! Rejoins le labo SVT et réussis 4 défis scientifiques.',
    objectives: [
      {
        id: 'Q07_OBJ_1',
        type: 'VISIT_ROOM',
        description: 'Rejoindre la Salle 204 (2e étage)',
        target_room_id: 'SALLE_204_SCIENCES',
        required_count: 1,
      },
      {
        id: 'Q07_OBJ_2',
        type: 'TALK_NPC',
        description: 'Parler au Prof de Sciences en Salle 204',
        target_room_id: 'SALLE_204_SCIENCES',
        target_npc_id: 'NPC_PROF_SCIENCES',
        required_count: 1,
      },
      {
        id: 'Q07_OBJ_3',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: 'Résoudre 4 défis Sciences & Histoire-Géo en Salle 204',
        target_room_id: 'SALLE_204_SCIENCES',
        subject: 'histoire_geo_sciences',
        required_count: 4,
      },
    ],
    reward: {
      coins: 200,
      trophies: 50,
      combat_stars: 2,
      knowledge_points: 45,
      starr_drop_bonus: 1,
      unlocked_title_or_badge: 'As de la Salle 204',
    },
  },
  {
    id: 'Q_08_PAUSE_CANTINE',
    chapter_order: 8,
    category: 'VIE_COLLEGE',
    title: 'Énigmes au Self de Midi',
    giver_npc_id: 'NPC_DELEGUE',
    briefing_short:
      'Pause déjeuner tactique ! Passe par la Cantine et récupère 3 badges campus au Self.',
    objectives: [
      {
        id: 'Q08_OBJ_1',
        type: 'VISIT_ROOM',
        description: 'Entrer dans le Self / Cantine',
        target_room_id: 'CANTINE_SELF',
        required_count: 1,
      },
      {
        id: 'Q08_OBJ_2',
        type: 'COLLECT_CAMPUS_BADGE',
        description: 'Collecter 3 badges campus au Self',
        target_room_id: 'CANTINE_SELF',
        required_count: 3,
      },
    ],
    reward: {
      coins: 170,
      trophies: 40,
      combat_stars: 1,
      knowledge_points: 35,
    },
  },
  {
    id: 'Q_09_ENTRAINEMENT_GYMNASE',
    chapter_order: 9,
    category: 'PRINCIPALE',
    title: 'Tournoi du Gymnase',
    giver_npc_id: 'NPC_COACH_GYM',
    briefing_short:
      'Le Coach lance le chrono au Gymnase ! Parle-lui puis enchaîne 4 défis de Maths en mouvement.',
    objectives: [
      {
        id: 'Q09_OBJ_1',
        type: 'TALK_NPC',
        description: 'Parler au Coach au Gymnase',
        target_room_id: 'GYMNASE_SPORTS',
        target_npc_id: 'NPC_COACH_GYM',
        required_count: 1,
      },
      {
        id: 'Q09_OBJ_2',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: 'Résoudre 4 défis de Maths au Gymnase',
        target_room_id: 'GYMNASE_SPORTS',
        subject: 'mathematiques',
        required_count: 4,
      },
    ],
    reward: {
      coins: 220,
      trophies: 55,
      combat_stars: 2,
      knowledge_points: 50,
      starr_drop_bonus: 1,
      unlocked_title_or_badge: 'Champion du Gymnase',
    },
  },
  {
    id: 'Q_10_MARATHON_LANGUES',
    chapter_order: 10,
    category: 'MATIERE',
    title: 'Duo Franco-Anglais',
    giver_npc_id: 'NPC_PROF_ANGLAIS',
    briefing_short:
      "Passe du Français à l'Anglais sans temps mort : 2 défis en Salle 102 puis 2 en Salle 201 !",
    objectives: [
      {
        id: 'Q10_OBJ_1',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: 'Réussir 2 défis de Français en Salle 102',
        target_room_id: 'SALLE_102_FRANCAIS',
        subject: 'francais',
        required_count: 2,
      },
      {
        id: 'Q10_OBJ_2',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: "Réussir 2 défis d'Anglais en Salle 201",
        target_room_id: 'SALLE_201_ANGLAIS',
        subject: 'anglais',
        required_count: 2,
      },
    ],
    reward: {
      coins: 210,
      trophies: 50,
      combat_stars: 2,
      knowledge_points: 45,
    },
  },
  {
    id: 'Q_11_INSPECTEUR_COLLEGE',
    chapter_order: 11,
    category: 'VIE_COLLEGE',
    title: 'La Ronde du Délégué',
    giver_npc_id: 'NPC_CPE',
    briefing_short:
      'Collecte 3 badges dans le Hall des Casiers puis fais ton rapport express à la CPE !',
    objectives: [
      {
        id: 'Q11_OBJ_1',
        type: 'COLLECT_CAMPUS_BADGE',
        description: 'Collecter 3 badges campus au Hall des Casiers',
        target_room_id: 'HALL_CASIERS',
        required_count: 3,
      },
      {
        id: 'Q11_OBJ_2',
        type: 'TALK_NPC',
        description: 'Faire ton rapport à la CPE à la Vie Scolaire',
        target_room_id: 'VIE_SCOLAIRE_CPE',
        target_npc_id: 'NPC_CPE',
        required_count: 1,
      },
    ],
    reward: {
      coins: 240,
      trophies: 60,
      combat_stars: 2,
      knowledge_points: 55,
      unlocked_title_or_badge: 'Badge Délégué Express',
    },
  },
  {
    id: 'Q_12_MAJOR_PROMO_6E',
    chapter_order: 12,
    category: 'PRINCIPALE',
    title: 'Le Grand Défi du Major de 6ème',
    giver_npc_id: 'NPC_DELEGUE',
    briefing_short:
      "Épreuve finale ! Valide Maths en 101, Sciences en 204 et rejoins le Délégué dans la Cour !",
    objectives: [
      {
        id: 'Q12_OBJ_1',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: 'Réussir 3 défis de Maths en Salle 101',
        target_room_id: 'SALLE_101_MATHS',
        subject: 'mathematiques',
        required_count: 3,
      },
      {
        id: 'Q12_OBJ_2',
        type: 'SOLVE_ROOM_QUESTIONS',
        description: 'Réussir 3 défis de Sciences en Salle 204',
        target_room_id: 'SALLE_204_SCIENCES',
        subject: 'histoire_geo_sciences',
        required_count: 3,
      },
      {
        id: 'Q12_OBJ_3',
        type: 'TALK_NPC',
        description: "Valider le titre avec le Délégué dans la Cour d'Honneur",
        target_room_id: 'COUR_HONNEUR',
        target_npc_id: 'NPC_DELEGUE',
        required_count: 1,
      },
    ],
    reward: {
      coins: 350,
      trophies: 100,
      combat_stars: 3,
      knowledge_points: 100,
      starr_drop_bonus: 1,
      unlocked_title_or_badge: 'Major de la Promo 6ème',
    },
  },
];

export function getCampusQuestById(questId: string): ICampusQuest | undefined {
  return INITIAL_CAMPUS_QUESTS.find((quest) => quest.id === questId);
}
