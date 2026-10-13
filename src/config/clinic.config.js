// Template defaults. A clinic repo's clinic.config.json (see vite.config.js)
// is merged over these at build time. Arrays replace defaults wholesale.
const defaults = {
  name: 'Tu Clínica',
  shortName: 'Clínica',
  logo: '',
  logoAlt: '',
  locale: 'es-MX',
  themeColor: '#6b3a96',
  accentSoft: '#f3eaf8',
  accentDeep: '#4e2870',
  phonePlaceholder: '555 123 4567',
  services: [
    { id: 'initial', label: 'Primera cita (60 min)' },
    { id: 'followup', label: 'Seguimiento (45 min)' },
    { id: 'short', label: 'Cita breve (30 min)' },
  ],
  timeSlots: ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'],
  strings: {},
  contact: {},
}

// eslint-disable-next-line no-undef
const clinic = typeof __CLINIC_CONFIG__ === 'undefined' ? {} : __CLINIC_CONFIG__
// eslint-disable-next-line no-unused-vars
const { clinicId: _ignored, ...overrides } = clinic // clinic id only ever from env

export const config = {
  ...defaults,
  ...overrides,
  clinicId: import.meta.env.VITE_CLINIC_ID ?? '',
}
