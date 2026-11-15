# Brawl Collège : Opération 6ème

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Phaser 3 WebGL](https://img.shields.io/badge/Phaser_3_WebGL-60_FPS_Isométrique-8B5CF6?style=for-the-badge&logo=webgl&logoColor=white)
![SQLite Offline](https://img.shields.io/badge/SQLite-100%25_Offline_RGPD-0EA5E9?style=for-the-badge&logo=sqlite&logoColor=white)
![PWA Tablette](https://img.shields.io/badge/PWA_Tablette-iPadOS_%26_Android-10B981?style=for-the-badge&logo=pwa&logoColor=white)
![Neuro-Inclusive](https://img.shields.io/badge/Neuro--Inclusive-TSA_%7C_TDAH_%7C_Dys-F59E0B?style=for-the-badge)
![Éducation Nationale Cycle 3](https://img.shields.io/badge/%C3%89ducation_Nationale-Cycle_3_CM2_%E2%86%92_6%C3%A8me-EF4444?style=for-the-badge)

> **Référence :** `CCTP-BC6E-2026-V2`  
> **Principe « Zéro Friction Scolaire » :** le joueur ne s'arrête jamais de jouer pour remplir un formulaire ou lire un long paragraphe. Le réflexe cognitif (calculer, accorder, traduire, s'orienter dans les couloirs du collège) fusionne avec le réflexe moteur du double stick tactile en **moins de 3 secondes**.

📄 **[Consulter le Dossier de Présentation Institutionnel EdTech → `docs/PITCH_EDTECH_INSTITUTIONNEL.md`](docs/PITCH_EDTECH_INSTITUTIONNEL.md)**

---

## 🎯 Vision du Projet

**Brawl Collège : Opération 6ème** prépare les élèves de **CM2 et 6ème (Fin de Cycle 3)** à réussir leur entrée au collège grâce à un jeu d'action en arène **60 FPS** à caméra isométrique inclinée à `50°` (`+35 %` de visibilité vers le haut de l'écran) :

* **Consignes flash ultracourtes :** bandeau supérieur de **7 mots max** et étiquettes-cibles de **1 à 2 mots max**.
* **Algorithme d'Elo Pédagogique ($K = 32$) :** adapte en temps réel la difficulté des questions (`600` à `1600`) et la vitesse des cibles (`0,75x` à `1,45x`), avec file de **répétition espacée** à +2 parties sur les notions échouées.
* **Modèle 100 % éthique & RGPD-by-Design :** zéro publicité, zéro achat intégré (*Pay-to-Win*), zéro serveur externe — toute la progression est persistée localement via **SQLite hors-ligne**.

---

## 🦸 Les 4 Élèves-Héros (Roster Initial)

Chaque héros incarne un archétype tactique de combat et une matière de prédilection du programme de 6ème (stats Niveau 1, `3` barres de munitions, `3` charges de Gadget par partie) :

| Héros | Titre & Archétype | Matière(s) | PV (Niv. 1) | Vitesse | Attaque de Base (`D_base`) | Super (Bouton Jaune) | Gadget (Bouton Vert ×3) |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **TIMO** | *Le Stratège du Stade*<br>Tireur d'Élite / Mobile | Mathématiques & Logique | `3200` | Rapide (`770`) | **Frappe Brossée** — Ballon d'énergie rapide à longue portée (`950` dégâts) | **Tacle Pythagore** — Sprint fulgurant qui repousse les ennemis et valide instantanément la bonne cible | **Vision de Jeu** — Entoure la bonne réponse d'un halo doré pendant `4s` |
| **LÉO** | *L'Alchimiste des Mots*<br>Artilleur de Zone | Français & Conjugaison | `2800` | Normale (`720`) | **Fiole d'Encre** — Tir en cloche par-dessus les murs créant une flaque (`880` dégâts) | **Le Grand Robert** — Tourelle-dictionnaire à rayons correcteurs soignant les alliés de `400 PV/s` (`6s`) | **Brouillon Propre** — Efface une mauvaise cible de l'arène |
| **MAYA** | *La Gardienne du Temps*<br>Tank / Contrôle | Histoire-Géo, Sciences & EMC | `5200` | Normale (`720`) | **Onde Sismique** — Cône large à courte portée (`1100` dégâts) | **Rempart Chronologique** — Bouclier absorbant `6000` dégâts et figeant les ennemis proches (`2,5s`) | **Boussole du CDI** — Flèche au sol vers la salle ou la cible exacte (`4s`) |
| **ZACK** | *Le Geek Bilingue*<br>Assassin Furtif | Anglais LV1 & Vie au Collège | `3000` | Très Rapide (`820`) | **Double Beat** — Deux salves sonores ultra-rapides en ligne droite (`2 × 520` dégâts) | **Teleport-Bus** — Téléportation sur la bonne réponse avec bouclier de `1500 PV` (`3s`) | **Pause Récré** — Ralentit tous les ennemis de l'arène de `50 %` pendant `3,5s` |

### Formules du Moteur de Combat (`src/engine/CombatMath.ts`)
* **Dégâts sur bonne cible :** $D_{\text{final}} = D_{\text{base}} \times (1 + 0{,}08 \times (N_{\text{niveau}} - 1)) \times M_{\text{combo}}$ avec $M_{\text{combo}} \in [1{,}00 ; 1{,}60]$ (`+0,15` par bonne réponse consécutive).
* **Charge de Super :** $G_{\text{super}} = 34\% + (6\% \times V_{\text{réflexe}})$ où $V_{\text{réflexe}} = 1$ sous `2500 ms` (Super prêt en 3 tirs réflexes).
* **Erreur pédagogique :** onde de choc de `12 % × PV_max`, remise à `1,0` du combo et affichage d'une bulle corrective flash (`explanation_flash`) pendant `1200 ms`.

---

## 🎮 Les 6 Modes de Jeu

Les **5 modes d'arène** tournent automatiquement d'heure en heure (`getHourlyRotatedMode`) et sont complétés par le **Mode 6 en monde ouvert** :

| # | Mode de Jeu | Inspiration | Format & Durée | Mécanique & Compétence Clé |
| :-: | :--- | :--- | :---: | :--- |
| **1** | **Chasse aux Bonnes Notes** | Razzia de Gemmes (*Gem Grab*) | `3v3` • `135s` | Le puits central éjecte des gemmes numériques ou lexicales (nouvel énoncé toutes les `12s`). Tire sur la bonne gemme pour récupérer un cristal bleu ; tiens `10` cristaux pendant `15s`. |
| **2** | **Le Match des Accords** | *Brawl Ball* | `3v3` • `120s` ou `2` buts | Une phrase à trou s'affiche sur le ballon (*« Les joueurs ont ___ le match »*). Dribble et marque dans la bonne cage grammaticale (`-É` ou `-ER`). |
| **3** | **L'Interro Surprise** | Survivant (*Showdown*) | `Solo (10 IA)` • `150s` | La **Sonnerie de Fin d'Heure** rétrécit la cour. Brise les caisses d'énergie portant la bonne étiquette pour renforcer tes PV et dégâts avant le duel final. |
| **4** | **Changement de Salle** | Zone Réservée (*Hot Zone*) | `Solo / Coop` • `120s` | **Spécial Autonomie 6ème :** décode l'extrait d'emploi du temps (*« Semaine B - 10h : SVT en Salle 204 »*), esquive les bavardages et capture la bonne salle à `100 %`. |
| **5** | **Le Conseil de Classe** | Combat de Boss (*Boss Fight*) | `PvE Boss` • `150s` | Affronte un Boss géant (`Giga-Fraction` ou `Le Seigneur du Passé Simple`). Réfugie-toi dans le couloir identifié par la bonne réponse lors du balayage laser. |
| **6** | **Exploration du Collège 3D** | Monde Ouvert RPG | `Libre` • `2400×1800` | Explore **10 salles** (Cour d'Honneur, Hall des Casiers, Vie Scolaire CPE, CDI, Salles 101/102/201/204, Cantine, Gymnase), parle à **9 PNJ**, collecte **12 badges**, accomplis **12 quêtes** et traverse les portails d'arène. |

---

## 🛡️ Prévention, Neuro-Inclusion & Suivi Familial

### Bouclier Citoyen & Prévention Active (`3018` / `119` / `3114`)
* **Zéro toxicité sociale :** aucun chat ouvert ni messagerie non modérée entre joueurs.
* **Compétences Psycho-Sociales (`COL_CPS`, `COL_ADU`, `COL_LIEUX`) :** scénarios interactifs contre le harcèlement scolaire (refuser de filmer, liker ou relayer une moquerie ; savoir dire non), valorisation du rôle d'écoute de la **Vie Scolaire** (M. Touré, CPE) et de l'**infirmière scolaire**, et mémorisation des numéros nationaux gratuits :
  * **3018** : lutte contre le harcèlement et le cyberharcèlement ;
  * **119** : Allô Enfance en Danger ;
  * **3114** : prévention du mal-être et de la détresse psychologique.

### Neuro-Inclusion Native (TSA, TDAH, Dyslexie, Dyspraxie, Dyscalculie)
* **Accessibilité intégrée (`IAccessibilitySettings`) :** visée assistée intelligente (`smart_auto_aim`), flèche GPS dorée permanente (`visual_gps_compass`), **Mode Confort** (`calm_mode`, `-20 %` de vitesse des cibles et lasers) et indice automatique (`auto_hint_assist`) après 2 erreurs ou 9 secondes d'hésitation.
* **Module Neuro-Ergonomie (`feat/m7-neuro-tts`) :**
  * `SpeechReader` : synthèse vocale **TTS `fr-FR` hors-ligne** avec lecture naturelle des formules (`×` → *« fois »*, `÷` → *« divisé par »*, `___` → *« à compléter »*) ;
  * `KeywordHighlighter` : surligneur sémantique colorisant négations (`#ff4d6d`), nombres/unités (`#facc15`) et verbes/accords (`#38bdf8`) ;
  * `AntiTiltGuard` : après `3` erreurs consécutives, ralentit les cibles (`× 0,72` puis `× 0,62`), divise les dégâts d'erreur par `2`, retire un leurre et propose une question de confiance.

### Casiers Mystères Éthiques & Carnet Parent (`PIN : 0000`)
* **Route vers la 6ème (`0 → 1000` Trophées) :** progression de *Rentrée CM2* à *Major de 6ème* avec ouverture de **Casiers Mystères** (*Rare → Super Rare → Épique → Légendaire*) gagnés uniquement au mérite scolaire.
* **Carnet Parent (`src/ui/ParentDashboard.ts`) :** verrouillé par code PIN (`0000` par défaut), il affiche le radar de réussite sur les 5 matières du BO, le temps de réaction moyen, le score de sérénité, les repères d'autonomie acquis (*Salle 204*, *CDI*, *Vie Scolaire*, *Emploi du temps*) et des astuces d'accompagnement à la maison.

---

## 🏗️ Architecture du Dépôt

```text
college_star/
├── docs/
│   ├── Cahier des Charges - Brawl College Operation 6eme.pdf
│   └── PITCH_EDTECH_INSTITUTIONNEL.md   # Dossier institutionnel EdTech complet
├── src/
│   ├── types/cctp.ts                    # Contrats TypeScript partagés (CCTP-BC6E-2026-V2)
│   ├── engine/                          # Moteur 60 FPS isométrique/3D, CampusEngine, CombatMath, TwinStick
│   ├── entities/                        # Roster des 4 Élèves-Héros & rendu 3D/Canvas
│   ├── services/                        # EloEngine (K=32), QuestionProvider, QuestService, SoundManager
│   ├── data/                            # 215 micro-défis Cycle 3 (questions_200.json) & 12 quêtes du collège
│   ├── modes/                           # Modes 1 à 5 en rotation + Carte 2400x1800 & Mode 6 Exploration
│   ├── db/LocalSQLiteDB.ts              # Base SQLite locale 100 % hors-ligne (RGPD-by-Design)
│   └── ui/                              # Carnet Parent PIN, Casiers Mystères, Carnet de Quêtes, Preview 3D
├── test/                                # Tests unitaires et validation fonctionnelle
├── index.html                           # Point d'entrée paysage tactile
├── package.json                         # Scripts Vite + TypeScript
└── AGENTS.md                            # Architecture Multi-Agents & spécifications
```

> **Branches spécialisées du dépôt :** les chantiers modulaires complémentaires sont également versionnés sur leurs branches dédiées (`feat/m4-phaser-webgl` pour les scènes Phaser WebGL 2.5D + GSAP, `feat/m7-neuro-tts` pour `SpeechReader` / `KeywordHighlighter` / `AntiTiltGuard`, `feat/m5-pwa-qa` pour le Service Worker hors-ligne `sw.js`, `feat/m7-rpg-gadgets` pour les niveaux 1–11 et gadgets scolaires).

---

## 🚀 Lancement Rapide

### Prérequis
* **Node.js** `>= 18` et **npm** `>= 9`

### Installation & Démarrage en local
```bash
npm install
npm run dev
```
Ouvre ensuite l'URL locale affichée par Vite (par défaut `http://localhost:5173`) dans un navigateur bureau ou tablette (orientation paysage recommandée).

### Vérification & Build de Production
```bash
npm run typecheck
npm run build
npm run preview
```
