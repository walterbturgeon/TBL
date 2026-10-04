/**
 * Journal de diagnostic : les dernières étapes du jeu sont gardées dans localStorage.
 * Si le navigateur plante, la page diag.html montre la dernière étape atteinte.
 */
const KEY = 'turcau-bbl.trace';
const MAX = 40;
let lines: { tag: string; text: string }[] = [];

function save() {
  try {
    localStorage.setItem(KEY, lines.map((l) => l.text).join('\n'));
  } catch {
    /* stockage indisponible */
  }
}

function stamp() {
  return (performance.now() / 1000).toFixed(1) + ' s  ';
}

/** Ajoute une ligne au journal. */
export function trace(msg: string) {
  lines.push({ tag: '', text: stamp() + msg });
  if (lines.length > MAX) lines = lines.slice(-MAX);
  save();
}

/** Met à jour une ligne qui change souvent (ex. « partie en cours ») au lieu d'en ajouter une. */
export function traceLive(tag: string, msg: string) {
  const l = lines.find((x) => x.tag === tag);
  const text = stamp() + msg;
  if (l) l.text = text;
  else lines.push({ tag, text });
  save();
}

export function traceStart() {
  // garde le journal du lancement précédent (celui qui a peut-être planté)
  try {
    const old = localStorage.getItem(KEY);
    if (old) localStorage.setItem(KEY + '-prev', old);
  } catch {
    /* stockage indisponible */
  }
  lines = [];
  const d = new Date();
  trace(`lancement ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`);
}
