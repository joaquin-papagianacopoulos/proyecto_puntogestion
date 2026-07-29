# PuntoGestion — Documentación

Esta guía explica qué hace la aplicación y cómo funciona cada parte, sin entrar en detalles técnicos. Está pensada para cualquier persona que use o administre el sistema, no hace falta saber de programación para entenderla.

---

## 1. Qué es PuntoGestion

PuntoGestion es un sistema para que una distribuidora (un negocio que vende productos a otros comercios a través de vendedores) organice todo su trabajo diario: armar pedidos, facturarlos, controlar el stock, llevar la cuenta de lo que le deben los clientes y de lo que la distribuidora le debe a otros, y ver cuánto se vendió.

Es un sistema pensado principalmente para usarse **desde el celular**, porque la mayoría de quienes lo usan (vendedores en la calle, dueños chequeando el negocio) no están sentados frente a una computadora.

Cada distribuidora que usa PuntoGestion tiene su propio espacio separado: sus productos, sus clientes, sus vendedores y sus pedidos no se mezclan nunca con los de otra distribuidora, aunque estén usando el mismo sistema al mismo tiempo.

---

## 2. Quién usa el sistema y qué puede hacer cada uno

### Dueño (Owner)
Es quien creó la cuenta de la distribuidora. Tiene acceso a absolutamente todo, y es el único que puede nombrar administradores o sacar a otro administrador del sistema.

### Administrador (Admin)
Tiene casi el mismo acceso que el dueño: puede facturar, ver todos los pedidos, gestionar productos, clientes, deudas, repartidores y vendedores. La única diferencia es que no puede crear ni eliminar a otro administrador — eso es exclusivo del dueño.

### Vendedor
Por defecto, un vendedor solo puede crear pedidos y ver los suyos propios. El dueño o administrador puede darle permisos extra, uno por uno, si hace falta:
- **Ver sus propias estadísticas**: cuánto vendió, qué productos, etc.
- **Ver todos los pedidos**: no solo los propios, sino los de todos los vendedores.
- **Editar sus propios pedidos**: modificar un pedido pendiente que él mismo cargó (mientras no esté facturado — una vez facturado, solo el dueño o un administrador lo puede tocar).

Un vendedor nunca puede facturar, ver o modificar precios base de productos, ni acceder a las secciones de administración (Equipo, Repartidores, Configuración, Control de Stock, Deudas).

### Administrador de la plataforma
Es un rol aparte, fuera de cualquier distribuidora — lo usa quien ofrece PuntoGestion como servicio. Se encarga de dar de alta nuevas distribuidoras (crear la cuenta del dueño inicial). No ve pedidos, productos ni nada del día a día de ninguna distribuidora.

---

## 3. Los módulos del sistema

### Inicio
Es la pantalla de entrada. Muestra un resumen rápido: cuántos pedidos se cargaron hoy, cuánto se vendió, cuántos pedidos están todavía sin facturar y, si hay productos con poco stock, un aviso para ir a revisarlos. También tiene accesos directos a las pantallas que más se usan.

### Crear pedido
Es la pantalla principal para un vendedor. Se elige un cliente (o se crea uno nuevo ahí mismo si es la primera vez que le vende), se buscan productos por nombre o código y se arma el pedido con las cantidades. Se puede dejar una anotación libre (por ejemplo "entregar antes de las 12" o "paga con cheque") que se borra sola cuando el pedido se factura, salvo que se marque expresamente para que quede impresa en la factura.

Si un producto no tiene stock disponible, igual se puede agregar al pedido — así la distribuidora sabe qué tiene que salir a comprar para completarlo.

### Pedidos
Lista todos los pedidos del día (o de la fecha que se elija), con el total y quién los cargó. Desde acá se pueden seleccionar varios pedidos para enviarlos por WhatsApp u otras apps (usando el propio selector de "compartir" del celular), y un administrador puede asignarles un repartidor.

