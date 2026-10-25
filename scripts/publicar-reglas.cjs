// Publica firestore.rules con el Admin SDK (plantilla del skill: `firebase deploy --only
// firestore:rules` da 403 porque la cuenta de servicio no tiene "firebaserules.test").
// La liberación se hace por REST (release cloud.firestore/<base>), así sirve para la base
// predeterminada o para una con nombre (FIRESTORE_DATABASE).
// Uso: GOOGLE_APPLICATION_CREDENTIALS=<clave.json> FIREBASE_PROJECT=heseria-app npm run deploy:rules
const fs = require('fs');
const path = require('path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getSecurityRules } = require('firebase-admin/security-rules');

const PROJECT = process.env.FIREBASE_PROJECT || 'heseria-app';
const DATABASE = process.env.FIRESTORE_DATABASE || '(default)';
const API = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`;

(async () => {
  initializeApp({ projectId: PROJECT });
  const rules = getSecurityRules();
  const source = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  const ruleset = await rules.createRuleset(rules.createRulesFileFromSource('firestore.rules', source));
  const rulesetName = ruleset.name.startsWith('projects/') ? ruleset.name : `projects/${PROJECT}/rulesets/${ruleset.name}`;
  const name = `projects/${PROJECT}/releases/cloud.firestore/${DATABASE}`;

  const { access_token } = await applicationDefault().getAccessToken();
  const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };
  // Actualiza la liberación; si todavía no existe, la crea.
  let res = await fetch(`https://firebaserules.googleapis.com/v1/${name}`, {
    method: 'PATCH', headers, body: JSON.stringify({ release: { name, rulesetName } }),
  });
  if (res.status === 404) res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ name, rulesetName }) });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error?.message ?? `HTTP ${res.status}`);
  console.log(`Reglas publicadas en ${DATABASE}:`, out.rulesetName.split('/').pop());
})().catch((e) => {
  console.error('ERROR al publicar las reglas:', e.code || '', e.message);
  process.exit(1);
});
