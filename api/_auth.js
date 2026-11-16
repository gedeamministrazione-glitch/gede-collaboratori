// Controlli di accesso per le API (i file che iniziano con "_" non sono rotte Vercel).
// Variabili d'ambiente su Vercel (facoltative):
//   COLLAB_PASSWORD  password dei collaboratori; se manca, basta che la richiesta arrivi dal sito stesso
//   ADMIN_PASSWORD   password per modificare il listino CTE

const uguale = (a, b) => typeof a === "string" && typeof b === "string" && a.length > 0 && a === b;

function dalSito(req) {
  const host = String(req.headers.host || "");
  const da = String(req.headers.origin || req.headers.referer || "");
  try { return !!host && new URL(da).host === host; } catch (e) { return false; }
}

export function isAdmin(req) {
  return uguale(req.headers["x-gede-key"], process.env.ADMIN_PASSWORD);
}

export function isCollaboratore(req) {
  if (isAdmin(req)) return true;
  if (process.env.COLLAB_PASSWORD) return uguale(req.headers["x-gede-key"], process.env.COLLAB_PASSWORD);
  return dalSito(req);
}
