# Dossier de Présentation Institutionnel — *Brawl Collège : Opération 6ème*

> **Référence documentaire :** `CCTP-BC6E-2026-V2`  
> **Public cible :** Ministère de l'Éducation Nationale, Rectorats, Collectivités Territoriales, Chefs d'établissement, Équipes éducatives (Cycle 3 : CM2 / 6ème), Fondations et Partenaires EdTech  
> **Principe directeur MOA (« Zéro Friction Scolaire ») :** Le joueur ne s'arrête jamais de jouer pour remplir un formulaire ou lire un long paragraphe. Le réflexe cognitif (calculer, accorder, traduire, s'orienter dans les couloirs du collège) est fusionné avec le réflexe moteur du double stick tactile en moins de 3 secondes.

---

## Synthèse Exécutive

**Brawl Collège : Opération 6ème** est un jeu d'action pédagogique en temps réel (60 FPS) conçu pour sécuriser la transition **CM2 → 6ème** (fin de Cycle 3). En reprenant les codes d'ergonomie tactile plébiscités par les préadolescents — caméra isométrique inclinée, contrôle au double stick (*twin-stick*), parties nerveuses de 120 à 150 secondes, 4 Élèves-Héros complémentaires et 6 modes de jeu — l'application transforme l'entraînement aux savoirs fondamentaux et aux codes de la vie collégienne en réflexe ludique pur.

À la différence des applications commerciales grand public et des exerciseurs scolaires traditionnels, le projet repose sur cinq engagements structurels :

1. **Zéro friction scolaire :** bandeau de consigne limité à **7 mots maximum** et étiquettes-cibles de **1 à 2 mots maximum**, intégrés directement dans l'arène.
2. **Adaptation algorithmique individuelle (Elo $K=32$) :** ajustement en temps réel de la difficulté des questions et de la vitesse des cibles, couplé à une file de répétition espacée (*Spaced Repetition Queue*).
3. **Neuro-inclusion native (TSA, TDAH, troubles « Dys ») :** synthèse vocale hors-ligne `fr-FR`, surligneur sémantique des mots-clés critiques, garde-fou anti-frustration (*Anti-Tilt Guard*), visée assistée, boussole GPS au sol et Mode Confort sensoriel.
4. **Bouclier Citoyen & Prévention active :** intégration diégétique de la lutte contre le harcèlement scolaire, des compétences psychosociales (`COL_CPS`), du pôle Vie Scolaire (CPE) et des numéros d'urgence et d'écoute nationaux (**3018**, **119**, **3114**).
5. **Souveraineté des données & RGPD-by-Design :** architecture **100 % hors-ligne** sans serveur tiers ni collecte publicitaire, reposant sur un moteur WebGL / 3D isométrique fluide et une base **SQLite locale** (`LocalSQLiteDB`) embarquée en PWA tablette.

---

## 1. Constat Terrain : La Rupture CM2 → 6ème (Fin de Cycle 3)

L'entrée en classe de 6ème constitue l'une des transitions les plus sensibles de la scolarité obligatoire, cumulant une rupture **pédagogique**, **organisationnelle** et **émotionnelle** :

### 1.1 Le choc organisationnel du collège
* **Fragmentation des repères :** l'élève passe d'un enseignant polyvalent et d'une salle unique en CM2 à 8 à 10 professeurs différents, autant de salles spécialisées et des changements de salle toutes les 55 minutes.
* **Codes institutionnels implicites :** lecture d'un emploi du temps à alternance **Semaine A / Semaine B**, décodage de la numérotation des salles par étage (ex. *Salle 204 = 2ème étage, porte 04*), gestion autonome du casier (récréation / pause méridienne), de la carte de demi-pension et du cartable préparé la veille.
* **Méconnaissance des adultes ressources :** crainte fréquente face à la *Vie Scolaire* perçue comme purement punitive, alors que le **CPE**, le **Professeur Principal**, la **Documentaliste du CDI** et l'**Infirmière scolaire** constituent un filet d'aide et d'écoute.

