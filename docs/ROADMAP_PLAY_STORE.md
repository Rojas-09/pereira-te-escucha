# Roadmap para Publicar en Play Store

## 🎯 Checklist Pre-Publicación

### 1. Configuración Básica ⚙️

- [ ] Crear cuenta Google Play Console ($25 USD una vez)
- [ ] Configurar `eas.json` para builds de producción
- [ ] Actualizar `app.json`:
  - [ ] `package` único (ej: `com.pereira.pqrsapp`)
  - [ ] `version` correcta (visible para usuarios)
  - [ ] Íconos y splash optimizados
- [ ] Alinear `package.json.version` con `app.json.expo.version`
- [ ] Confirmar estrategia de build number en EAS (`appVersionSource: remote`)

### 2. Documentación Legal 📄

- [x] **Política de Privacidad** (REQUERIDO por Google)
  - Explicar qué datos recolectas
  - Cómo usas la ubicación
  - Qué haces con las fotos
  - Documento base: `PRIVACY_POLICY.md`
  - Pendiente: publicarla en URL pública

- [ ] **Términos de Servicio** (opcional pero recomendado)

### 3. Seguridad y Calidad ✅

- [x] Rate limiting implementado
- [x] Sanitización XSS
- [x] Validación MIME types
- [x] Vulnerabilidades npm corregidas
- [ ] Tests unitarios (al menos básicos)
- [ ] HTTPS en backend (certificado SSL)
- [ ] Manejo de errores robusto

### 4. Configuración Android 📱

- [ ] Firmar con keystore (EAS lo hace automático)
- [ ] Configurar permisos en `app.json`:

  ```json
  "android": {
    "package": "com.pereira.pqrsapp",
    "versionCode": 1,
    "permissions": [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE"
    ]
  }
  ```

### 5. Assets de Play Store 🎨

- [ ] Ícono de app (512x512 PNG)
- [ ] Feature graphic (1024x500)
- [ ] Screenshots (al menos 2-8):
  - Celular: 16:9 o 9:16
  - Tablet: 16:9 o 9:16 (opcional)
- [ ] Descripción corta (80 caracteres)
- [ ] Descripción completa (4000 caracteres)

### 6. Backend en Producción 🌐

- [ ] Desplegar backend en servidor real
- [ ] Configurar dominio con SSL
- [ ] Actualizar `API_BASE_URL` en App.tsx
- [ ] Variables de entorno seguras
- [ ] Base de datos PostgreSQL en producción

### 7. Build y Publicación 🚀

```bash
# 1. Build de producción
eas build --platform android --profile production

# 2. Descargar el .aab generado

# 3. Subir a Play Console
# - Ir a "Producción" > "Crear versión"
# - Subir el .aab
# - Completar datos del listing
# - Enviar para revisión
```

### 8. Post-Publicación 📊

- [ ] Configurar crash reporting (Sentry)
- [ ] Analytics (Firebase, Mixpanel)
- [ ] Monitoreo de backend
- [ ] Plan de actualizaciones

---

## 🛠️ Comandos Útiles

### Desarrollo Local

```bash
# Frontend con Expo Go
npm start

# Backend
cd backend && npm run dev
```

### Build Development

```bash
eas build --profile development --platform android
```

### Build Producción

```bash
eas build --profile production --platform android
```

### Actualizar versión

```bash
# 1) En app.json cambiar expo.version
"version": "1.0.1"

# 2) En package.json alinear version
"version": "1.0.1"

# 3) Build number:
# Con appVersionSource=remote, EAS administra internamente
# la numeracion usada por Play Store en cada build.
```

---

## ⚠️ Puntos Críticos

1. **Backend debe estar en HTTPS** - Google rechaza conexiones HTTP
2. **Política de privacidad OBLIGATORIA** - Sin esto, rechazan la app
3. **Permisos justificados** - Ubicación y fotos deben explicarse
4. **Tiempo de revisión** - Puede tomar 3-7 días la primera vez

---

## 📚 Recursos

- [Expo Application Services (EAS)](https://docs.expo.dev/build/introduction/)
- [Google Play Console](https://play.google.com/console)
- [Política de Privacidad Generator](https://www.freeprivacypolicy.com/)
- [App Store Screenshots](https://www.screely.com/)
