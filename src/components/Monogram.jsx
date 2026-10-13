import { config } from '../config/clinic.config.js'

export default function Monogram() {
  const letter = (config.name.trim().charAt(0) || '?').toUpperCase()
  return (
    <span className="brand-monogram" aria-hidden="true">
      {letter}
    </span>
  )
}
