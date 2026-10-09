import { useEffect, useRef, useState } from 'react'

function easeOutCubic(progress) {
  return 1 - (1 - progress) ** 3
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useCountUp(target, duration = 600) {
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? target : 0))
  const displayedRef = useRef(prefersReducedMotion() ? target : 0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      displayedRef.current = target
      setDisplay(target)
      return
    }

    const from = displayedRef.current
    const start = performance.now()
    let frame

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      const next = progress < 1 ? Math.round(from + (target - from) * easeOutCubic(progress)) : target
      displayedRef.current = next
      setDisplay(next)
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  return display
}
