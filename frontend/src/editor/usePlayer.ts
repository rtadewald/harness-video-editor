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
  const velocidadeRef = useRef(1)
  const setVelocidade = useCallback((v: number) => {
    velocidadeRef.current = v
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
    if (!seq) return
    let raf = 0
    // O <video> pode ser trocado (cada etapa tem o seu Preview): a cada quadro, segue o elemento atual.
    let atual: HTMLVideoElement | null = null
    const toca = () => setTocando(true)
    const para = () => setTocando(false)
    // Emenda precisa: conferir o tempo só a cada quadro de tela e depois saltar deixa vazar dezenas de ms do que foi
    // cortado (o salto em si também demora). Perto do fim do trecho, agenda o salto para o instante exato (tempo
    // extrapolado pelo relógio do sistema), silencia o vídeo nesse instante e devolve o som quando o salto termina.
    let ultimoT = -1
    let ultimoEm = 0
    // o vídeo trocado (outro src: a voz limpa ficou pronta, outra limpeza): o elemento volta ao 0, parado, sem o evento
    // de pause; o player guarda onde estava e se tocava, e retoma dali quando o novo carrega
    let tocandoAgora = false
    let ondeEstava = 0
    let retomar: { t: number; tocar: boolean } | null = null
    // o vídeo trocado por outro elemento (cada etapa monta o seu Preview): o novo nasce no 0 e parado; o player leva ele
    // ao instante do anterior e retoma o play se tocava (visto no último quadro: tirar o elemento da página o pausa antes)
    let noQuadro: { t: number; tocar: boolean } | null = null
    let agendado: { fim: number; timer: number } | null = null
    const cancelarAgendado = () => {
      if (agendado) clearTimeout(agendado.timer)
      agendado = null
    }
    const saltarSilenciado = (v: HTMLVideoElement, destino: number | null) => {
      const estava = v.muted
      v.muted = true
      if (destino == null) {
        v.pause()
        v.muted = estava
        return
      }
      v.addEventListener('seeked', () => (v.muted = estava), { once: true })
      v.currentTime = destino
    }
    const LOOKAHEAD = 0.15 // s de vídeo antes do fim do trecho em que o salto é agendado
    const tocou = () => {
      tocandoAgora = true
      toca()
    }
    const parou = () => {
      tocandoAgora = false
      para()
    }
    const esvaziou = () => {
      retomar = { t: ondeEstava, tocar: tocandoAgora }
      tocandoAgora = false
      para()
    }
    const carregou = () => {
      const v = atual
      const r = retomar
      retomar = null
      if (!v || !r) return
      v.playbackRate = velocidadeRef.current
      v.currentTime = r.t
      if (r.tocar) void v.play().catch(() => {})
    }
    const ligar = (v: HTMLVideoElement | null) => {
      atual?.removeEventListener('play', tocou)
      atual?.removeEventListener('pause', parou)
      atual?.removeEventListener('emptied', esvaziou)
      atual?.removeEventListener('loadedmetadata', carregou)
      atual = v
      retomar = null
      if (!v) return
      v.addEventListener('play', tocou)
      v.addEventListener('pause', parou)
      v.addEventListener('emptied', esvaziou)
      v.addEventListener('loadedmetadata', carregou)
      v.playbackRate = velocidadeRef.current
      tocandoAgora = !v.paused
      setTocando(!v.paused)
      if (noQuadro) {
        retomar = noQuadro
        if (v.readyState >= 1) carregou() // já carregado (o mesmo arquivo em cache): leva agora
      }
    }
    const passo = () => {
      const v = ref.current
      if (v !== atual) ligar(v)
      if (!v) {
        raf = requestAnimationFrame(passo)
        return
      }
      const t = v.currentTime
      if (v.readyState < 1) {
        // carregando um src novo: o currentTime é 0 até ele carregar (o relógio fica onde estava)
        raf = requestAnimationFrame(passo)
        return
      }
      ondeEstava = t
      if (!retomar) noQuadro = { t, tocar: !v.paused }
      const agora = performance.now()
      if (t !== ultimoT || v.paused || v.seeking) {
        ultimoT = t
        ultimoEm = agora
      }
      setBruto((b) => (Math.abs(b - t) > 0.0005 ? t : b))
      if (v.paused || v.seeking) cancelarAgendado()
      else if (!agendado) {
        // onde o som está agora (o currentTime pode estar alguns ms atrasado)
        const est = t + Math.min((agora - ultimoEm) / 1000, 0.1) * v.playbackRate
        const trA = trechoRef.current
        const k = seq.clipes.findIndex((c) => est >= c.inicio && est < c.fim)
        const clipe = k >= 0 ? seq.clipes[k] : null
        const prox = k >= 0 ? (seq.clipes[k + 1] ?? null) : null
        const emendaReal = !!clipe && !(prox && prox.inicio - clipe.fim < 0.0005) // trechos colados não precisam de salto
        const fimTrecho = trA && !trA.loop && trA.ate > est ? trA.ate : Infinity
        const pulando = trA ? trA.pular : pularRef.current
        const fim = Math.min(fimTrecho, pulando && clipe && emendaReal ? clipe.fim : Infinity)
        if (fim - est < LOOKAHEAD) {
          const atrasoMs = Math.max(0, ((fim - est) / v.playbackRate) * 1000)
          agendado = {
            fim,
            timer: window.setTimeout(() => {
              agendado = null
              if (v.paused || v.seeking || Math.abs(v.currentTime - fim) > 0.3) return
              if (fim === fimTrecho) {
                saltarSilenciado(v, null)
                definirTrecho(null)
              } else saltarSilenciado(v, prox ? prox.inicio : null)
            }, atrasoMs),
          }
        }
      }
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
        if (prox) saltarSilenciado(v, prox.inicio)
        else {
          v.pause()
          setTempo(seq.duracao)
        }
      }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(raf)
      cancelarAgendado()
      ligar(null)
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
