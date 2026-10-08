# Turcau Baseball League

Jeu de baseball arcade familial (PWA) : les **Baddies**, avec Billy le Goldendoodle au monticule et Stella la Golden Retriever derrière le marbre.

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

## Volleyball

Dans le menu, choisis **VOLLEYBALL**. Les mêmes équipes jouent à 6 contre 6, sans Billy ni Stella.

- **Service :** ESPACE ou OK quand l'aiguille est dans le vert.
- **Manchette, passe, smash :** ESPACE ou OK quand la balle arrive dans l'anneau. Les FLÈCHES ↑ ↓ visent le smash.
- **Bloc :** ESPACE ou OK au moment du smash adverse.
- Les joueuses se placent toutes seules. Les remplaçantes entrent à tour de rôle au service.
- Points par set (15, 21, 25) et nombre de sets (1 ou 3) : dans les OPTIONS.
- Réglages : `src/game/volley/VolleyConfig.ts`.

## Sons du stade

L'orgue, la foule et les chants sont de vrais enregistrements, lus en ligne (ils ne sont pas stockés dans le jeu). Sans connexion, le jeu utilise ses sons synthétisés. La liste est dans `src/game/config/sounds.ts`.

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
- Règles, difficulté, vitesses : `src/game/config/gameConfig.ts`

## Publier sur GitHub Pages

1. Crée un dépôt sur GitHub et pousse le projet sur la branche `main`.
2. Dans le dépôt : **Settings > Pages > Source = GitHub Actions**.
3. Le fichier `.github/workflows/deploy.yml` construit et publie le jeu à chaque push.

Après la première ouverture, le jeu fonctionne hors connexion et peut s'installer comme une application.
