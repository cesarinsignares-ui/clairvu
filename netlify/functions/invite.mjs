// Crée l'accès d'un nouvel artisan et renvoie un lien d'invitation (envoyé ensuite par SMS/WhatsApp par l'admin).
// Réservé aux administrateurs (ADMIN_EMAILS, séparés par des virgules).

const clean = v => String(v || "").replace(/\s+/g, "");
const SB_URL = clean(process.env.SUPABASE_URL).replace(/\/+$/, "");
const SB_KEY = clean(process.env.SUPABASE_SERVICE_KEY);
const SITE = (process.env.SITE_URL || "https://clairvu.fr").replace(/\/+$/, "");
const ADMINS = (process.env.ADMIN_EMAILS || "cesar_insignares@hotmail.com")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const svc = (extra = {}) => ({ apikey: SB_KEY, ...(SB_KEY.startsWith("eyJ") ? { Authorization: `Bearer ${SB_KEY}` } : {}), ...extra });

async function generate(type, email, name) {
  const r = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: svc({ "content-type": "application/json" }),
    body: JSON.stringify({ type, email, redirect_to: `${SITE}/app`, data: name ? { name } : undefined }),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée" });
  if (!SB_URL || !SB_KEY) return json(500, { error: "Configuration serveur incomplète" });

  // 1. Qui appelle ? (jeton de session Supabase de l'utilisateur connecté)
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Connexion requise" });
  const me = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
  if (!me.ok) return json(401, { error: "Session invalide, reconnectez-vous" });
  const user = await me.json();
  if (!ADMINS.includes(String(user.email || "").toLowerCase())) return json(403, { error: "Réservé à l'administrateur" });

  // 2. Données de l'artisan invité
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Requête invalide" }); }
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { error: "Adresse e-mail invalide" });

  // 3. Nouvel utilisateur : lien d'invitation. Déjà inscrit : lien pour (re)définir son mot de passe.
  let res = await generate("invite", email, name);
  let existing = false;
  if (!res.ok && (res.status === 422 || /already|registered|exists/i.test(JSON.stringify(res.body)))) {
    existing = true;
    res = await generate("recovery", email);
  }
  // On n'envoie PAS le lien Supabase brut : WhatsApp/SMS l'ouvrent pour l'aperçu et le consomment.
  // On envoie un lien vers l'app ; le jeton n'est validé que lorsque l'artisan choisit son mot de passe.
  const hashed = res.body.hashed_token || res.body.properties?.hashed_token;
  const link = hashed
    ? `${SITE}/app#activer=${encodeURIComponent(hashed)}&t=${existing ? "recovery" : "invite"}`
    : (res.body.action_link || res.body.properties?.action_link);
  if (!res.ok || !link) {
    console.error("generate_link", res.status, JSON.stringify(res.body).slice(0, 300));
    return json(502, { error: "Impossible de créer le lien d'accès" });
  }
  return json(200, { link, existing });
};
