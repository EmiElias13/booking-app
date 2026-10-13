import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Optional clinic branding: CLINIC_CONFIG_PATH points at a clinic repo's
// clinic.config.json. Unset = template defaults ("Tu Clínica").
// This JSON is baked into the public bundle: never put secrets in it.
const configPath = process.env.CLINIC_CONFIG_PATH
const clinic = configPath ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: { __CLINIC_CONFIG__: JSON.stringify(clinic) },
  plugins: [
    react(),
    {
      name: 'clinic-html',
      transformIndexHtml(html) {
        if (!clinic.name) return html
        let out = html.replace(/<title>.*<\/title>/, `<title>${esc(clinic.name)} · Agenda tu cita</title>`)
        if (clinic.themeColor) out = out.replace(/(name="theme-color" content=")[^"]*/, `$1${esc(clinic.themeColor)}`)
        if (clinic.logo) out = out.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="/${esc(clinic.logo.replace(/^\//, ''))}" />`)
        return out
      },
    },
  ],
})
