import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Optional clinic branding: CLINIC_CONFIG_PATH points at a clinic repo's
// clinic.config.json. Unset = template defaults ("Tu Clínica").
// This JSON is baked into the public bundle: never put secrets in it.
const configPath = process.env.CLINIC_CONFIG_PATH
// Only known keys reach the bundle; anything else (incl. clinicId, which only
// ever comes from VITE_CLINIC_ID) is dropped.
const ALLOWED_KEYS = ['name', 'shortName', 'logo', 'logoAlt', 'locale', 'themeColor', 'accent', 'accentSoft',
  'accentDeep', 'phonePlaceholder', 'services', 'slots', 'strings', 'contact']
// `timeSlots` was retired in D3: slots now come from each therapist's hours (get_available_slots).
const raw = configPath ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const clinic = Object.fromEntries(ALLOWED_KEYS.filter((k) => Object.hasOwn(raw, k)).map((k) => [k, raw[k]]))
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: { __CLINIC_CONFIG__: JSON.stringify(clinic) },
  plugins: [
    react(),
    {
      name: 'clinic-html',
      // order: 'pre' so Vite's own HTML pass prefixes the injected favicon href with `base`.
      transformIndexHtml: { order: 'pre', handler(html) {
        if (!clinic.name) return html
        let out = html.replace(/<title>.*<\/title>/, `<title>${esc(clinic.name)} · Agenda tu cita</title>`)
        if (clinic.themeColor) out = out.replace(/(name="theme-color" content=")[^"]*/, `$1${esc(clinic.themeColor)}`)
        if (clinic.logo) out = out.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="/${esc(clinic.logo.replace(/^\//, ''))}" />`)
        return out
      } },
    },
  ],
})
