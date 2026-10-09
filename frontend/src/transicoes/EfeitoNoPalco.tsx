import { useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useCatalogoSons, useSonsNoTempo } from '@/editor/sons'
import { LUZ, TransicoesDoVideo, efeitoNoTempo, sonsDasTransicoes, type CorteDoVideo } from './transicoes'

/** O palco do player com as transições entre planos (SPEC §8.8): o conteúdo (o ator, o look, os inserts) recebe a escala
 *  e o desfoque do zoom; por cima, o véu branco do brilho e o vídeo da luz colorida; e os sons tocam no corte. A curva é
 *  a mesma da exportação. `altura`: a altura do palco em px (o desfoque é proporcional a ela, como no ffmpeg); `cortes`:
 *  outros cortes no lugar dos do vídeo aberto (a página Transições); `mudo`: sem os sons; `desligado`: sem nada (as etapas
 *  em que o quadro ainda não está montado). */
export default function EfeitoNoPalco(p: { tempo: number; tocando: boolean; altura: number; cortes?: CorteDoVideo[]; mudo?: boolean; desligado?: boolean; children: ReactNode }) {
  const doVideo = useContext(TransicoesDoVideo)
  const cortes = p.desligado ? null : (p.cortes ?? doVideo)
  const e = cortes ? efeitoNoTempo(cortes, p.tempo) : null
  const cat = useCatalogoSons()
  const eventos = useMemo(() => (cortes ? sonsDasTransicoes(cortes, cat) : []), [cortes, cat])
  useSonsNoTempo(eventos, p.tempo, p.tocando && !p.mudo)
  // os sons esperados, para os testes de ponta a ponta (só quando o teste cria o registro)
  useEffect(() => {
    const w = window as Window & { __sonsLog?: unknown[]; __sonsEsperados?: unknown }
    if (w.__sonsLog && !p.cortes) w.__sonsEsperados = eventos.map((e) => ({ som: e.som, t: e.t, dur: e.dur ?? null }))
  }, [eventos, p.cortes])
  const luz = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = luz.current
    if (!v || e?.luz == null) return
    if (Math.abs(v.currentTime - e.luz) > (p.tocando ? 0.12 : 0.02)) v.currentTime = e.luz
    if (p.tocando && v.paused) void v.play().catch(() => {})
    if (!p.tocando && !v.paused) v.pause()
  }, [e?.luz, p.tocando])
  const zoom = e && (e.escala !== 1 || e.desfoque > 0)
  // o desfoque como no MP4: o σ cresce com a curva até altura/120 e vale no quadro já ampliado (o blur() do CSS é aplicado
  // antes da escala do mesmo elemento, então sai dividido por ela)
  // `isolate`: o que está dentro (o card do comentário, o ator por cima do insert) fica embaixo da luz, do branco e da
  // legenda, como no MP4, mesmo com z-index próprio
  return (
    <>
      <div
        className="absolute inset-0 isolate"
        style={zoom ? { transform: `scale(${e.escala})`, filter: e.desfoque > 0.01 ? `blur(${(e.desfoque * p.altura) / 120 / e.escala}px)` : undefined } : undefined}
      >
        {p.children}
      </div>
      {e && e.branco > 0.005 && <div className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: e.branco }} />}
      {e?.luz != null && <video ref={luz} src={LUZ.src} muted playsInline preload="auto" className="pointer-events-none absolute inset-0 size-full object-cover" />}
    </>
  )
}
