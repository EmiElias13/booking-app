export const config = {
  name: 'Tu Clínica',
  shortName: 'Clínica',
  clinicId: import.meta.env.VITE_CLINIC_ID ?? '',
  logo: '',
  locale: 'es-MX',
  themeColor: '#6b3a96',
  phonePlaceholder: '555 123 4567',
  services: [
    { id: 'initial', label: 'Primera cita (60 min)' },
    { id: 'followup', label: 'Seguimiento (45 min)' },
    { id: 'short', label: 'Cita breve (30 min)' },
  ],
  timeSlots: ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'],
}
