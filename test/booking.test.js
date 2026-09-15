import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeBooking, validateBooking } from '../src/booking.js';
import { PAYMENT_METHOD_CASH, PAYMENT_METHOD_CREDIT_CARD } from '../src/paymentMethods.js';

const NOW = new Date('2026-09-15T00:00:00Z');

const baseBooking = {
  customerName: 'Ana García',
  email: 'ana@correo.com',
  serviceId: 'corte',
  date: '2026-09-20',
  time: '10:00',
};

test('una reserva pagada en efectivo es válida sin datos de tarjeta', () => {
  const result = validateBooking({ ...baseBooking, payment: { method: PAYMENT_METHOD_CASH } }, NOW);
  assert.deepEqual(result, { valid: true, errors: {} });
});

test('una reserva con tarjeta requiere los datos de la tarjeta', () => {
  const { valid, errors } = validateBooking(
    { ...baseBooking, payment: { method: PAYMENT_METHOD_CREDIT_CARD, details: {} } },
    NOW,
  );
  assert.equal(valid, false);
  assert.equal(errors['payment.cardNumber'], 'Ingresa el número de la tarjeta.');
});

test('una reserva sin método de pago no se puede confirmar', () => {
  const { valid, errors } = validateBooking(baseBooking, NOW);
  assert.equal(valid, false);
  assert.equal(errors['payment.method'], 'Selecciona un método de pago.');
});

test('valida los datos del cliente y de la cita', () => {
  const { errors } = validateBooking({ payment: { method: PAYMENT_METHOD_CASH } }, NOW);
  assert.deepEqual(Object.keys(errors).sort(), ['customerName', 'date', 'email', 'serviceId', 'time']);
});

test('el resumen incluye el método de pago y el total', () => {
  const summary = summarizeBooking({ ...baseBooking, payment: { method: PAYMENT_METHOD_CASH } });
  assert.equal(summary.service, 'Corte de cabello');
  assert.equal(summary.payment, 'Efectivo — se paga en el local');
  assert.match(summary.total, /350/);
});
