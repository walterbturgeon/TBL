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

Les coureuses courent seules. En défensive, la joueuse la plus proche court seule vers la balle et lance seule si personne n'appuie sur ESPACE.

Touches avancées (désactivées par défaut) : voir `CONTROLS` dans `src/game/config/gameConfig.ts`.

## Démarrer

```bash
npm install
npm run dev
```

Ouvre ensuite http://localhost:5173.

## Changer les personnages

- Joueuses : `src/game/config/players.ts`
- Billy et Stella : `src/game/config/dogs.ts`
- Équipes, positions, rotation, ordre au bâton, équipes adverses : `src/game/config/teams.ts`
- Règles, difficulté, vitesses : `src/game/config/gameConfig.ts`

## Publier sur GitHub Pages

1. Crée un dépôt sur GitHub et pousse le projet sur la branche `main`.
2. Dans le dépôt : **Settings > Pages > Source = GitHub Actions**.
3. Le fichier `.github/workflows/deploy.yml` construit et publie le jeu à chaque push.

Après la première ouverture, le jeu fonctionne hors connexion et peut s'installer comme une application.
