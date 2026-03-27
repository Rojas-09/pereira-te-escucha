# 📱 Cómo Ver la App en tu Celular - Guía Paso a Paso

## ❌ Problema: Expo Go NO Funciona

Tu proyecto usa:
- Expo SDK 55 (muy reciente)
- `react-native-maps` (código nativo)
- `react-native-webview` (código nativo)

**Expo Go estándar NO soporta estas dependencias.**

---

## ✅ Solución: Development Build

Necesitas un APK personalizado con el código nativo incluido.

---

## 🚀 Opción 1: EAS Build en la Nube (RECOMENDADO)

### Paso 1: Instalar EAS CLI

```bash
npm install -g eas-cli
```

### Paso 2: Crear cuenta Expo (si no tienes)

1. Ve a https://expo.dev
2. Click en "Sign Up"
3. Usa tu email o GitHub

### Paso 3: Login

```bash
eas login
```

Ingresa tu email y contraseña.

### Paso 4: Configurar Proyecto (Solo Primera Vez)

```bash
cd "c:\Users\ASUS\OneDrive - Universidad Tecnológica de Pereira\Downloads\PQ IA\pq-ia-app"
eas build:configure
```

Responde las preguntas:
- ✅ Generate a new Android Keystore? **YES**
- ✅ Commit changes? **YES**

### Paso 5: Crear el APK de Desarrollo

```bash
eas build --profile development --platform android
```

Esto:
1. Sube tu código a Expo
2. Compila en la nube (~15-20 min)
3. Te da un link para descargar el APK

### Paso 6: Instalar en tu Celular

1. Abre el link del APK en tu celular
2. Descarga el APK
3. Instala (permite instalar de fuentes desconocidas)
4. Abre la app

### Paso 7: Conectar al Servidor de Desarrollo

```bash
# En tu PC:
cd "c:\Users\ASUS\OneDrive - Universidad Tecnológica de Pereira\Downloads\PQ IA\pq-ia-app"
npm start
```

La app en tu celular se conectará automáticamente.

---

## 🔧 Opción 2: Build Local (Más Avanzado)

Solo si tienes Android Studio y SDK configurado:

```bash
# Asegúrate de tener ANDROID_HOME configurado
npx expo run:android --device
```

---

## 📊 Comparación

| Característica | Expo Go | Development Build | Production Build |
|----------------|---------|-------------------|------------------|
| Código nativo personalizado | ❌ | ✅ | ✅ |
| Hot reload | ✅ | ✅ | ❌ |
| Instalación | Play Store | APK manual | Play Store |
| Tiempo setup | Inmediato | 15-20 min | 30+ min |
| **Para tu proyecto** | ❌ NO funciona | ✅ Recomendado | Para publicar |

---

## 🐛 Troubleshooting

### "eas: command not found"
```bash
npm install -g eas-cli
```

### "No Expo account found"
```bash
eas login
```

### "Build failed"
Revisa logs en https://expo.dev/accounts/[tu-username]/projects/pq-ia-app/builds

### APK no instala en celular
1. Settings > Security > Allow Unknown Sources
2. O Settings > Apps > Special Access > Install Unknown Apps

---

## 📝 Resumen Rápido

```bash
# 1. Instalar EAS
npm install -g eas-cli

# 2. Login
eas login

# 3. Configurar (solo primera vez)
eas build:configure

# 4. Build
eas build --profile development --platform android

# 5. Descargar e instalar APK en celular

# 6. Correr servidor dev
npm start
```

---

## 🎯 Próximos Pasos Después de Instalar

1. Inicia backend: `cd backend && npm run dev`
2. Inicia frontend: `npm start`
3. Abre la app en tu celular
4. ¡Empieza a probar!

---

## 💡 Nota Importante

Este Development Build es SOLO para desarrollo. Para publicar en Play Store necesitarás:

```bash
eas build --profile production --platform android
```

Que genera un `.aab` optimizado para Google Play.