### Modificaciones
Solo la ve el dueño o un administrador. Muestra un registro de todo lo que se cambió en los pedidos: quién lo cambió, cuándo, y exactamente qué se modificó (por ejemplo "agregó 3x Coca Cola, Cliente: Juan → Pedro").

### Estadísticas
Muestra cuánto se vendió en un período de fechas, separado por producto, y permite bajar un PDF con el detalle — útil para saber qué hay que reponer después de un día de ventas. Un vendedor con permiso ve solo sus propias ventas; un administrador puede filtrar por cualquier vendedor o ver el total.

### Facturar
Solo la ve el dueño o un administrador. Es donde los pedidos pendientes pasan a estado "Facturado". Desde acá se imprime o se comparte la boleta (factura) de cada pedido, se le puede sumar una deuda anterior del cliente al total, se asigna repartidor, y si el precio de algún producto cambió en el catálogo después de haberse cargado el pedido, aparece un aviso para actualizarlo con un solo toque antes de facturar.

### Productos
Solo la ve el dueño o un administrador. Es el catálogo completo: nombre, precio, costo, código, categoría, y si tiene control de stock. Se puede calcular el precio de venta automáticamente a partir del costo y un margen de ganancia deseado.

### Control de stock
Solo la ve el dueño o un administrador. Muestra qué productos tienen poco stock o ya no tienen, para saber qué reponer. Los niveles (alto, medio, bajo, sin stock) se calculan solos según cantidades que se pueden ajustar, y también se puede definir un umbral especial para un producto puntual si hace falta que avise antes que el resto.

### Deudas
Solo la ve el dueño o un administrador. Lleva la cuenta de lo que los clientes le deben a la distribuidora y de lo que la distribuidora le debe a terceros, con historial de pagos parciales y la posibilidad de adjuntar una foto (por ejemplo, de un comprobante).

### Equipo
Solo la ve el dueño o un administrador. Acá se agregan o quitan vendedores y administradores, y se les otorgan o sacan permisos específicos.

### Repartidores
Solo la ve el dueño o un administrador. Es la lista de repartidores disponibles para asignar a los pedidos. Si hay uno solo cargado, se asigna automáticamente a todas las boletas sin necesidad de elegirlo cada vez.

### Configuración
Solo la ve el dueño o un administrador. Desde acá se importa una lista de precios en Excel o CSV que mande un proveedor, actualizando automáticamente los precios de los productos que ya existen y creando los que sean nuevos, sin duplicar nada. También agrupa el acceso a Clientes.

### Clientes
Lista de todos los clientes de la distribuidora, con su dirección y datos de contacto.

---

## 4. Cómo se cuida la información

- **Cada distribuidora está completamente separada de las demás.** Aunque todas usan el mismo sistema, es imposible que una vea o modifique información de otra.
- **Los precios de un pedido nunca los puede escribir un vendedor a mano.** Siempre se toman del precio oficial del catálogo en el momento de cargar el pedido, así no hay manera de que alguien cargue un precio inventado.
- **Cada acción importante queda registrada** (quién facturó, quién modificó un pedido, quién asignó un repartidor), así siempre se puede saber qué pasó y quién lo hizo.
- **Un vendedor nunca puede tocar un pedido ya facturado.** Una vez facturado, solo el dueño o un administrador pueden modificarlo — esto evita que se altere algo después de que la boleta ya salió.
- **Las fotos y documentos que se suben (por ejemplo, comprobantes de deudas) no son públicos** — solo se pueden ver desde dentro del sistema, con sesión iniciada, y con un enlace que vence después de un tiempo.

---

## 5. Cosas a tener en cuenta

- El sistema necesita conexión a internet para funcionar. Todavía no existe una versión que permita cargar pedidos sin señal y que se sincronicen solos después — es algo que se evaluará más adelante como un desarrollo aparte.
- El control de stock por cantidad es opcional y producto por producto: si un proveedor no lleva un conteo real de stock, ese producto simplemente no se controla (no se descuenta ni avisa "poco stock"), pero se puede activar en cualquier momento.
