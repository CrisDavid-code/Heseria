// Publica firestore.rules con el Admin SDK (plantilla del skill: `firebase deploy --only
// firestore:rules` da 403 porque la cuenta de servicio no tiene "firebaserules.test").
// Uso: GOOGLE_APPLICATION_CREDENTIALS=<clave.json> FIREBASE_PROJECT=heseria-app npm run deploy:rules
const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase-admin/app');
const { getSecurityRules } = require('firebase-admin/security-rules');

(async () => {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT || 'heseria-app' });
  const rules = getSecurityRules();
  const source = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  const released = await rules.releaseFirestoreRulesetFromSource(source);
  const live = await rules.getFirestoreRuleset();
  console.log('Reglas publicadas:', released.name.split('/').pop(), '· activas ahora:', live.name === released.name ? 'sí' : 'no');
})().catch((e) => {
  console.error('ERROR al publicar las reglas:', e.code || '', e.message);
  process.exit(1);
});
