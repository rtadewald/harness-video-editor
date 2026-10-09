import { useEffect, useRef, type RefObject } from 'react'
import CanvasLook from '@/preprocessamento/CanvasLook'

/** Quanto a cópia salta à frente do principal num salto com a prévia tocando (s, na velocidade 1×): o que o principal
 *  anda enquanto ela busca o quadro e volta a tocar. Aprendido: cada salto conferido corrige o próximo (vale para todas
 *  as cópias; é a máquina e o vídeo que dizem). */
let adianta = 0.04
/** A diferença tolerada tocando (s): menos que um quadro a 30/s. */
const FOLGA = 0.02
/** Longe assim (um pulo, um corte da montagem), salta de novo. */
const PULO = 0.08

/** Uma cópia do vídeo do ator por cima do insert, no relógio do player principal: só a pessoa (o recorte, com
 *  transparência; a cabeça e os ombros saindo da área do ator) ou o ator inteiro na janela do "insert atrás". */
export default function AtorRecortado(p: { fonte: RefObject<HTMLVideoElement | null>; src: string; estilo: React.CSSProperties; enquadramentoX: number }) {
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    let id = 0
    // o último salto tocando: quando foi e quantas conferências já fez (no máximo 3 por salto)
    let salto: { em: number; vezes: number } | null = null
    const saltar = (a: HTMLVideoElement, b: HTMLVideoElement, vezes: number) => {
      b.currentTime = a.currentTime + adianta * a.playbackRate
      salto = { em: performance.now(), vezes }
    }
    const passo = () => {
      const a = p.fonte.current
      const b = v.current
      if (a && b && b.readyState >= 1) {
        // tocando, a cópia fica no mesmo quadro do principal sem mexer na velocidade (mudá-la faz o vídeo tropeçar um
        // quadro a cada vez): no play e num pulo, salta já à frente o que o principal anda até ela voltar a tocar; ~0,3 s
        // depois, confere e, se ficou mais de um quadro fora, aprende a diferença e salta de novo. Parada, fica
        // exatamente no quadro do principal
        const dif = a.currentTime - b.currentTime
        if (a.paused) {
          salto = null
          if (!b.paused) b.pause()
          if (Math.abs(dif) > 0.001 && !b.seeking) b.currentTime = a.currentTime
          b.playbackRate = a.playbackRate
        } else {
          if (b.playbackRate !== a.playbackRate) b.playbackRate = a.playbackRate
          if (!b.seeking) {
            if (b.paused || Math.abs(dif) > PULO) saltar(a, b, 0)
            else if (salto && performance.now() - salto.em > 300) {
              if (Math.abs(dif) > FOLGA && salto.vezes < 3) {
                adianta = Math.min(Math.max(adianta + dif / a.playbackRate, 0), 0.25)
                saltar(a, b, salto.vezes + 1)
              } else salto = null
            }
          }
          if (b.paused) void b.play().catch(() => {})
        }
      }
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [p.fonte])
  return (
    <>
    <video
      ref={v}
      src={p.src}
      muted
      playsInline
      preload="auto"
      className="pointer-events-none absolute inset-0 size-full object-cover"
      style={{ objectPosition: `${p.enquadramentoX * 100}% 50%`, ...p.estilo }}
    />
    <CanvasLook video={v} posX={p.enquadramentoX} />
    </>
  )
}
