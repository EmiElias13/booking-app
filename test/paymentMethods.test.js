import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_CASH,
  PAYMENT_METHOD_CREDIT_CARD,
  describePayment,
  detectCardBrand,
  formatCardNumber,
  getPaymentMethod,
  isExpiryValid,
  isValidPaymentMethod,
  maskCardNumber,
  passesLuhn,
  validatePayment,
} from '../src/paymentMethods.js';

const NOW = new Date('2026-09-15T00:00:00Z');
const VALID_CARD = {
  cardHolder: 'Ana García',
  cardNumber: '4242 4242 4242 4242',
  expiry: '10/27',
  cvv: '123',
};

test('expone tarjeta de crédito y efectivo como métodos disponibles', () => {
  assert.deepEqual(
    PAYMENT_METHODS.map((method) => method.id),
    [PAYMENT_METHOD_CREDIT_CARD, PAYMENT_METHOD_CASH],
  );
  assert.equal(getPaymentMethod(PAYMENT_METHOD_CASH).label, 'Efectivo');
  assert.equal(getPaymentMethod(PAYMENT_METHOD_CREDIT_CARD).requiresDetails, true);
  assert.equal(getPaymentMethod(PAYMENT_METHOD_CASH).requiresDetails, false);
  assert.equal(isValidPaymentMethod('bitcoin'), false);
});

test('el pago en efectivo no pide datos adicionales', () => {
  assert.deepEqual(validatePayment({ method: PAYMENT_METHOD_CASH }, NOW), { valid: true, errors: {} });
});

test('rechaza un método de pago desconocido o ausente', () => {
  assert.equal(validatePayment({}, NOW).valid, false);
  assert.equal(validatePayment({ method: 'transferencia' }, NOW).errors.method, 'Selecciona un método de pago.');
});

test('acepta una tarjeta de crédito con datos completos', () => {
  assert.deepEqual(validatePayment({ method: PAYMENT_METHOD_CREDIT_CARD, details: VALID_CARD }, NOW), {
    valid: true,
    errors: {},
  });
});

test('reporta cada campo faltante de la tarjeta', () => {
  const { valid, errors } = validatePayment({ method: PAYMENT_METHOD_CREDIT_CARD, details: {} }, NOW);
  assert.equal(valid, false);
  assert.deepEqual(Object.keys(errors).sort(), ['cardHolder', 'cardNumber', 'cvv', 'expiry']);
});

test('valida el número de tarjeta con el algoritmo de Luhn', () => {
  assert.equal(passesLuhn('4242424242424242'), true);
  assert.equal(passesLuhn('4242424242424241'), false);

  const { errors } = validatePayment(
    { method: PAYMENT_METHOD_CREDIT_CARD, details: { ...VALID_CARD, cardNumber: '4242424242424241' } },
    NOW,
  );
  assert.equal(errors.cardNumber, 'El número de la tarjeta no es válido.');
});

test('rechaza tarjetas vencidas y acepta el mes de vencimiento en curso', () => {
  assert.equal(isExpiryValid('08/26', NOW), false);
  assert.equal(isExpiryValid('09/26', NOW), true);
  assert.equal(isExpiryValid('13/27', NOW), false);
  assert.equal(isExpiryValid('1027', NOW), false);
});

test('exige 4 dígitos de CVV para American Express y 3 para el resto', () => {
  const amex = { cardHolder: 'Ana García', cardNumber: '378282246310005', expiry: '10/27' };
  assert.equal(validatePayment({ method: PAYMENT_METHOD_CREDIT_CARD, details: { ...amex, cvv: '123' } }, NOW).errors.cvv,
    'El código de seguridad debe tener 4 dígitos.');
  assert.equal(validatePayment({ method: PAYMENT_METHOD_CREDIT_CARD, details: { ...amex, cvv: '1234' } }, NOW).valid, true);
  assert.equal(
    validatePayment({ method: PAYMENT_METHOD_CREDIT_CARD, details: { ...VALID_CARD, cvv: '1234' } }, NOW).errors.cvv,
    'El código de seguridad debe tener 3 dígitos.',
  );
});

test('detecta la marca de la tarjeta', () => {
  assert.equal(detectCardBrand('4242 4242 4242 4242'), 'Visa');
  assert.equal(detectCardBrand('5555555555554444'), 'Mastercard');
  assert.equal(detectCardBrand('378282246310005'), 'American Express');
  assert.equal(detectCardBrand('1234'), null);
});

test('formatea y enmascara el número de tarjeta', () => {
  assert.equal(formatCardNumber('4242424242424242'), '4242 4242 4242 4242');
  assert.equal(formatCardNumber('42424'), '4242 4');
  assert.equal(maskCardNumber('4242 4242 4242 4242'), '•••• 4242');
  assert.equal(maskCardNumber('42'), '');
});

test('describe el pago sin exponer el número completo de la tarjeta', () => {
  assert.equal(
    describePayment({ method: PAYMENT_METHOD_CREDIT_CARD, details: VALID_CARD }),
    'Tarjeta de crédito Visa •••• 4242',
  );
  assert.equal(describePayment({ method: PAYMENT_METHOD_CASH }), 'Efectivo — se paga en el local');
  assert.equal(describePayment({}), 'Sin método de pago');
});