### 1.2 L'essoufflement des exerciseurs scolaires classiques
* Les plateformes de révision reposant sur des QCM statiques ou des formulaires séquentiels reproduisent la forme scolaire descendante : l'élève en difficulté y voit une prolongation anxiogène des devoirs et décroche rapidement.
* À l'inverse, les jeux mobiles d'arène captent massivement l'attention des 9–12 ans grâce au feedback immédiat, au rythme court et au sentiment de maîtrise motrice — mais au prix de boucles de monétisation agressives (*Pay-to-Win*, *loot boxes* payantes), d'une surcharge sensorielle et d'une absence totale de valeur éducative.

### 1.3 Le besoin d'automatisation sans anxiété
* La réussite en 6ème dépend largement de l'automatisation des réflexes de base : tables de multiplication, fractions usuelles ($1/2 = 0{,}5$, $1/4 = 0{,}25$), homophones grammaticaux, accords sujet-verbe, lexique anglais courant et repères historiques/géographiques.
* **L'objectif de *Brawl Collège : Opération 6ème*** est de réconcilier exigence du Bulletin Officiel et plaisir de jeu natif, sans jamais stigmatiser l'erreur.

---

## 2. Positionnement Stratégique : Tableau Comparatif

| Critère d'évaluation | Exerciseurs EdTech classiques | *Brawl Stars* commercial | *Brawl Collège : Opération 6ème* |
| :--- | :--- | :--- | :--- |
| **Boucle de gameplay** | QCM statiques, clics séquentiels, attente passive | Action *twin-stick* 60 FPS rapide, mais sans finalité scolaire | **Action *twin-stick* 60 FPS** où chaque cible dans l'arène porte une réponse pédagogique à viser et valider en $< 3\text{ s}$ |
| **Charge cognitive de lecture** | Consignes longues, formulaires multi-lignes | Nulle (uniquement combat) | **Zéro Friction :** bandeau supérieur $\le 7$ mots, étiquettes-cibles de 1 à 2 mots maximum |
| **Adaptativité pédagogique** | Parcours linéaires ou niveaux fixes | *Matchmaking* compétitif source de frustration | **Algorithme Elo Pédagogique ($K=32$)** par compétence + **répétition espacée** automatique après 2 parties |
| **Modèle économique & Éthique** | Licences payantes, freemium bridé | *Free-to-play* avec micro-transactions, *Pay-to-Win* et *dark patterns* | **100 % gratuit, zéro publicité, zéro achat intégré** : Casiers Mystères débloqués uniquement par les étoiles de combat et les quêtes |
| **Protection des données (RGPD)** | Comptes cloud nominatifs, serveurs distants, suivi analytique | Collecte comportementale massive, télémétrie publicitaire | **100 % hors-ligne (SQLite local)** : aucune donnée nominative, aucun compte requis, zéro flux réseau externe |
| **Neuro-inclusion (TSA / TDAH / Dys)** | Souvent absente ou réduite à une police agrandie | Surcharge lumineuse, secousses violentes, *tilt* compétitif | **Native :** TTS `fr-FR` hors-ligne, surligneur sémantique couleur, *Anti-Tilt Guard*, visée assistée, boussole GPS, Mode Confort |
| **Citoyenneté & Prévention** | Absente | Risques liés aux chats et clubs non modérés | **Bouclier Citoyen intégré :** zéro chat toxique, scénarios CPS (`COL_CPS`), numéros **3018 / 119 / 3114** & pôle CPE |
| **Préparation concrète à la 6ème** | Exercices disciplinaires hors-sol | Arènes abstraites sans lien avec le réel | **Mode 6 Monde Ouvert (`2400×1800`)** à 10 salles, 9 PNJ (CPE, CDI, professeurs, déléguée) et 12 quêtes d'autonomie |
| **Suivi Famille / Équipe éducative** | Tableaux de bord distants complexes | Aucun retour éducatif | **Carnet Parent protégé par PIN (`0000`)** : radar de réussite par matière, score de sérénité, notions à consolider & astuces parentales |

