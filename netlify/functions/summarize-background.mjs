// Analyse IA d'une demande de devis (fonction d'arrière-plan Netlify).
// Variables d'environnement (Netlify > Site configuration > Environment variables) :
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, (facultatif) ANTHROPIC_MODEL

// Les espaces ou retours à la ligne collés par erreur sont retirés.
const clean = v => String(v || "").replace(/\s+/g, "");
const SB_URL = clean(process.env.SUPABASE_URL).replace(/\/+$/, "");
const SB_KEY = clean(process.env.SUPABASE_SERVICE_KEY);
const AI_KEY = clean(process.env.ANTHROPIC_API_KEY);
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

// Les anciennes clés (JWT "eyJ...") passent aussi en Authorization ; les nouvelles (sb_secret_...) seulement en apikey.
const sbHeaders = (extra = {}) => ({
  apikey: SB_KEY,
  ...(SB_KEY.startsWith("eyJ") ? { Authorization: `Bearer ${SB_KEY}` } : {}),
  ...extra,
});

const SYSTEM = `Tu es l'assistant d'un artisan du bâtiment en France. Tu reçois une demande de devis (texte et éventuellement photos).
Réponds UNIQUEMENT avec un objet JSON valide, en français, sans texte autour, de cette forme :
{"travail": "le besoin en 1 ou 2 phrases",
 "sur_les_photos": "ce qu'on voit réellement sur les photos, ou \\"Aucune photo\\"",
 "infos_manquantes": ["..."],
 "questions": ["question courte au client", "..."],
 "materiel_probable": ["..."],
 "securite": null}
Règles :
- N'invente rien qui ne soit pas dans la demande ou clairement visible. Si une photo est floue ou ne montre pas le problème, dis-le.
- Ne donne aucun prix, aucune durée, aucun diagnostic certain (écris "possiblement").
- "questions" : 3 questions maximum, utiles pour chiffrer, formulées pour un particulier. Si le relevé a été fait sur place par l'artisan, mets [].
- "materiel_probable" : seulement si c'est évident, sinon [].
- "securite" : une phrase d'alerte pour l'artisan uniquement si la demande évoque un danger (odeur de brûlé, étincelles, gaz, eau près de l'électricité, fil dénudé, risque de chute), sinon null.`;

async function sb(path, init = {}) {
  const r = await fetch(`${SB_URL}${path}`, { ...init, headers: sbHeaders(init.headers) });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

function parseJson(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Réponse IA sans JSON");
  const o = JSON.parse(text.slice(a, b + 1));
  const arr = v => (Array.isArray(v) ? v.filter(x => typeof x === "string").map(x => x.slice(0, 300)).slice(0, 6) : []);
  const str = v => (typeof v === "string" && v.trim() ? v.trim().slice(0, 600) : null);
  return {
    travail: str(o.travail),
    sur_les_photos: str(o.sur_les_photos),
    infos_manquantes: arr(o.infos_manquantes),
    questions: arr(o.questions).slice(0, 3),
    materiel_probable: arr(o.materiel_probable),
    securite: str(o.securite),
  };
}

export default async (req) => {
  if (req.method !== "POST") return;
  if (!SB_URL || !SB_KEY || !AI_KEY) { console.error("Variables d'environnement manquantes"); return; }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SB_URL)) { console.error("SUPABASE_URL invalide (doit être https://xxxx.supabase.co)"); return; }

  let id;
  try { ({ id } = await req.json()); } catch { return; }
  if (!/^[0-9a-f-]{36}$/i.test(id || "")) return;

  // Verrou : on ne traite que les demandes "pending" (une seule fois, pas d'abus possible).
  const lock = await sb(`/rest/v1/requests?id=eq.${id}&ai_status=eq.pending&select=*,artisans(name,trade)`, {
    method: "PATCH",
    headers: { "content-type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ ai_status: "running" }),
  });
  const rows = await lock.json();
  if (!rows.length) return;
  const r = rows[0];

  try {
    const content = [];
    for (const path of (r.photos || []).slice(0, 5)) {
      try {
        const img = await sb(`/storage/v1/object/photos/${path.split("/").map(encodeURIComponent).join("/")}`);
        const buf = Buffer.from(await img.arrayBuffer());
        if (buf.length > 0 && buf.length < 5 * 1024 * 1024) {
          content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } });
        }
      } catch (e) { console.error("Photo illisible", path, e.message); }
    }
    const who = r.source === "artisan" ? "Relevé fait SUR PLACE par l'artisan" : "Demande envoyée par le CLIENT";
    content.push({
      type: "text",
      text: `${who}.
Métier de l'artisan : ${r.artisans?.trade || "non précisé"}
Type de travaux : ${r.work_type || "non précisé"}
Commune : ${r.zone}
Urgence indiquée : ${r.urgency || "non précisée"}
${r.measures ? "Mesures / repères : " + r.measures + "\n" : ""}Description :
"""${r.description}"""
Nombre de photos jointes : ${content.length}`,
    });

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: SYSTEM, messages: [{ role: "user", content }] }),
    });
    if (!ai.ok) throw new Error(`Anthropic ${ai.status}: ${(await ai.text()).slice(0, 300)}`);
    const out = await ai.json();
    const text = (out.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    const result = parseJson(text);

    await sb(`/rest/v1/requests?id=eq.${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ ai: result, ai_status: "done" }),
    });
  } catch (e) {
    console.error("Analyse échouée", id, e.message);
    await sb(`/rest/v1/requests?id=eq.${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ ai_status: "error" }),
    }).catch(() => {});
  }
};
