# booking-app

Appointment and booking app.

Aplicación de reservas de citas: el cliente elige un servicio, una fecha y un horario,
y selecciona su **método de pago**.

## Métodos de pago

| Método | Id | Datos requeridos |
| --- | --- | --- |
| Tarjeta de crédito | `credit_card` | Titular, número, vencimiento (MM/AA) y código de seguridad |
| Efectivo | `cash` | Ninguno; se paga en el local al llegar a la cita |

Al elegir **tarjeta de crédito** se muestra el formulario de la tarjeta, que valida:

- Número de 13 a 19 dígitos que pase el algoritmo de Luhn.
- Marca detectada automáticamente (Visa, Mastercard, American Express).
- Vencimiento vigente, considerando válido todo el mes de expiración.
- CVV de 3 dígitos (4 para American Express).

Al elegir **efectivo** no se piden datos de tarjeta: solo se muestra el aviso de pago en
el local. El resumen de la reserva nunca expone el número completo de la tarjeta, solo
los últimos cuatro dígitos.

## Estructura

```
index.html                    Formulario de reserva
src/paymentMethods.js         Métodos de pago y validación de la tarjeta
src/booking.js                Servicios, validación y resumen de la reserva
src/app.js                    Conexión con el DOM
src/styles.css                Estilos
test/                         Pruebas (node:test)
```

## Uso

Requiere Node.js 20 o superior.

```bash
npm start   # sirve la app en http://localhost:3000
npm test    # ejecuta las pruebas
```
