# Credenciales

Aquí van los archivos que permiten enviar avisos push. **No se suben al
repositorio**: son secretos.

| Archivo | Para qué | De dónde sale |
| --- | --- | --- |
| `fcm-service-account.json` | Android | Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada |
| `apns.p8` | iOS | Apple Developer → Keys → nueva clave con APNs activado |

Además, `google-services.json` va en `android/app/`, no aquí.

Comprueba que todo esté en su sitio con:

```bash
npm run check:push
```
