// ============================================================
// RÉGLAGES À REMPLIR (voir GUIA.md, étape 3)
// Ces deux clés Supabase sont publiques par nature : elles peuvent être ici.
// Ne mettez JAMAIS ici la clé "secret" / "service_role" ni la clé Anthropic.
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://zqtfjmdrsbxkzrmuaaxk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_nA89oLItcjkvKZiq3cwLNQ_Pg6STyNw",

  // Nom du service (à changer quand le nom définitif est choisi)
  APP_NAME: "Clairvu",

  // Durée de conservation des demandes, affichée au client (à faire valider)
  RETENTION: "12 mois",

  // Comptes qui peuvent inviter de nouveaux artisans (le serveur vérifie aussi)
  ADMIN_EMAILS: ["cesar_insignares@hotmail.com"],

  // Votre contact pour les questions RGPD (affiché au client)
  CONTACT_EMAIL: "contact@exemple.fr"
};