---

## 3. Piliers Pédagogiques (Cycle 3) & Algorithme Elo ($K=32$)

### 3.1 Les 5 Piliers du Bulletin Officiel (Fin de Cycle 3 / 6ème)

Le corpus structuré (`src/data/questions_200.json`, **215 micro-défis initiaux** respectant le contrat `IQuestion` vers une cible de 600 défis) couvre l'intégralité des 5 domaines clés du passage CM2 → 6ème :

| Pilier (`SubjectCategory`) | Compétences ciblées (`skill_code`) | Exemples de réflexes travaillés |
| :--- | :--- | :--- |
| **Mathématiques** (`mathematiques`) | `MATH_MUL`, `MATH_DIV`, `MATH_FRAC`, `MATH_CONV`, `MATH_GEOM`, `MATH_PRIO` | Tables jusqu'à 12, divisions euclidiennes, fractions décimales ($1/2$, $1/4$), conversions (`m/km`, `g/kg`, `L/cL`), périmètres/aires, priorités opératoires |
| **Français** (`francais`) | `FR_HOMO`, `FR_ACC`, `FR_TERM`, `FR_NAT`, `FR_PREF` | Homophones (*a/à*, *et/est*, *son/sont*, *ces/ses*, *ou/où*), accords sujet-verbe complexes, terminaisons (`-é / -er`, `-ait / -aient`), nature des mots, préfixes & suffixes |
| **Anglais LV1** (`anglais`) | `ANG_VOC`, `ANG_PRON`, `ANG_AUX`, `ANG_INT`, `ANG_NUM` | Lexique du quotidien et du collège, pronoms personnels, auxiliaires *Be* et *Have*, mots interrogatifs (*Where, When, Who, What, How many*), nombres jusqu'à 100 |
| **Histoire-Géo, Sciences & EMC** (`histoire_geo_sciences`) | `HG_PER`, `HG_GEO`, `SCI_SOL`, `SCI_MAT`, `SCI_VIV` | Grandes périodes historiques, repères géographiques (continents, océans, métropoles), système solaire, états de la matière, chaîne alimentaire |
| **Vie au Collège & Méthodologie** (`vie_au_college`) | `COL_EDT`, `COL_ADU`, `COL_CONS`, `COL_SAC`, `COL_STRESS`, `COL_CPS`, `COL_LIEUX` | Lecture d'emploi du temps (Semaine A/B, Salle 204 = 2e étage), rôle des adultes (CPE, Principal, Documentaliste CDI, Infirmière), préparation du cartable, gestion du stress et prévention |

### 3.2 L'Algorithme d'Elo Pédagogique ($K = 32$) & Répétition Espacée

Dans `src/services/EloEngine.ts`, chaque compétence $k$ (`skill_code`) possède un indice de maîtrise caché $E_k$ initialisé à `1000` et borné sur l'intervalle `[600 ; 1600]`. À chaque interaction en arène, le moteur ajuste dynamiquement le niveau :

$$S_{\text{attendu}} = \frac{1}{1 + 10^{(D_{\text{question}} - E_k) / 400}}$$

$$E_{k(\text{nouveau})} = E_{k(\text{ancien})} + K \times (S_{\text{réel}} - S_{\text{attendu}}) \quad \text{avec } K = 32$$

