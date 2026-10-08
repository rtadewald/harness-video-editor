import { useEffect, useRef, type RefObject } from 'react'

/** Uma cópia do vídeo do ator por cima do insert, no relógio do player principal: só a pessoa (o recorte, com
 *  transparência; a cabeça e os ombros saindo da área do ator) ou o ator inteiro na janela do "insert atrás". */
export default function AtorRecortado(p: { fonte: RefObject<HTMLVideoElement | null>; src: string; estilo: React.CSSProperties; enquadramentoX: number }) {
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    let id = 0
    const passo = () => {
      const a = p.fonte.current
      const b = v.current
      if (a && b && b.readyState >= 1) {
        if (Math.abs(b.currentTime - a.currentTime) > 0.12) b.currentTime = a.currentTime
        if (a.paused !== b.paused) void (a.paused ? b.pause() : b.play().catch(() => {}))
        b.playbackRate = a.playbackRate
      }
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [p.fonte])
  return (
    <video
      ref={v}
      src={p.src}
      muted
      playsInline
      preload="auto"
      className="pointer-events-none absolute inset-0 size-full object-cover"
      style={{ objectPosition: `${p.enquadramentoX * 100}% 50%`, ...p.estilo }}
    />
  )
}
