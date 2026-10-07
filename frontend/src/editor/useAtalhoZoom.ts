import { useEffect, useRef } from 'react'

/** ⌘ + e ⌘ − (Ctrl no Windows) aproximam e afastam a linha do tempo da tela, no lugar do zoom da página do navegador. */
export function useAtalhoZoom(aproximar: () => void, afastar: () => void) {
  const acoes = useRef({ aproximar, afastar })
  acoes.current = { aproximar, afastar }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const mais = e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd'
      const menos = e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract'
      if (!mais && !menos) return
      e.preventDefault()
      e.stopPropagation()
      if (mais) acoes.current.aproximar()
      else acoes.current.afastar()
    }
    // na captura: ouvido antes de qualquer outro atalho da tela (e antes de o Chrome aplicar o zoom da página)
    window.addEventListener('keydown', tecla, { capture: true })
    return () => window.removeEventListener('keydown', tecla, { capture: true })
  }, [])
}
