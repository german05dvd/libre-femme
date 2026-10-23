# LIBRE femme — autenticación administrativa

## Estado

- La tienda pública actual sigue siendo una interfaz de demostración y no está conectada a Supabase.
- Las migraciones SQL están versionadas en Git, pero no se consideran aplicadas al proyecto remoto.
- El panel de administración debe usar Supabase Auth y las políticas RLS de la base de datos.
- Inicialmente se autoriza una sola cuenta administrativa. No debe existir registro público desde la aplicación.

## Reglas de seguridad obligatorias

1. Deshabilitar el registro público de usuarios en Supabase Auth antes de publicar el acceso administrativo.
2. Crear la cuenta inicial desde el panel de Supabase (o un procedimiento de administración confiable), no desde un formulario público.
3. Crear una fila en `public.profiles` para el UUID de esa cuenta. La tabla exige que el ID corresponda a `auth.users`, y no debe concederse al cliente permiso para insertar o cambiar perfiles.
4. La clave publishable/anon puede utilizarse en el navegador junto con RLS. Nunca exponer `service_role`, contraseñas de base de datos ni secretos en variables `VITE_*`.
5. Proteger las rutas de interfaz y, por separado, los datos con RLS. Ocultar un enlace o una ruta no es un control de acceso.
6. No crear una cuenta administrativa automáticamente al iniciar la web. No incluir credenciales por defecto ni credenciales en el repositorio.
7. Para producción, activar protección contra contraseñas comprometidas y limitar los orígenes/redirect URLs de autenticación a los dominios usados por la aplicación.

## Variables de entorno

Copia `.env.example` a `.env.local` y rellena solo:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (o la publishable key disponible en el proyecto)

Los valores del navegador no son secretos de administrador. La seguridad depende de RLS y de no exponer claves privilegiadas. `.env.local` no debe versionarse.

## Aprovisionar el primer administrador

Realiza estos pasos solo después de revisar y aplicar las migraciones aprobadas:

1. En Supabase Dashboard → Authentication → Users, crea/invita manualmente el usuario administrador con el correo que tú controlas.
2. Copia su UUID desde el panel.
3. En SQL Editor, inserta el perfil usando el UUID real y un nombre visible. No inventes ni reutilices UUIDs:

```sql
insert into public.profiles (id, display_name, role)
values ('UUID_REAL_DEL_USUARIO_AUTH', 'Administración LIBRE femme', 'admin');
```

4. Verifica que existe exactamente el perfil previsto y que el usuario puede iniciar sesión.
5. No compartas la contraseña ni la pegues en GitHub, el código o el chat. Si el proveedor muestra una contraseña temporal, cámbiala en el primer acceso.

No ejecutar este SQL antes de desplegar la migración que crea `public.profiles`.

## Criterios de aceptación antes de producción

- Un visitante sin sesión puede ver solo el catálogo publicado.
- Un visitante sin sesión no puede leer ni modificar pedidos, compras, costes, perfiles o movimientos de inventario.
- Un usuario autenticado sin perfil administrativo no puede acceder al panel ni a las tablas administrativas.
- La única cuenta autorizada puede iniciar sesión y cerrar sesión.
- Las operaciones sensibles de inventario se ejecutan mediante funciones controladas y RLS; la confirmación de un pedido no puede descontar stock dos veces.
- No hay claves privilegiadas en los archivos servidos al navegador.
- Las migraciones se prueban en un entorno no productivo antes de aplicarlas al proyecto remoto.

## Pendientes técnicos

- Instalar y fijar `@supabase/supabase-js` junto con su lockfile.
- Implementar el cliente, el formulario de acceso y la protección de rutas.
- Revisar las migraciones con pruebas SQL reales antes de aplicarlas.
- Conectar el catálogo público a las vistas restringidas y verificar que la interfaz nunca presenta stock de demostración como real.
