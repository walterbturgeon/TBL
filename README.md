# Turcau Olympic

Jeux arcade pour la famille (PWA), en 3 sports :

- **Baseball** (la Turcau Baseball League) : les **Baddies**, avec Billy le Goldendoodle au monticule et Stella la Golden Retriever derrière le marbre.
- **Volleyball** : les Nomads.
- **Danse** : battle de danse avec les K-Units.

Fait avec TypeScript, Vite et Phaser 3. Tous les personnages sont dessinés en vecteurs et tous les sons sont synthétisés : le jeu n'a aucun fichier image ou son à télécharger.

## Commandes

| Touche | Action |
|---|---|
| ESPACE | Frapper · lancer la balle |
| FLÈCHES (ou WASD) | Aider la joueuse à courir (facultatif) |
| ÉCHAP | Pause |

Sur une télé (Fire TV, navigateur Silk) : OK = ESPACE, Retour ou Lecture/Pause = pause. Si le navigateur montre un curseur, un clic n'importe où dans la partie frappe et lance, et le bouton ❚❚ en bas à gauche met en pause.

Sur un téléphone (à l'horizontale) : touche l'écran pour frapper, lancer, plonger et arrêter la jauge de Billy. Tape sur le bouton SPRINT pour courir plus vite. Le bouton ❚❚ met en pause.

Les coureuses courent seules. En défensive, la joueuse la plus proche court seule vers la balle et lance seule si personne n'appuie sur ESPACE.

Touches avancées (désactivées par défaut) : voir `CONTROLS` dans `src/game/config/gameConfig.ts`.

## Difficulté progressive (les 3 sports)

Par défaut, la difficulté monte avec le temps de jeu :

| Temps de jeu | Niveau |
|---|---|
| 0 à 3 min | Niveau 1 · Facile |
| 3 à 7 min | Niveau 2 · Difficile (complètement difficile à 7 min) |
| 7 à 11 min | Niveau 3 · Très dur (complètement très dur à 11 min) |
| 11 min et plus | Niveau 4 · Impossible (au maximum à 15 min) |

- Le temps compte seulement pendant le jeu. Il continue avec REJOUER et avec la chanson SUIVANTE (danse).
- Le temps repart à zéro quand tu reviens au choix des équipes.
- Le niveau est sous le panneau de droite (baseball, volleyball) ou en haut de la piste (danse).
- Pour une difficulté fixe : OPTIONS > DIFFICULTÉ (Facile, Normal ou Difficile).
- Réglages : `src/game/systems/Progress.ts`.

## Volleyball

Dans le menu, choisis **VOLLEYBALL**. Au volleyball, **les Nomads** remplacent les Baddies. Les autres équipes jouent aussi, à 6 contre 6, sans Billy ni Stella.

- **Service :** ESPACE ou OK quand l'aiguille est dans le vert.
- **Manchette, passe, smash :** ESPACE ou OK quand la balle arrive dans l'anneau. Les FLÈCHES ↑ ↓ visent le smash.
- **Bloc :** ESPACE ou OK au moment du smash adverse.
- Sans appui, la joueuse touche quand même la balle, mais elle rate souvent un smash. L'aide en défense est dans `VDIG_HELP`.
- Les joueuses se placent toutes seules. Les remplaçantes entrent à tour de rôle au service.
- Points par set (15, 21, 25) et nombre de sets (1 ou 3) : dans les OPTIONS.
- Réglages : `src/game/volley/VolleyConfig.ts`.

## Danse (aperçu)

Dans le menu, choisis **DANSE**. Deux équipes de danse font une battle en 3 rounds, sur une musique hip-hop. À la danse, **les K-Units** (mêmes membres que les Baddies) et les Nomads remplacent les Baddies.

- Les flèches descendent dans la piste du centre. Appuie sur **← ↓ ↑ →** (ou WASD) quand une flèche arrive dans sa cible.
- Sur un téléphone (à l'horizontale), l'écran est partagé en 4 colonnes : ←, ↓, ↑, →. Touche la colonne de la flèche.
- Chaque bonne flèche fait danser ton équipe : pas à gauche, descente, saut, pas à droite.
- Sur un appui **PARFAIT**, l'équipe fait un mouvement de breakdance : ← footwork, ↓ freeze, ↑ headspin, → windmill.
- Une nouvelle équipe de 4 danseuses monte sur scène à chaque round. L'équipe qui a le plus de points gagne le round.
- ÉCHAP ou ❚❚ : pause.
- 8 musiques originales sans paroles : Rue Turcau, Néon Funk, Gros 808, et 5 dans le style du hip-hop de 2012-2013, avec des noms qui rappellent les titres connus (Pistache Packin’, Toozie Glide, Trip Club Remix, Dracoola, M.E.E.D Town). Les mélodies sont originales. Le jeu les joue lui-même : elles sont libres de droits et toujours en rythme avec les flèches.
- Dans les écrans de la danse (choix des équipes et de la musique), la seule musique de fond est la chanson choisie.
- Réglages : `src/game/dance/DanceConfig.ts`. Musiques et chorégraphies : `src/game/dance/Songs.ts`.

## Sons du stade

L'orgue, la foule et les chants sont de vrais enregistrements, lus en ligne (ils ne sont pas stockés dans le jeu). Ils jouent seulement au baseball. Les menus ont un air calme, le volleyball a la foule du gymnase, et la danse a ses propres musiques. Quand le jeu passe en arrière-plan (autre application, écran verrouillé), tous les sons s'arrêtent et la partie se met en pause. Sans connexion, le jeu utilise ses sons synthétisés. La liste est dans `src/game/config/sounds.ts`.

- « Take Me Out to the Ball Game », Edward Meeker, 1908 — domaine public ([Wikimedia Commons](https://commons.wikimedia.org/wiki/File:MeekerBallGame.ogg))
- Freesound, licence CC0 : [orgue de Wrigley Field](https://freesound.org/people/treblebooster/sounds/151373/), [fanfares de stade](https://freesound.org/people/vckhaze/sounds/380696/), [riff d'orgue galop](https://freesound.org/people/trader_one/sounds/649371/), [ambiance Fenway Park](https://freesound.org/people/Douglas711/sounds/424295/), [enfants qui encouragent](https://freesound.org/people/craigsmith/sounds/675109/), [foule de Montréal](https://freesound.org/people/kyles/sounds/629884/), [foule qui applaudit](https://freesound.org/people/FoolBoyMedia/sounds/397434/), [applaudissements rythmés](https://freesound.org/people/jasinski/sounds/18364/)

## Démarrer

```bash
npm install
npm run dev
```

Ouvre ensuite http://localhost:5173.

## Avant la partie

1. Choisis ton équipe (n'importe laquelle), puis regarde ses joueurs.
2. Choisis l'équipe adverse, puis regarde ses joueurs.
3. AU JEU !

## Changer les personnages

- Joueuses : `src/game/config/players.ts`
- Billy et Stella : `src/game/config/dogs.ts`
- Équipes, positions, rotation, ordre au bâton, phrase de bande dessinée de chaque personne pour une longue frappe (`hitPhrase`) : `src/game/config/teams.ts`
- Les Nomads (volleyball et danse) : `NOM` et `NOMADS` dans `src/game/config/teams.ts`. Le champ `sports` choisit le sport de chaque équipe.
- Règles, difficulté, vitesses : `src/game/config/gameConfig.ts`

## Publier sur GitHub Pages

1. Crée un dépôt sur GitHub et pousse le projet sur la branche `main`.
2. Dans le dépôt : **Settings > Pages > Source = GitHub Actions**.
3. Le fichier `.github/workflows/deploy.yml` construit et publie le jeu à chaque push.

Après la première ouverture, le jeu fonctionne hors connexion et peut s'installer comme une application.
