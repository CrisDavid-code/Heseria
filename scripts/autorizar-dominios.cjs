// Agrega los dominios de Hosting a «Dominios autorizados» de Firebase Auth, para que
// «Entrar con Google» funcione en heseria.web.app (Firebase solo autoriza el sitio por defecto).
// Uso: GOOGLE_APPLICATION_CREDENTIALS=<clave.json> node scripts/autorizar-dominios.cjs heseria.web.app …
const { applicationDefault } = require('firebase-admin/app');

const PROJECT = process.env.FIREBASE_PROJECT || 'heseria-app';
const URL = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;

(async () => {
  const { access_token } = await applicationDefault().getAccessToken();
  const headers = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT };
  const config = await (await fetch(URL, { headers })).json();
  if (config.error) throw new Error(config.error.message);
  const current = config.authorizedDomains || [];
  const missing = process.argv.slice(2).filter((d) => !current.includes(d));
  if (!missing.length) return console.log('Dominios ya autorizados:', current.join(', '));
  const res = await fetch(`${URL}?updateMask=authorizedDomains`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ authorizedDomains: [...current, ...missing] }),
  });
  const out = await res.json();
  if (out.error) throw new Error(out.error.message);
  console.log('Dominios autorizados:', out.authorizedDomains.join(', '));
})().catch((e) => {
  console.error('ERROR al autorizar dominios:', e.message);
  process.exit(1);
});
