# LIBRE femme — revisión previa del esquema

## Migraciones localizadas

1. `202610210001_initial_core_schema.sql`: productos, variantes, imágenes, perfiles administrativos, proveedores, compras y líneas de compra.
2. `202610210002_inventory_orders.sql`: pedidos, líneas de pedido, balances y libro de movimientos de inventario, recepción de compras y confirmación de pedidos.
3. `202610210003_purchase_expenses.sql`: gastos de compra y distribución del coste asociado.

Los encabezados y comentarios de las migraciones indican que son archivos versionados y que deben revisarse antes de ejecutarse. No se ha realizado ningún cambio en el proyecto remoto de Supabase durante esta revisión.

## Controles positivos observados

- RLS está habilitado en las tablas de negocio revisadas.
- Las políticas de escritura de tablas administrativas dependen de `public.is_admin()`.
- No existe política de cliente para insertar o promover perfiles administrativos.
- Las lecturas públicas del catálogo se plantean mediante vistas restringidas que filtran productos publicados y variantes activas.
- La confirmación de pedidos se implementa como función transaccional que valida stock y registra movimientos.
- Los movimientos de inventario tienen un trigger que impide modificarlos o eliminarlos; las correcciones deben representarse con movimientos compensatorios.
- La recepción de compras y la distribución de gastos se ejecutan en el flujo de cambio de estado de compra.

## Verificaciones todavía necesarias

- Ejecutar las tres migraciones, en orden, en una base de datos desechable compatible con la versión de Supabase/PostgreSQL del proyecto.
- Probar con roles `anon`, `authenticated` sin perfil y `authenticated` con perfil admin, incluyendo acceso directo a tablas y vistas.
- Confirmar que la cuenta inicial se provisiona manualmente y que el registro público está deshabilitado.
- Probar límites de stock, concurrencia al confirmar pedidos, idempotencia, redondeo y distribución de gastos.
- Revisar la exposición efectiva de las vistas públicas con los privilegios reales del proyecto.
- Añadir pruebas de regresión para transiciones de estado y permisos.
- Confirmar la configuración real del proyecto Supabase antes de desplegar. El contenido de Git no demuestra qué está aplicado en remoto.

## Decisión

No ejecutar las migraciones en producción hasta completar las verificaciones anteriores. La revisión estática no sustituye a las pruebas de integración.
