import { config } from '../config/clinic.config.js'

const baseStrings = {
  meta: { title: '{name} · Agenda tu cita', logoAlt: '{name}' },
  nav: { approvals: 'Solicitudes', team: 'Equipo', signOut: 'Cerrar sesión' },
  status: { pending: 'Pendiente', approved: 'Aprobada', declined: 'Rechazada' },
  home: {
    title: 'Solicita una cita',
    intro: 'Elige el horario que mejor te acomode. Nuestro equipo revisa cada solicitud y te confirma, normalmente en unas horas.',
    name: 'Nombre completo', namePh: 'Tu nombre',
    email: 'Correo electrónico', emailPh: 'tucorreo@ejemplo.com',
    phone: 'Teléfono', optional: '(opcional)',
    therapist: 'Fisioterapeuta', therapistPh: 'Elige con quién quieres tu cita',
    noTherapists: 'Por ahora no hay fisioterapeutas con agenda en línea. Contáctanos para agendar:',
    pickTherapistFirst: 'Elige un fisioterapeuta para ver sus horarios.',
    service: 'Tipo de cita', date: 'Fecha',
    slots: 'Horarios disponibles', slotTaken: 'Ocupado', dayClosed: 'No hay horarios este día.',
    notes: '¿Algo que debamos saber?', notesPh: 'Cuéntanos brevemente el motivo de tu cita.',
    submit: 'Solicitar cita', submitting: 'Enviando…',
    successTitle: 'Solicitud enviada.',
    success: '{date} a las {time} con {therapist} · {service}. Te escribiremos a {email} cuando la clínica confirme tu cita.',
    todayFull: 'Hoy ya no hay horarios. Te mostramos el siguiente día disponible.',
    noSlots: 'No hay horarios disponibles en los próximos 14 días. Contáctanos para agendar:',
    noSlotsNoContact: 'Intenta otra fecha o vuelve más tarde',
    loadError: 'No pudimos cargar los horarios. Revisa tu conexión e inténtalo de nuevo.',
    therapistsLoadError: 'No pudimos cargar los fisioterapeutas. Revisa tu conexión e inténtalo de nuevo.',
    slotsLoading: 'Cargando horarios…',
    therapistsLoading: 'Cargando fisioterapeutas…',
    retry: 'Reintentar',
    myRequests: 'Tus solicitudes', clinicNote: 'Mensaje de la clínica:',
  },
  errors: {
    name: 'Escribe tu nombre',
    email: 'Escribe un correo válido',
    date: 'Elige una fecha',
    time: 'Elige un horario',
    therapist: 'Elige un fisioterapeuta',
    slotTaken: 'Alguien acaba de apartar este horario. Elige otro.',
    booking: {
      slot_taken: 'Alguien acaba de apartar este horario. Elige otro.',
      past_slot: 'Ese horario ya pasó. Elige otro.',
      outside_hours: 'Ese horario ya no está disponible. Elige otro.',
      time_off: 'Ese día no hay atención con este fisioterapeuta. Elige otra fecha.',
      too_far: 'Solo se puede agendar hasta 3 meses adelante.',
      bad_time: 'Elige un horario de la lista.',
      inactive_staff: 'Este fisioterapeuta ya no tiene agenda en línea. Elige otro.',
      unknown_clinic: 'No pudimos enviar tu solicitud. Inténtalo de nuevo.',
    },
    send: 'No pudimos enviar tu solicitud. Inténtalo de nuevo.',
    signIn: 'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
    signInRequired: 'Inicia sesión para ver las solicitudes.',
    update: 'No pudimos actualizar la solicitud. Inténtalo de nuevo.',
    reach: 'No pudimos conectar con el servicio de citas. Inténtalo en un momento.',
    config: 'Falta configurar la app. Agrega VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_CLINIC_ID a .env.local.',
    notFound: 'No encontramos esa cita.',
    noClinicAccess: 'Tu cuenta no tiene acceso a esta clínica. Pide a quien administra la clínica que te agregue.',
  },
  login: {
    title: 'Acceso del equipo',
    intro: 'Solo el equipo de la clínica puede aprobar citas. Los pacientes pueden solicitar una sin crear cuenta.',
    email: 'Correo electrónico', emailPh: 'equipo@tuclinica.com',
    password: 'Contraseña',
    submit: 'Iniciar sesión', submitting: 'Entrando…',
  },
  approvals: {
    title: 'Solicitudes de cita',
    intro: 'Revisa las solicitudes nuevas, confirma las que te funcionen y rechaza las demás.',
    filters: { pending: 'Pendientes', approved: 'Aprobadas', declined: 'Rechazadas', all: 'Todas' },
    client: 'Paciente', email: 'Correo', phone: 'Teléfono',
    notePh: 'Mensaje para el paciente (opcional)',
    approve: 'Aprobar', decline: 'Rechazar', backToPending: 'Regresar a pendiente',
    yourNote: 'Tu mensaje:',
    loading: 'Cargando solicitudes…',
    empty: 'Aún no hay nada aquí. Las solicitudes de la página de citas aparecerán en esta lista.',
    therapist: 'Fisioterapeuta', allTherapists: 'Todos', unassigned: 'Sin asignar', inactiveSuffix: '(inactivo)',
    missingTherapist: 'Fisioterapeuta no disponible',
    emptyFiltered: 'No hay solicitudes de este fisioterapeuta en esta lista.',
    review: 'Revisar',
    teamLoadError: 'No pudimos cargar el equipo. Revisa tu conexión e inténtalo de nuevo.',
    reviewReasons: {
      inactive: 'El fisioterapeuta está inactivo.',
      timeOff: 'Cae en un día libre del fisioterapeuta.',
      outsideHours: 'Está fuera del horario del fisioterapeuta.',
    },
  },
  team: {
    title: 'Equipo',
    intro: 'Nombres, horarios y días libres de cada fisioterapeuta. Los pacientes solo ven el nombre.',
    loading: 'Cargando equipo…',
    empty: 'Aún no hay fisioterapeutas en esta clínica.',
    name: 'Nombre visible', order: 'Orden', active: 'Activo', inactive: 'Inactivo',
    save: 'Guardar', saved: 'Guardado',
    hours: 'Horario semanal', noHours: 'Sin horario: no se puede agendar con este fisioterapeuta.',
    addHours: 'Agregar horario', from: 'De', to: 'A', copyAll: 'Copiar a lun–sáb',
    timeOff: 'Días libres', noTimeOff: 'Sin días libres próximos.',
    addTimeOff: 'Agregar días libres', startDate: 'Desde', endDate: 'Hasta', reason: 'Motivo (solo equipo)',
    remove: 'Quitar',
    weekdays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    errors: {
      range: 'La hora final debe ser después de la inicial.',
      dates: 'La fecha final no puede ser antes de la inicial.',
      save: 'No pudimos guardar. Inténtalo de nuevo.',
      name: 'Escribe un nombre visible.',
      pastDates: 'La fecha final no puede ser antes de hoy.',
      overlap: 'Ese horario se cruza con otro que ya tiene este día.',
      overlapDays: 'Ese horario se cruza con otro que ya tiene: {days}.',
      staffLimit: 'Tu plan ya tiene el máximo de personas activas. Desactiva a alguien o cambia de plan.',
      lastAdmin: 'La clínica necesita al menos un administrador activo.',
      role: 'El rol no se puede cambiar desde aquí.',
      permission: 'No tienes permiso para hacer este cambio. Vuelve a iniciar sesión.',
      network: 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
    },
  },
  demo: {
    loginHint: 'Modo demo: entra con cualquier correo y contraseña.',
    banner: 'Estás viendo una demo. Los datos no se guardan.',
  },
}

// Clinic overrides from clinic.config.json `strings`; unknown keys kept, arrays replaced.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (UNSAFE_KEYS.has(k)) continue
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object'
      ? deepMerge(base[k], v) : v
  }
  return out
}

export const strings = deepMerge(baseStrings, config.strings)

export function t(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])))
}
