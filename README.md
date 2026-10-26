# LIBRE femme

Aplicación web de LIBRE femme construida con React, TypeScript, Vite y Supabase.

## Ejecutar una vista previa local

### Requisitos
- Node.js 24 o una versión compatible con el proyecto.
- npm.
- Las variables públicas de conexión a Supabase para cargar los productos reales.

### 1. Instalar dependencias
```bash
npm ci
```

### 2. Configurar el entorno local
Copia el archivo de ejemplo y edita `.env.local`:

```bash
cp .env.example .env.local
```

Completa estos dos valores con los datos del proyecto Supabase:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA_ANON
```

Usa solo la clave pública/publishable o anon en el navegador. **Nunca** pongas una clave `service_role`, una contraseña de base de datos ni secretos en variables `VITE_*`. No subas `.env.local` a Git.

Si ya existe un `.env.local` válido en tu espacio de desarrollo, no necesitas copiarlo ni reemplazarlo.

### 3. Iniciar la aplicación
```bash
npm run dev -- --host 0.0.0.0
```

Vite mostrará la dirección local y, si trabajas en GitHub Codespaces, aparecerá la opción de abrir o reenviar el puerto **5173**. En un navegador local normalmente podrás abrir `http://localhost:5173`.

Detén el servidor con `Ctrl+C`.

## Comprobaciones antes de publicar

```bash
npm run lint
npm run build
```

La aplicación necesita que las vistas, políticas y tablas de Supabase estén configuradas para la versión de código que estás probando. Ejecutar la web localmente **no** aplica migraciones a Supabase. Las migraciones deben revisarse y probarse antes de aplicarlas al proyecto real.

## Flujo de trabajo

Los cambios de desarrollo se trabajan en ramas y se revisan mediante Pull Requests antes de integrarlos en `main`. El despliegue público en Cloudflare Pages aún debe configurarse por separado.