La valeur du score réel $S_{\text{réel}}$ récompense à la fois **l'exactitude** et **l'automatisation cognitive** (temps de réaction mesuré dès l'affichage du bandeau) :
* $S_{\text{réel}} = 1$ : bonne cible touchée du premier coup en **moins de 4 secondes** (`< 4000 ms`) ;
* $S_{\text{réel}} = 0{,}7$ : bonne cible touchée du premier coup entre **4 et 8 secondes** (`4000 ms <= t <= 8000 ms`) ;
* $S_{\text{réel}} = 0$ : erreur de cible ou temps de réponse supérieur à 8 secondes.

Trois mécanismes complètent l'Elo en temps réel :
1. **Adaptation dynamique de la vitesse en arène :** la vitesse des cibles s'ajuste continûment de `0,75x` (Elo `600`) à `1,45x` (Elo `1600`) pour maintenir l'élève dans sa *zone proximale de développement*.
2. **File prioritaire de répétition espacée (*Spaced Repetition Queue*) :** toute question échouée ($S_{\text{réel}} = 0$) est automatiquement placée en file prioritaire pour réapparaître **2 parties plus tard** (`SPACED_REPETITION_MATCH_DELAY = 2`), avec suivi de révision (`J+1` / `J+3`).
3. **Boucle de combat formatrice (`CombatMath.ts`) :**
   * **Dégâts sur bonne réponse :** $D_{\text{final}} = D_{\text{base}} \times (1 + 0{,}08 \times (N_{\text{niveau}} - 1)) \times M_{\text{combo}}$, où $M_{\text{combo}}$ progresse de `1,00` à `1,60` par paliers de `+0,15`.
   * **Charge de Super :** $G_{\text{super}} = 34\% + (6\% \times V_{\text{réflexe}})$ avec $V_{\text{réflexe}} = 1$ sous `2500 ms` (Super chargé en 3 tirs réflexes parfaits).
   * **Correction flash non punitive :** en cas d'erreur, l'onde de choc est bornée à $P_{\text{erreur}} = 12\% \times PV_{\text{max}}$, le combo revient à `1,0`, et une bulle corrective (`explanation_flash`) s'affiche immédiatement pendant `1200 ms` pour ancrer la bonne règle sans interrompre la partie.

---

## 4. Neuro-Inclusion Native : TSA, TDAH et Troubles « Dys »

L'accessibilité cognitive et sensorielle n'est pas un module annexe : elle est intégrée dans l'architecture de l'application (`src/types/cctp.ts` et module d'accessibilité dédié sur `feat/m7-neuro-tts`) afin de garantir l'égalité d'accès aux élèves présentant un **Trouble du Spectre de l'Autisme (TSA)**, un **TDAH** ou des troubles **« Dys »** (**Dyslexie**, **Dyspraxie**, **Dyscalculie**).

### 4.1 Synthèse Vocale Hors-Ligne (`SpeechReader` — TTS `fr-FR`)
* **Bénéfice Dyslexie & lecteur lent :** lecture audio instantanée et non-bloquante des énoncés via `window.speechSynthesis` avec sélection automatique d'une voix locale française (`fr-FR`), sans connexion Internet.
* **Normalisation mathématique et scolaire :** le moteur reformule automatiquement les symboles abstraits pour une écoute naturelle (`×` → *« fois »*, `÷` → *« divisé par »*, `+` → *« plus »*, `___` → *« à compléter »*), réduisant le coût du décodage grapho-phonologique.

### 4.2 Surligneur Sémantique (`KeywordHighlighter`)
* **Bénéfice TDAH, Dyscalculie & Dyslexie :** coloration automatique à haut contraste des jetons critiques directement dans la consigne :
  * **Négations & pièges logiques** (`ne`, `pas`, `jamais`, `intrus`, `faux`, `sauf`) en rouge corail (`#ff4d6d`) pour freiner les réponses impulsives ;
  * **Nombres, mesures & opérateurs** (`7 × 8`, `km`, `cm²`, fractions) en jaune or (`#facc15`) pour isoler visuellement les grandeurs ;
  * **Verbes, accords & blancs à compléter** (`est/sont`, `participe`, `___`) en bleu azur (`#38bdf8`) pour guider le repérage grammatical.

### 4.3 Garde-Fou Anti-Frustration (`AntiTiltGuard`)
* **Bénéfice régulation émotionnelle (TSA / TDAH / anxiété de performance) :** dès **3 erreurs consécutives** (`ANTI_TILT_ERROR_THRESHOLD = 3`), le système active silencieusement un mode protecteur :
  * ralentissement progressif des cibles mobiles (`× 0,72`, puis `× 0,62` à 5 erreurs, et `× 0,82` durant la phase de reprise) ;
  * division par deux des dégâts d'onde de choc sur erreur (`errorDamageMultiplier = 0.5`) ;
  * suppression d'un leurre et sélection d'une **question de confiance** accompagnée d'un message bienveillant (*« Respire ! Voici un défi accessible pour reprendre confiance »*).

### 4.4 Ergonomie Motrice & Sensorielle (`IAccessibilitySettings`)
* **Visée assistée intelligente (`smart_auto_aim`)** pour compenser les difficultés de motricité fine (**Dyspraxie**) sur écran tactile.
* **Flèche GPS dorée au sol (`visual_gps_compass`)** guidant l'élève vers l'objectif ou la salle demandée.
* **Mode Confort (`calm_mode`)** réduisant de 20 % la vitesse des drones et lasers et atténuant la stimulation visuelle (**TSA** / hypersensibilité sensorielle).
* **Indice automatique (`auto_hint_assist`)** déclenché après 2 erreurs ou 9 secondes d'hésitation, complété par une bulle explicative structurée en arbre logique.

---

## 5. Bouclier Citoyen & Prévention Active (`3018` / `119` / `3114`)

Au-delà des disciplines académiques, l'entrée en 6ème expose les élèves à de nouveaux risques relationnels (pression de groupe, moqueries, cyberharcèlement sur messageries, isolement). **Brawl Collège : Opération 6ème** intègre un **Bouclier Citoyen** sur deux niveaux :

### 5.1 Conception sans toxicité sociale
* **Zéro chat en ligne ouvert, zéro messagerie non modérée, zéro classement humiliant :** l'élève joue en local contre ou avec des alliés IA bienveillants, dans un espace sécurisé.

### 5.2 Ancrage des numéros nationaux et des adultes référents
* **Sensibilisation par le jeu (`COL_CPS`, `COL_ADU`, `COL_LIEUX`) :** le corpus pédagogique aborde concrètement les réflexes face au harcèlement et au mal-être :
  * **3018 :** numéro national gratuit, anonyme et confidentiel contre le harcèlement et le cyberharcèlement (présent directement dans le défi `COL_CPS_048`) ;
  * **119 :** *Allô Enfance en Danger*, service national d'accueil téléphonique pour l'enfance en danger ;
  * **3114 :** numéro national de prévention du suicide et de prise en charge de la détresse psychologique.
* **Réflexes citoyens et déconstruction des peurs :**
  * refuser l'effet de meute (*ne pas rire, ne pas filmer, ne pas relayer*, savoir dire non sous pression) ;
  * déconstruire l'image punitive de la **Vie Scolaire** : dans le Mode 6 (*Exploration du Collège*), **M. Touré (CPE)** accueille l'élève dans le pôle Vie Scolaire avec ce message explicite : *« Cadenas bloqué, objet perdu ou besoin d'aide ? On est là pour t'écouter et t'aider ! »*, et les défis `COL_CPS_054` / `COL_CPS_055` rappellent le rôle bienveillant de l'**infirmière scolaire** et de la **Vie Scolaire**.

---

## 6. Architecture Technique : WebGL / Phaser 3 & SQLite 100 % Hors-Ligne (`RGPD-by-Design`)

### 6.1 Chaîne de Rendu 60 FPS & PWA Tablette
* **Pile technologique :** TypeScript 5.6, Vite 5.4, moteur 3D isométrique (`three` / `IsometricRenderer` / `ArenaEnvironment3D` sur `main`) et architecture de scènes **Phaser WebGL 2.5D** (`BootScene`, `ArenaScene`, `HUDScene` + GSAP sur la branche dédiée `feat/m4-phaser-webgl`), caméra verrouillée inclinée à **50°** offrant **+35 % de visibilité vers le haut de l'écran**.
* **Mode Paysage Tactile & PWA Hors-Ligne :** interface verrouillée pour tablettes scolaires (iPadOS / Android) en mode paysage (`display: fullscreen`, `orientation: landscape`, `manifest.webmanifest` et Service Worker `sw.js` sur `feat/m5-pwa-qa`), incluant un générateur de sprites SVG multi-couches et une synthèse audio procédurale sans fichiers lourds.

### 6.2 Persistance SQLite Locale (`LocalSQLiteDB`)
L'intégralité de l'état élève est stockée localement sur le terminal (avec persistance miroir IndexedDB / `localStorage` sous schéma DDL relationnel strict) :
* `player_profile` : profil joueur contraint (`id = 1`), trophées (`0` à `1000`, de *Rentrée CM2* à *Major de 6ème*), pièces, Casiers Mystères disponibles, héros sélectionné, hash PIN parent (`0000` par défaut).
* `skill_mastery` : suivi granulaire par `skill_code` (Elo `600–1600`, nombre de tentatives, réussites, temps de réaction moyen en ms, horodatage).
* `combat_telemetry_log` : journal horodaté des interactions (question, héros utilisé, exactitude, temps de réaction en ms).
* `quest_progress` : avancement dans les **12 quêtes progressives** d'exploration du collège (statut, index d'objectif, compteur).

### 6.3 Conformité RGPD-by-Design pour les Établissements & Collectivités
* **Zéro serveur, zéro compte élève, zéro transfert hors UE :** aucune donnée personnelle, aucun identifiant publicitaire et aucune trace d'apprentissage ne quitte la tablette ou le poste de l'élève.
* **Déploiement souverain immédiat :** compatible avec les chartes informatiques académiques, les flottes MDM de tablettes de collèges et d'écoles élémentaires (même en salle sans couverture Wi-Fi) et les recommandations de la CNIL concernant les mineurs.
* **Transparence Parentale (`ParentDashboard.ts`) :** un espace protégé par code PIN permet aux parents ou à l'enseignant de consulter localement le radar de réussite par matière, le score de sérénité, les repères d'autonomie au collège acquis (*Salle 204*, *CDI*, *Vie Scolaire*, *Emploi du temps*) et des **astuces d'accompagnement bienveillant à la maison**.

---

## 7. Feuille de Route & Validation (Jalons M0 → M4)

| Jalon | Contenu livré & Validé |
| :--- | :--- |
| **M0 — Vertical Slice** | Contrôle *twin-stick*, jauge & attaque Super, Casiers Mystères 100 % éthiques, Carnet Parent PIN |
| **M1 — Moteur 60 FPS & SQLite** | Moteur isométrique 60 FPS, 4 Élèves-Héros (Timo, Léo, Maya, Zack), `LocalSQLiteDB`, `QuestionProvider`, 215 premières questions |
| **M2 — 5 Modes & Elo** | 5 modes d'arène en rotation horaire, algorithme Elo $K=32$ et répétition espacée |
| **M3 — Recette & Déploiement** | Packaging multi-supports (PWA Tablette iPadOS/Android, APK/IPA) & recette qualité |
| **M4 — Exploration du Collège** | Carte ouverte 3D `2400×1800` à 10 salles, 9 PNJ interactifs, 12 badges, 12 quêtes d'autonomie et mini-carte radar (`CampusEngine`, `QuestService`, `QuestJournalModal`) |

---

*Document produit pour la présentation institutionnelle et partenariale du projet **Brawl Collège : Opération 6ème** (`ricksponge/college_star`).*
