# AGENTS.md — Architecture Multi-Agents (« Brawl Collège : Opération 6ème »)

**Référence Documentaire :** `CCTP-BC6E-2026-V2` (`docs/Cahier des Charges - Brawl College Operation 6eme.pdf`)  
**Dépôt :** `ricksponge/college_star`  
**Principe Directeur MOA (« Zéro Friction Scolaire ») :** Le joueur ne s'arrête jamais de jouer pour remplir un formulaire ou lire un long paragraphe. Le réflexe cognitif (calculer, accorder, traduire, s'orienter dans les couloirs du collège) est fusionné avec le réflexe moteur du double stick sur l'écran tactile en moins de 3 secondes.

---

## 1. Répartition des 16 Issues GitHub & Périmètres des 4 Agents

Chaque agent travaille de manière isolée sur sa branche dédiée et dans ses répertoires assignés, en s'appuyant sur le contrat de types partagé `src/types/cctp.ts`.

| Agent | Code & Rôle | Branche Git | Répertoires Attribués | Issues GitHub Assignées |
| :--- | :--- | :--- | :--- | :--- |
| **Agent 0** | **ORCHESTRATOR** (Socle & Intégration) | `main` | `src/types/`, racine | **#16** Release: Recette et Production (M3)<br>**#25** Intégration & Recette M4 Exploration du Collège |
| **Agent 1** | **GD-Core** (Gameplay, Moteur 60 FPS & Héros) | `feat/gd-core-combat` / `feat/campus-map-engine` | `src/engine/`, `src/entities/` | **#5** Moteur de rendu 60 FPS isométrique (M1)<br>**#1** US-01: Contrôle double stick et tir (M0)<br>**#2** US-02: Attaque Super (M0)<br>**#8** Tech: Roster Initial - 4 Héros (M1)<br>**#21** Moteur CampusEngine, collisions salles, PNJ 3D & mini-carte radar (M4) |
| **Agent 2** | **PEDA-6e** (Programme 6e, Questions & Elo) | `feat/peda-6e-elo` / `feat/campus-quests-service` | `src/services/`, `src/data/` | **#7** Tech: Service QuestionProvider (M1)<br>**#10** Tech: Algorithme d'Elo Pédagogique K=32 (M2)<br>**#9** Data: Import des 200 premières questions (M1)<br>**#22** Catalogue de 12 quêtes/missions du collège & QuestService (M4) |
| **Agent 3** | **MODES** (Level Design & 5 Modes d'Arène) | `feat/modes-arenas` / `feat/campus-world-mode` | `src/modes/` | **#11** Mode 1: Chasse aux Bonnes Notes (M2)<br>**#12** Mode 2: Le Match des Accords (M2)<br>**#13** Mode 3: L'Interro Surprise (M2)<br>**#14** Mode 4: Changement de Salle (M2)<br>**#15** Mode 5: Le Conseil de Classe (M2)<br>**#23** Carte du Collège (10 salles, PNJ, portails) & Mode6CampusExploration (M4) |
| **Agent 4** | **META-Dash** (SQLite, Casiers & Dashboard Parent) | `feat/meta-parent-db` / `feat/campus-quests-ui-db` | `src/db/`, `src/ui/` | **#6** Tech: Base SQLite locale (M1)<br>**#3** US-03: Casier Mystère / Starr Drop (M0)<br>**#4** US-04: Dashboard Parent PIN (M0)<br>**#24** Table SQLite `quest_progress`, QuestJournalModal & suivi Parent (M4) |

---

## 2. Jalons (Milestones)

- **M0 - Vertical Slice HTML5** : Issues **#1**, **#2**, **#3**, **#4** (Ergonomie de combat, Timo, Casiers Mystères, Dashboard Parent).
- **M1 - Moteur 60 FPS & SQLite** : Issues **#5**, **#6**, **#7**, **#8**, **#9** (Moteur physique 60 FPS, 4 héros jouables, base SQLite, QuestionProvider, 200 premières questions).
- **M2 - 5 Modes & Elo** : Issues **#10**, **#11**, **#12**, **#13**, **#14**, **#15** (Ouverture des 5 modes de jeu en rotation horaire, équilibrage de l'Elo pédagogique).
- **M3 - Recette & Production** : Issue **#16** (Validation VABF/VSR, packaging APK Android / IPA iPadOS).
- **M4 - Exploration du Collège, Quêtes & Missions** : Issues **#21**, **#22**, **#23**, **#24**, **#25** (Carte ouverte 3D `2400×1800` à 10 salles, 9 PNJ/bornes, boussole & mini-carte radar, 12 quêtes progressives, table SQLite `quest_progress`, Carnet de Quêtes).

---

## 3. Spécifications Détaillées par Agent

### Agent 1 : `GD-Core` (Branche `feat/gd-core-combat`)

#### Issues prises en charge :
- **#5 — Tech: Moteur de rendu 60 FPS isométrique** : Mode Paysage (16:9 ou 4:3), caméra verrouillée en projection inclinée à `50°` au-dessus du terrain (+35% de visibilité vers le haut de l'écran). Pouce gauche : joystick flottant de déplacement ; pouce droit : vecteur de tir, bouton Super (jaune) et bouton Gadget (vert, 3 charges). 3 barres de munitions, parties de 120s à 150s.
- **#1 — US-01: Contrôle double stick et tir**
- **#2 — US-02: Attaque Super**
- **#8 — Tech: Roster Initial (4 Héros : Timo, Léo, Maya, Zack)**

#### Formules Mathématiques du Moteur de Combat :
- **Calcul des dégâts sur cible valide (`is_correct = true`) :**
  $$D_{\text{final}} = D_{\text{base}} \times (1 + 0,08 \times (N_{\text{niveau}} - 1)) \times M_{\text{combo}}$$
  où $M_{\text{combo}}$ vaut `1.0` de base et augmente de `+0.15` par bonne réponse consécutive (plafonné à `1.60`).
- **Gain de Jauge de Super ($G_{\text{super}}$) :**
  $$G_{\text{super}} = 34\% + (6\% \times V_{\text{réflexe}})$$
  où $V_{\text{réflexe}} = 1$ si le tir touche la bonne cible en moins de `2,5 secondes` (`2500 ms`) après l'affichage de la consigne (`0` sinon), permettant de charger son attaque ultime en exactement 3 tirs parfaits ($3 \times 40\% = 120\% \rightarrow 100\%$).
- **Pénalité sur cible erronée (`is_correct = false`) :**
  Le projectile rebondit avec un effet sonore métallique sourd, le combo $M_{\text{combo}}$ retombe à `1.0`, et l'entité renvoie une onde de choc infligeant :
  $$P_{\text{erreur}} = 12\% \times PV_{\text{max}}$$
  au joueur tout en affichant une bulle corrective flash (`explanation_flash`) pendant `1,2 seconde` (`1200 ms`).

#### Roster Initial (« Les Élèves-Héros » — Stats Niveau 1) :

| Héros & Archétype | Matière de Prédilection | PV (Niv. 1) | Vitesse | Attaque de Base (`D_base`) | Super (Bouton Jaune) | Gadget (Bouton Vert - 3 charges) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **TIMO**<br>*Le Stratège du Stade* (Tireur d'Élite / Mobile) | Mathématiques & Logique | `3200` | Rapide (`770`) | **Frappe Brossée** : ballon d'énergie rapide à longue portée (`950` dégâts) | **Tacle Pythagore** : sprint fulgurant qui traverse l'arène, repousse les ennemis et valide instantanément la bonne cible touchée | **Vision de Jeu** : analyse le terrain et entoure la bonne réponse d'un halo doré pendant `4s` |
| **LÉO**<br>*L'Alchimiste des Mots* (Artilleur de Zone) | Français & Conjugaison | `2800` | Normale (`720`) | **Fiole d'Encre** : tir en cloche par-dessus les murs créant une flaque (`880` dégâts) | **Le Grand Robert** : invoque une tourelle-dictionnaire qui tire des rayons correcteurs et soigne les alliés de `400 PV/s` | **Brouillon Propre** : efface une mauvaise cible de l'arène |
| **MAYA**<br>*La Gardienne du Temps* (Tank / Contrôle) | Histoire-Géo, Sciences & EMC | `5200` | Normale (`720`) | **Onde Sismique** : cône large à courte portée (`1100` dégâts) | **Rempart Chronologique** : érige un bouclier temporel absorbant `6000` dégâts et figeant les ennemis proches pendant `2,5s` | **Boussole du CDI** : indique par une flèche au sol la salle ou la cible exacte |
| **ZACK**<br>*Le Geek Bilingue* (Assassin Furtif) | Anglais & Vie au Collège | `3000` | Très Rapide (`820`) | **Double Beat** : deux salves sonores ultra-rapides en ligne droite (`2 × 520` = `1040` dégâts) | **Teleport-Bus** : se téléporte instantanément sur l'emplacement de la bonne réponse avec un bouclier de `1500 PV` | **Pause Récré** : ralentit tous les ennemis de l'arène de `50%` pendant `3,5s` |

---

### Agent 2 : `PEDA-6e` (Branche `feat/peda-6e-elo`)

#### Issues prises en charge :
- **#7 — Tech: Service QuestionProvider** : Service local alimenté par JSON/SQLite respectant le contrat `IQuestion` (bandeau supérieur : 7 mots max, étiquettes cibles : 1 à 2 mots max).
- **#10 — Tech: Algorithme d'Elo Pédagogique** : Ajustement du niveau des questions et de la vitesse des cibles en temps réel + file prioritaire de répétition espacée (*Spaced Repetition Queue*).
- **#9 — Data: Import des 200 premières questions** : Corpus initial JSON structuré couvrant les 5 piliers du Bulletin Officiel (Fin de Cycle 3 / 6ème).

#### Référentiel des 5 Domaines Pédagogiques (Cible complète : 600 micro-défis, Jalon M1 : 200 premières questions) :
1. **Mathématiques** (`mathematiques`) : Tables de multiplication jusqu'à 12, divisions euclidiennes simples, fractions décimales ($1/2 = 0,5$, $1/4 = 0,25$), conversions d'unités (m, km, g, kg, L), périmètres et aires (carré, rectangle), priorités opératoires de début de 6ème.
2. **Français** (`francais`) : Homophones grammaticaux (*a/à, et/est, son/sont, ces/ses, ou/où*), accords Sujet-Verbe complexes (sujet inversé ou éloigné), terminaisons verbales (*-é / -er / -ait / -aient*), nature des mots (nom, adjectif, déterminant, pronom), préfixes et suffixes.
3. **Anglais LV1** (`anglais`) : Vocabulaire du quotidien et de l'école, pronoms personnels, auxiliaires *Be* et *Have*, mots interrogatifs (*Where, When, Who, What, How many*), nombres jusqu'à 100, couleurs et jours de la semaine.
4. **Histoire-Géo, Sciences & EMC** (`histoire_geo_sciences`) : Grandes périodes historiques (Préhistoire, Antiquité, Moyen Âge, Temps Modernes, Époque Contemporaine), repères géographiques (continents, océans, métropoles françaises), système solaire, états de la matière, chaîne alimentaire.
5. **Vie au Collège & Méthodologie** (`vie_au_college`) : Lecture d'emploi du temps (Semaine A / Semaine B, numérotation des salles par étage : Salle 204 = 2ème étage), rôle des adultes (CPE, Principal, Professeur Principal, Documentaliste au CDI), lecture de consignes doubles, préparation du cartable la veille.

#### Formule de l'Algorithme d'Elo Pédagogique & Répétition Espacée :
Chaque compétence $k$ (`skill_code`) possède un score de maîtrise caché $E_k$ initialisé à `1000` (borné sur l'échelle `600` à `1600`). Après chaque interaction en arène :
$$E_{k(\text{nouveau})} = E_{k(\text{ancien})} + K \times (S_{\text{réel}} - S_{\text{attendu}})$$
- $K = 32$
- $S_{\text{réel}} = 1$ si la bonne cible est touchée du premier coup en moins de `4 secondes` (`< 4000 ms`)
- $S_{\text{réel}} = 0,7$ si la bonne cible est touchée entre `4 et 8 secondes` (`4000 ms <= t <= 8000 ms`)
- $S_{\text{réel}} = 0$ en cas d'erreur ou au-delà de `8 secondes`
- Probabilité attendue de réussite :
  $$S_{\text{attendu}} = \frac{1}{1 + 10^{(D_{\text{question}} - E_k) / 400}}$$
- **Spaced Repetition Queue** : Toute question échouée (`S_réel = 0`) est placée dans une file prioritaire pour réapparaître sous une forme légèrement différente **2 parties plus tard**.

#### Contrat JSON `QuestionProvider` :
```json
{
  "id": "COL_ORG_019",
  "subject": "vie_au_college",
  "skill_code": "COL_EDT",
  "elo_difficulty": 1050,
  "hud_prompt": "Tu as cours en Salle 204 : quel étage ?",
  "explanation_flash": "Astuce Collège : Salle 204 = 2ème étage, porte 04 !",
  "targets": [
    { "label": "2e étage", "is_correct": true },
    { "label": "Rez-de-chaussée", "is_correct": false },
    { "label": "4e étage", "is_correct": false },
    { "label": "Sous-sol", "is_correct": false }
  ]
}
```

---

### Agent 3 : `MODES` (Branche `feat/modes-arenas`)

#### Issues prises en charge (5 Modes de Jeu) :

| Issue | Mode de Jeu | Inspiré de | Format & Durée | Mécanique de Gameplay & Compétence Ciblée |
| :---: | :--- | :--- | :--- | :--- |
| **#11** | **1. Chasse aux Bonnes Notes** | Razzia de Gemmes (*Gem Grab*) | `3v3` (alliés IA) • `135s` (2m15) | Le puits central éjecte des gemmes numériques ou lexicales. L'énoncé en haut de l'écran change toutes les `12 secondes`. Tirer sur une gemme exacte la transforme en cristal bleu à ramasser. À `10 cristaux`, le compte à rebours de `15 secondes` se lance. |
| **#12** | **2. Le Match des Accords** | Brawl Ball | `3v3` • `120s` (2m00) ou `2 buts` | Une phrase à trou s'affiche sur le ballon central (ex. : *« Les joueurs ont ___ le match »*). Le camp adverse possède deux cages côte à côte : la cage gauche affiche `-É`, la cage droite affiche `-ER`. Il faut dribbler les défenseurs et tirer dans la bonne cage. |
| **#13** | **3. L'Interro Surprise** | Survivant (*Showdown*) | `Solo` (10 joueurs IA) • `150s` (2m30) | Le nuage toxique est remplacé par la **Sonnerie de Fin d'Heure** qui réduit la taille de la cour. Le joueur brise des caisses d'énergie en tirant sur la bonne étiquette pour augmenter ses PV et ses dégâts avant le duel final au centre. |
| **#14** | **4. Changement de Salle** | Zone Réservée (*Hot Zone*) | `Solo / Coop` • `120s` (2m00) | **Spécial Autonomie 6ème** : Un extrait d'emploi du temps s'affiche (ex. : *« Semaine B - 10h : SVT en Salle 204 »*). Le joueur doit se frayer un chemin dans les couloirs, éviter les « Ralentisseurs de Bavardage » et capturer le cercle de la Salle 204 avant la sonnerie. |
| **#15** | **5. Le Conseil de Classe** | Combat de Boss (*Boss Fight*) | `PVE Boss` • `150s` (2m30) | Affrontement contre un Boss géant (*Giga-Fraction* ou *Le Seigneur du Passé Simple*). Le Boss balaye l'arène d'un mur laser ne laissant qu'un couloir de sécurité identifié par la bonne réponse à l'énigme affichée. |

---

### Agent 4 : `META-Dash` (Branche `feat/meta-parent-db`)

#### Issues prises en charge :
- **#6 — Tech: Base SQLite locale** : Stockage 100% hors-ligne (`player_profile`, `skill_mastery`, `combat_telemetry_log`).
- **#3 — US-03: Casier Mystère (Starr Drop)** : Route vers la 6ème (`0` à `1000` Trophées : du palier *Rentrée CM2* jusqu'à *Major de 6ème*). Ouverture en 4 tapotements avec probabilité de montée en rareté (`Rare` → `Super Rare` → `Épique` → `Légendaire`), octroyant Pièces, Trophées, Skins, Badges et Points de Savoir (modèle 100% éthique sans Pay-to-Win).
- **#4 — US-04: Dashboard Parent** : Onglet *Carnet Parent* protégé par code PIN (`parent_pin_hash`, défaut `'0000'`), affichant le taux de réussite exact par matière, le temps de réaction moyen et la liste des notions à consolider.

#### Schéma SQLite Local :
```sql
CREATE TABLE player_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nickname TEXT NOT NULL DEFAULT 'Timo',
  trophies INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 250,
  starr_drops_available INTEGER NOT NULL DEFAULT 1,
  selected_brawler TEXT NOT NULL DEFAULT 'TIMO',
  parent_pin_hash TEXT NOT NULL DEFAULT '0000'
);

CREATE TABLE skill_mastery (
  skill_code TEXT PRIMARY KEY, -- ex: 'MATH_FRAC', 'FR_HOMO', 'COL_EDT'
  subject_category TEXT NOT NULL,
  elo_rating INTEGER NOT NULL DEFAULT 1000,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  avg_response_ms INTEGER NOT NULL DEFAULT 3500,
  last_seen_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE combat_telemetry_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id TEXT NOT NULL,
  brawler_used TEXT NOT NULL,
  is_hit_correct BOOLEAN NOT NULL,
  reaction_time_ms INTEGER NOT NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Critères d'Acceptation Gherkin (User Stories US-01 à US-04)

| ID Story | Issue | En tant que... | Je veux... | Critère d'Acceptation (Gherkin : Given / When / Then) |
| :---: | :---: | :--- | :--- | :--- |
| **US-01** | **#1** | Joueur CM2 | Contrôler mon héros au double stick et tirer sur la cible portant la bonne réponse | **GIVEN** une partie active avec la consigne « 7 × 8 ? »<br>**WHEN** je tire avec Timo sur le drone portant l'étiquette 56<br>**THEN** le drone subit 950 dégâts, ma jauge de Super monte de 40% et une nouvelle vague apparaît à sa destruction. |
| **US-02** | **#2** | Joueur CM2 | Déclencher mon attaque Super lorsque ma jauge est pleine | **GIVEN** une jauge de Super à 100%<br>**WHEN** j'appuie sur le bouton jaune Super<br>**THEN** mon héros déclenche son ultime (ex. *Tacle Pythagore*), élimine automatiquement la bonne cible présente à l'écran et marque +2 points d'objectif. |
| **US-03** | **#3** | Joueur CM2 | Ouvrir un Casier Mystère (Starr Drop) toutes les 3 étoiles de combat | **GIVEN** un Casier Mystère disponible au lobby<br>**WHEN** je tapote 4 fois sur le casier à l'écran<br>**THEN** le casier a une probabilité de monter en rareté (Rare → Super Rare → Épique → Légendaire) avec retour visuel et crédite mon compte en Pièces et Trophées. |
| **US-04** | **#4** | Parent | Consulter le tableau de bord caché pour identifier les forces et lacunes de mon enfant | **GIVEN** l'écran d'accueil du jeu<br>**WHEN** j'ouvre l'onglet *Carnet Parent*<br>**THEN** je visualise le taux de réussite exact par matière (Maths, Français, Anglais, Histoire-Géo, Vie au Collège), le temps de réaction moyen et la liste des notions à consolider. |
