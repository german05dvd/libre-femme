# LIBRE femme — Arquitectura del sistema

## 1. Objetivo

Construir una plataforma comercial para LIBRE femme que integre:
- Tienda pública.
- Administración de productos e inventario.
- Compras, importaciones y gastos.
- Pedidos, ventas, cobros y entregas.
- Informes financieros y analítica.

## 2. Tecnologías

- Frontend: React + TypeScript + Vite.
- Base de datos: PostgreSQL mediante Supabase.
- Autenticación: Supabase Auth para administradores.
- Archivos: Supabase Storage para imágenes de productos.
- Versionado: Git y GitHub.
- Desarrollo: GitHub Codespaces.
- Despliegue previsto: Cloudflare Pages.

## 3. Principios de arquitectura

- Una única fuente de verdad para los datos comerciales.
- Separación por módulos y responsabilidades.
- Validación de datos tanto en frontend como en servidor.
- Operaciones críticas ejecutadas de forma atómica en PostgreSQL.
- Acceso a datos protegido mediante Row Level Security (RLS).
- Ningún secreto administrativo en el frontend ni en GitHub.
- Cambios de base de datos mediante migraciones versionadas.
- Los registros históricos conservan los precios y costes aplicados en su momento.

## 4. Módulos

### Tienda pública
- Catálogo y búsqueda de productos.
- Variantes por talla y color.
- Carrito y preparación de mensaje para WhatsApp.
- Sin cuenta obligatoria para consultar el catálogo.
- Un mensaje enviado por WhatsApp no constituye por sí solo
  una venta confirmada ni reserva existencias automáticamente.

### Administración
- Acceso individual para cada administrador.
- Gestión de productos, variantes e imágenes.
- Registro de compras, pedidos y entregas.
- Gestión de agencias de envío e importación.

### Inventario
- Existencias por variante.
- Entradas, salidas y ajustes con trazabilidad.
- Prevención de ventas duplicadas y de stock negativo.
- Reservas y confirmaciones gestionadas de forma atómica.

### Finanzas y analítica
- Coste de adquisición de productos.
- Gastos de importación, comisiones, peso y otros costes.
- Ventas, cobros y saldos pendientes.
- Márgenes estimados y evolución del capital invertido y recuperado.
- Informes de rotación y productos más vendidos.

## 5. Modelo de datos previsto

- products: identidad y descripción del producto.
- product_variants: SKU, talla, color y precio actual.
- suppliers: proveedores.
- purchases: compras y sus datos históricos.
- purchase_items: variantes, cantidades y costes de adquisición.
- import_shipments: envíos de importación y agencias.
- shipment_costs: costes de transporte, comisiones y otros cargos.
- inventory_movements: entradas, salidas y ajustes de existencias.
- orders: solicitudes y pedidos de clientes.
- order_items: variantes, cantidades y precios históricos.
- sales: ventas confirmadas.
- payments: cobros y devoluciones.
- delivery_agencies: agencias de entrega local.
- deliveries: seguimiento de entregas.
- expenses: gastos operativos.
- audit_logs: trazabilidad de operaciones administrativas.

Este esquema es preliminar. Las relaciones, restricciones,
moneda, políticas de borrado y reglas de cálculo se definirán
antes de crear las migraciones.

## 6. Reglas comerciales

- Los nombres de productos pueden repetirse; las variantes se
  identifican individualmente mediante SKU.
- El precio actual del catálogo no modifica ventas históricas.
- Los costes compartidos de importación deben asignarse con una
  regla explícita y documentada.
- Los pedidos, ventas, pagos e inventario son conceptos distintos.
- No se registra una venta confirmada solo por generar un carrito.
- Las operaciones críticas deben evitar duplicados y conservar
  trazabilidad ante errores o reintentos.

## 7. Seguridad

- El catálogo público solo expondrá los datos necesarios para vender.
- Los administradores deben autenticarse individualmente.
- Los permisos se aplicarán en PostgreSQL con RLS; ocultar botones
  en la interfaz no constituye una medida de seguridad.
- Las claves privilegiadas nunca se incluirán en variables VITE_*.
- Los cambios de stock, ventas y cobros se validarán en el servidor.

## 8. Orden de implementación

1. Revisar y aprobar el modelo de datos.
2. Diseñar migraciones y políticas RLS.
3. Probar permisos y operaciones críticas.
4. Implementar administración e inventario.
5. Construir la tienda pública.
6. Implementar finanzas, informes y auditoría.
7. Probar el sistema y preparar el despliegue.
