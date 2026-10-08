import { useEffect, useState } from 'react'

function easeOutCubic(progress) {
  return 1 - (1 - progress) ** 3
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useCountUp(target, duration = 600) {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? target : 0))

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(target)
      return
    }

    const from = 0
    const start = performance.now()
    let frame

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      setDisplay(Math.round(from + (target - from) * easeOutCubic(progress)))
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        setDisplay(target)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  return display
}
