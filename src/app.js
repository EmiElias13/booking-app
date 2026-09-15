import { SERVICES, formatPrice, getService, summarizeBooking, validateBooking } from './booking.js';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_CASH,
  PAYMENT_METHOD_CREDIT_CARD,
  detectCardBrand,
  formatCardNumber,
} from './paymentMethods.js';

const OPENING_HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00'];

const form = document.getElementById('booking-form');
const serviceSelect = document.getElementById('service-select');
const timeSelect = document.getElementById('time-select');
const dateInput = document.getElementById('date-input');
const methodsContainer = document.getElementById('payment-methods');
const cardDetails = document.getElementById('card-details');
const cashNotice = document.getElementById('cash-notice');
const cardBrandBadge = document.getElementById('card-brand');
const totalAmount = document.getElementById('total-amount');
const confirmation = document.getElementById('confirmation');
const summaryList = document.getElementById('summary');

let selectedMethod = PAYMENT_METHOD_CREDIT_CARD;

function renderServices() {
  serviceSelect.innerHTML = '<option value="">Selecciona un servicio</option>';
  for (const service of SERVICES) {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = `${service.name} · ${service.durationMin} min · ${formatPrice(service.price)}`;
    serviceSelect.append(option);
  }
}

function renderTimes() {
  timeSelect.innerHTML = '<option value="">Selecciona un horario</option>';
  for (const time of OPENING_HOURS) {
    const option = document.createElement('option');
    option.value = time;
    option.textContent = time;
    timeSelect.append(option);
  }
}

function renderPaymentMethods() {
  methodsContainer.innerHTML = '';
  for (const method of PAYMENT_METHODS) {
    const option = document.createElement('label');
    option.className = 'method';
    option.innerHTML = `
      <input type="radio" name="paymentMethod" value="${method.id}" />
      <span class="method__icon" aria-hidden="true">${method.icon}</span>
      <span class="method__text">
        <span class="method__label">${method.label}</span>
        <span class="method__description">${method.description}</span>
      </span>
    `;
    methodsContainer.append(option);
  }

  methodsContainer.addEventListener('change', (event) => {
    if (event.target.name !== 'paymentMethod') return;
    selectedMethod = event.target.value;
    syncPaymentMethod();
  });

  const initial = methodsContainer.querySelector(`input[value="${selectedMethod}"]`);
  if (initial) initial.checked = true;
  syncPaymentMethod();
}

function syncPaymentMethod() {
  const isCard = selectedMethod === PAYMENT_METHOD_CREDIT_CARD;
  cardDetails.hidden = !isCard;
  cashNotice.hidden = selectedMethod !== PAYMENT_METHOD_CASH;

  for (const option of methodsContainer.querySelectorAll('.method')) {
    option.classList.toggle('method--selected', option.querySelector('input').checked);
  }
  // Hidden card inputs keep stale errors visible otherwise.
  if (!isCard) {
    for (const key of ['cardHolder', 'cardNumber', 'expiry', 'cvv']) {
      setError(`payment.${key}`, '');
    }
  }
}

function updateTotal() {
  const service = getService(serviceSelect.value);
  totalAmount.textContent = service ? formatPrice(service.price) : '—';
}

function setError(field, message) {
  const node = form.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
  if (node) node.textContent = message ?? '';
}

function clearErrors() {
  for (const node of form.querySelectorAll('.field__error')) {
    node.textContent = '';
  }
}

function readBooking() {
  const data = new FormData(form);
  return {
    customerName: data.get('customerName'),
    email: data.get('email'),
    serviceId: data.get('serviceId'),
    date: data.get('date'),
    time: data.get('time'),
    payment: {
      method: selectedMethod,
      details: {
        cardHolder: data.get('cardHolder'),
        cardNumber: data.get('cardNumber'),
        expiry: data.get('expiry'),
        cvv: data.get('cvv'),
      },
    },
  };
}

function renderSummary(booking) {
  const summary = summarizeBooking(booking);
  const rows = [
    ['Nombre', summary.customerName],
    ['Correo', summary.email],
    ['Servicio', summary.service],
    ['Duración', summary.duration],
    ['Fecha', summary.date],
    ['Hora', summary.time],
    ['Método de pago', summary.payment],
    ['Total', summary.total],
  ];

  summaryList.innerHTML = '';
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    summaryList.append(term, description);
  }
  confirmation.hidden = false;
  confirmation.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors();

  const booking = readBooking();
  const { valid, errors } = validateBooking(booking);
  if (!valid) {
    confirmation.hidden = true;
    for (const [field, message] of Object.entries(errors)) {
      setError(field, message);
    }
    const firstInvalid = form.querySelector('.field__error:not(:empty)');
    firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  renderSummary(booking);
});

form.elements.cardNumber.addEventListener('input', (event) => {
  event.target.value = formatCardNumber(event.target.value);
  cardBrandBadge.textContent = detectCardBrand(event.target.value) ?? '';
});

form.elements.expiry.addEventListener('input', (event) => {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
  event.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
});

form.elements.cvv.addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
});

serviceSelect.addEventListener('change', updateTotal);

renderServices();
renderTimes();
renderPaymentMethods();
updateTotal();
dateInput.min = new Date().toISOString().slice(0, 10);
