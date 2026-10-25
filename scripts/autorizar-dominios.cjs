// Configura Firebase Auth: activa «Correo y contraseña» (el único método de acceso) y agrega los
// dominios de Hosting a «Dominios autorizados» (los correos de verificación y de cambio de
// contraseña regresan a heseria.web.app).
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
  const domains = [...current, ...process.argv.slice(2).filter((d) => !current.includes(d))];
  const res = await fetch(`${URL}?updateMask=authorizedDomains,signIn.email.enabled,signIn.email.passwordRequired`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ authorizedDomains: domains, signIn: { email: { enabled: true, passwordRequired: true } } }),
  });
  const out = await res.json();
  if (out.error) throw new Error(out.error.message);
  console.log('Correo y contraseña:', out.signIn?.email?.enabled ? 'activado' : 'NO activado');
  console.log('Dominios autorizados:', out.authorizedDomains.join(', '));
})().catch((e) => {
  console.error('ERROR al autorizar dominios:', e.message);
  process.exit(1);
});
