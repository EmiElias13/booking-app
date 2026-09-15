export const PAYMENT_METHOD_CREDIT_CARD = 'credit_card';
export const PAYMENT_METHOD_CASH = 'cash';

export const PAYMENT_METHODS = [
  {
    id: PAYMENT_METHOD_CREDIT_CARD,
    label: 'Tarjeta de crédito',
    description: 'Pago inmediato y reserva confirmada al instante.',
    icon: '💳',
    requiresDetails: true,
  },
  {
    id: PAYMENT_METHOD_CASH,
    label: 'Efectivo',
    description: 'Paga en el local al momento de tu cita.',
    icon: '💵',
    requiresDetails: false,
  },
];

export function getPaymentMethod(id) {
  return PAYMENT_METHODS.find((method) => method.id === id) ?? null;
}

export function isValidPaymentMethod(id) {
  return getPaymentMethod(id) !== null;
}

const CARD_BRANDS = [
  { name: 'Visa', pattern: /^4\d{12}(\d{3})?(\d{3})?$/ },
  { name: 'Mastercard', pattern: /^(5[1-5]\d{14}|2(2[2-9]\d{12}|[3-6]\d{13}|7[01]\d{12}|720\d{12}))$/ },
  { name: 'American Express', pattern: /^3[47]\d{13}$/ },
];

export function normalizeCardNumber(value) {
  return String(value ?? '').replace(/[\s-]/g, '');
}

export function formatCardNumber(value) {
  const digits = normalizeCardNumber(value).replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function detectCardBrand(cardNumber) {
  const digits = normalizeCardNumber(cardNumber);
  return CARD_BRANDS.find((brand) => brand.pattern.test(digits))?.name ?? null;
}

export function passesLuhn(cardNumber) {
  const digits = normalizeCardNumber(cardNumber);
  if (!/^\d+$/.test(digits)) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * `reference` lets callers validate against a fixed date; expiry is inclusive of
 * the whole expiration month, which is how card networks treat it.
 */
export function isExpiryValid(expiry, reference = new Date()) {
  const match = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})$/.exec(String(expiry ?? '').trim());
  if (!match) return false;

  const month = Number(match[1]);
  const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  const endOfMonth = new Date(year, month, 1);
  return endOfMonth > reference;
}

export function validateCreditCardDetails(details = {}, reference = new Date()) {
  const errors = {};
  const cardNumber = normalizeCardNumber(details.cardNumber);
  const holder = String(details.cardHolder ?? '').trim();
  const cvv = String(details.cvv ?? '').trim();

  if (!holder) {
    errors.cardHolder = 'Ingresa el nombre del titular.';
  } else if (holder.length < 3) {
    errors.cardHolder = 'El nombre del titular es demasiado corto.';
  }

  if (!cardNumber) {
    errors.cardNumber = 'Ingresa el número de la tarjeta.';
  } else if (!/^\d{13,19}$/.test(cardNumber)) {
    errors.cardNumber = 'El número de la tarjeta debe tener entre 13 y 19 dígitos.';
  } else if (!passesLuhn(cardNumber)) {
    errors.cardNumber = 'El número de la tarjeta no es válido.';
  }

  if (!details.expiry) {
    errors.expiry = 'Ingresa la fecha de vencimiento.';
  } else if (!isExpiryValid(details.expiry, reference)) {
    errors.expiry = 'Usa el formato MM/AA con una fecha vigente.';
  }

  const cvvLength = detectCardBrand(cardNumber) === 'American Express' ? 4 : 3;
  if (!cvv) {
    errors.cvv = 'Ingresa el código de seguridad.';
  } else if (!new RegExp(`^\\d{${cvvLength}}$`).test(cvv)) {
    errors.cvv = `El código de seguridad debe tener ${cvvLength} dígitos.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validatePayment(payment = {}, reference = new Date()) {
  const method = getPaymentMethod(payment.method);
  if (!method) {
    return { valid: false, errors: { method: 'Selecciona un método de pago.' } };
  }
  if (!method.requiresDetails) {
    return { valid: true, errors: {} };
  }
  return validateCreditCardDetails(payment.details, reference);
}

export function maskCardNumber(cardNumber) {
  const digits = normalizeCardNumber(cardNumber);
  if (digits.length < 4) return '';
  return `•••• ${digits.slice(-4)}`;
}

export function describePayment(payment = {}) {
  const method = getPaymentMethod(payment.method);
  if (!method) return 'Sin método de pago';
  if (method.id !== PAYMENT_METHOD_CREDIT_CARD) {
    return `${method.label} — se paga en el local`;
  }

  const brand = detectCardBrand(payment.details?.cardNumber);
  const masked = maskCardNumber(payment.details?.cardNumber);
  return [method.label, brand, masked].filter(Boolean).join(' ');
}
