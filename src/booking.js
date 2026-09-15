import { describePayment, validatePayment } from './paymentMethods.js';

export const SERVICES = [
  { id: 'corte', name: 'Corte de cabello', durationMin: 45, price: 350 },
  { id: 'color', name: 'Coloración', durationMin: 90, price: 850 },
  { id: 'barba', name: 'Arreglo de barba', durationMin: 30, price: 200 },
  { id: 'facial', name: 'Limpieza facial', durationMin: 60, price: 600 },
];

export function getService(id) {
  return SERVICES.find((service) => service.id === id) ?? null;
}

export function formatPrice(amount) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateBooking(booking = {}, reference = new Date()) {
  const errors = {};

  if (!String(booking.customerName ?? '').trim()) {
    errors.customerName = 'Ingresa tu nombre.';
  }
  if (!EMAIL_PATTERN.test(String(booking.email ?? '').trim())) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }
  if (!getService(booking.serviceId)) {
    errors.serviceId = 'Selecciona un servicio.';
  }
  if (!booking.date) {
    errors.date = 'Selecciona una fecha.';
  }
  if (!booking.time) {
    errors.time = 'Selecciona un horario.';
  }

  const payment = validatePayment(booking.payment, reference);
  for (const [field, message] of Object.entries(payment.errors)) {
    errors[`payment.${field}`] = message;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function summarizeBooking(booking = {}) {
  const service = getService(booking.serviceId);
  return {
    customerName: String(booking.customerName ?? '').trim(),
    email: String(booking.email ?? '').trim(),
    service: service?.name ?? '—',
    duration: service ? `${service.durationMin} min` : '—',
    total: service ? formatPrice(service.price) : '—',
    date: booking.date ?? '—',
    time: booking.time ?? '—',
    payment: describePayment(booking.payment),
  };
}
