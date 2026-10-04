import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sequencia } from './sequencia'

/** Trecho do bruto tocado e depois parado (ouvir emenda, ouvir palavra). */
export type Trecho = { de: number; ate: number; pular: boolean; loop: boolean }

/** Toca o proxy do bruto. Em modo `pular`, salta os trechos cortados (o vídeo final nunca é renderizado aqui).
 *  Expõe dois relógios: `tempo` (no vídeo final) e `bruto` (no arquivo original). */
export function usePlayer(seq: Sequencia | null) {
  const ref = useRef<HTMLVideoElement>(null)
  const [tempo, setTempo] = useState(0)
  const [bruto, setBruto] = useState(0)
  const [tocando, setTocando] = useState(false)
  const [pular, setPularEstado] = useState(true)
  const [velocidade, setVelocidadeEstado] = useState(1)
  const [trecho, setTrechoEstado] = useState<Trecho | null>(null)
  const pularRef = useRef(true)
  const trechoRef = useRef<Trecho | null>(null)

  const setPular = useCallback((v: boolean) => {
    pularRef.current = v
    setPularEstado(v)
  }, [])
  /** 0,25× a 2×: devagar dá para ouvir uma emenda com calma; o tom é preservado. */
  const setVelocidade = useCallback((v: number) => {
    setVelocidadeEstado(v)
    if (ref.current) ref.current.playbackRate = v
  }, [])
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = velocidade
  }, [velocidade, seq])
  const definirTrecho = useCallback((t: Trecho | null) => {
    trechoRef.current = t
    setTrechoEstado(t)
  }, [])

  useEffect(() => {
    const v = ref.current
    if (!v || !seq) return
    let raf = 0
    const passo = () => {
      const t = v.currentTime
      setBruto((b) => (Math.abs(b - t) > 0.0005 ? t : b))
      const tr = trechoRef.current
      if (tr && !v.paused && t >= tr.ate) {
        if (tr.loop) v.currentTime = tr.de
        else {
          v.pause()
          definirTrecho(null)
        }
      }
      const s = seq.fonteParaSaida(t)
      if (s != null) setTempo(s)
      else if (!v.paused && (tr ? tr.pular : pularRef.current)) {
        // tocando e caiu num trecho cortado: salta para o próximo clipe ou para no fim.
        // Parado dentro de um corte, o vídeo fica onde está (dá para inspecionar o que saiu).
        const prox = seq.clipes.find((c) => c.inicio > t)
        if (prox) v.currentTime = prox.inicio
        else {
          v.pause()
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
  }, [seq, definirTrecho])

  /** Posição no vídeo final (segundos de saída). */
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

  /** Posição no bruto (segundos do arquivo original). */
  const buscarBruto = useCallback(
    (t: number) => {
      const v = ref.current
      if (!v || !seq) return
      const alvo = Math.min(Math.max(t, 0), v.duration || t)
      v.currentTime = alvo
      setBruto(alvo)
      const s = seq.fonteParaSaida(alvo)
      if (s != null) setTempo(s)
    },
    [seq],
  )

  const alternar = useCallback(() => {
    const v = ref.current
    if (!v || !seq) return
    if (!v.paused) {
      v.pause()
      definirTrecho(null)
      return
    }
    const ultimo = seq.clipes[seq.clipes.length - 1]
    if (pularRef.current && ultimo && v.currentTime >= ultimo.fim - 0.05) buscar(0)
    v.play()
  }, [seq, buscar, definirTrecho])

  const tocarTrecho = useCallback(
    (de: number, ate: number, opcoes: { pular?: boolean; loop?: boolean } = {}) => {
      const v = ref.current
      if (!v) return
      definirTrecho({ de, ate, pular: opcoes.pular ?? true, loop: opcoes.loop ?? false })
      v.currentTime = Math.max(de, 0)
      void v.play()
    },
    [definirTrecho],
  )

  return { ref, tempo, bruto, tocando, pular, setPular, velocidade, setVelocidade, trecho, buscar, buscarBruto, alternar, tocarTrecho }
}
