import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sequencia } from './sequencia'

/** Toca o bruto pulando os trechos cortados: o tempo exposto é o da saída (vídeo final). */
export function usePlayer(seq: Sequencia | null) {
  const ref = useRef<HTMLVideoElement>(null)
  const [tempo, setTempo] = useState(0)
  const [tocando, setTocando] = useState(false)

  useEffect(() => {
    const v = ref.current
    if (!v || !seq) return
    let raf = 0
    const passo = () => {
      const t = v.currentTime
      const s = seq.fonteParaSaida(t)
      if (s != null) setTempo(s)
      else {
        // caiu num trecho cortado: salta para o próximo clipe ou para no fim
        const prox = seq.clipes.find((c) => c.inicio > t)
        if (prox) v.currentTime = prox.inicio
        else {
          if (!v.paused) v.pause()
          setTempo(seq.duracao)
        }
      }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    const toca = () => setTocando(true)
    const para = () => setTocando(false)
    v.addEventListener('play', toca)
    v.addEventListener('pause', para)
    return () => {
      cancelAnimationFrame(raf)
      v.removeEventListener('play', toca)
      v.removeEventListener('pause', para)
    }
  }, [seq])

  const buscar = useCallback(
    (s: number) => {
      const v = ref.current
      if (!v || !seq) return
      const alvo = Math.min(Math.max(s, 0), Math.max(seq.duracao - 0.01, 0))
      v.currentTime = seq.saidaParaFonte(alvo)
      setTempo(alvo)
    },
    [seq],
  )

  const alternar = useCallback(() => {
    const v = ref.current
    if (!v || !seq) return
    if (!v.paused) return v.pause()
    if (tempo >= seq.duracao - 0.05) buscar(0)
    v.play()
  }, [seq, tempo, buscar])

  return { ref, tempo, tocando, buscar, alternar }
}
