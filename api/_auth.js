// Controlli di accesso per le API (i file che iniziano con "_" non sono rotte Vercel).
// Variabili d'ambiente su Vercel:
//   COLLAB_PASSWORD  password dei collaboratori (la stessa del login della dashboard)
//   ADMIN_PASSWORD   password per modificare il listino CTE

const uguale = (a, b) => typeof a === "string" && typeof b === "string" && a.length > 0 && a === b;

export function isAdmin(req) {
  return uguale(req.headers["x-gede-key"], process.env.ADMIN_PASSWORD);
}

export function isCollaboratore(req) {
  return isAdmin(req) || uguale(req.headers["x-gede-key"], process.env.COLLAB_PASSWORD);
}
