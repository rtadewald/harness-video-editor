import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Crosshair, Loader2 } from 'lucide-react'
import { enviar, json, urlArquivo } from '@/api'
import { cn } from '@/lib/utils'

type Estado = {
  suavidade: 'calma' | 'normal' | 'agil'
  desloca: number
  aplica: boolean
  estado?: 'fila' | 'rodando' | 'pronto' | 'erro'
  progresso?: number
  erro?: string | null
  original?: string
  largura?: number
  altura?: number
  por_segundo?: number
  recorte?: number
  caminho?: number[]
}
const SUAVIDADES: { id: Estado['suavidade']; nome: string }[] = [
  { id: 'calma', nome: 'Calma' },
  { id: 'normal', nome: 'Normal' },
  { id: 'agil', nome: 'Ágil' },
]

/** A aba Enquadramento do Pré-processamento (docs/preprocessamento.md): num vídeo que veio 16:9, o original com o recorte
 *  9:16 andando sobre ele (o caminho da câmera, que segue o rosto) no mesmo instante do player, a suavidade, um
 *  deslocamento fixo e "Reenquadrar" (refaz o bruto 9:16; os cortes continuam). Num projeto de antes do enquadramento
 *  ainda horizontal, oferece converter. Num vídeo vertical, só avisa. `aoReenquadrar`: o Reenquadrar começou (o editor
 *  passa a acompanhar e recarrega o player quando o 9:16 e o proxy novos ficam prontos, em qualquer aba). */
export default function PainelEnquadramento(p: { projetoId: string; previa: ReactNode; bruto: number; tocando: boolean; aoReenquadrar: () => void }) {
  const [e, setE] = useState<Estado | null>(null)
  const [suav, setSuav] = useState<Estado['suavidade']>('normal')
  const [desloca, setDesloca] = useState(0)
  const original = useRef<HTMLVideoElement>(null)
  const ler = () =>
    fetch(`/api/projetos/${p.projetoId}/enquadramento`)
      .then(json<Estado>)
      .then((x) => {
        setE(x)
        return x
      })
  useEffect(() => {
    void ler().then((x) => {
      setSuav(x.suavidade)
      setDesloca(x.desloca)
    })
  }, [p.projetoId]) // eslint-disable-line react-hooks/exhaustive-deps
  // enquanto refaz, acompanha o progresso (ao terminar, a última leitura já traz o caminho novo)
  const rodando = e?.estado === 'fila' || e?.estado === 'rodando'
  useEffect(() => {
    if (!rodando) return
    const t = setInterval(() => void ler(), 1000)
    return () => clearInterval(t)
  }, [rodando]) // eslint-disable-line react-hooks/exhaustive-deps
  // o original no mesmo instante do player (o tempo do bruto é o mesmo)
  useEffect(() => {
    const v = original.current
    if (!v) return
    if (Math.abs(v.currentTime - p.bruto) > (p.tocando ? 0.25 : 0.04)) v.currentTime = p.bruto
    if (p.tocando && v.paused) void v.play().catch(() => {})
    if (!p.tocando && !v.paused) v.pause()
  }, [p.bruto, p.tocando])

  const centro = (() => {
    if (!e?.caminho?.length || !e.por_segundo) return 0.5
    const i = Math.min(p.bruto * e.por_segundo, e.caminho.length - 1)
    const a = Math.floor(i)
    const b = Math.min(a + 1, e.caminho.length - 1)
    return e.caminho[a] + (e.caminho[b] - e.caminho[a]) * (i - a)
  })()
  // um projeto de antes do enquadramento, com o bruto ainda 16:9: dá para converter (com a suavidade e o deslocamento escolhidos)
  const converter = !!e?.aplica && !e.original
  const mudou = !!e && (converter || suav !== e.suavidade || Math.abs(desloca - e.desloca) > 0.001)
  const reenquadrar = () =>
    void enviar<Estado>('PUT', `/api/projetos/${p.projetoId}/enquadramento`, { campos: { suavidade: suav, desloca } })
      .then((x) => {
        setE(x)
        p.aoReenquadrar()
      })
      .catch((x) => window.alert((x as Error).message))

  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_clamp(360px,34vw,560px)] gap-6 overflow-hidden px-6 py-6">
      <div className="min-h-0">{p.previa}</div>
      <section className="grid content-start gap-5 overflow-y-auto rounded-[8px] bg-cream/[0.03] p-5 ring-1 ring-line-dark">
        <div className="grid gap-1">
          <p className="eyebrow flex items-center gap-1.5 text-sage">
            <Crosshair className="size-3.5" /> Enquadramento
          </p>
          <p className="text-[12px] leading-[1.6] text-fog">
            {e && !e.aplica
              ? 'Este vídeo já é vertical (9:16): o enquadramento só vale para vídeos que chegam horizontais (16:9).'
              : converter
                ? 'Este vídeo é horizontal (16:9) e o projeto é de antes do enquadramento automático. Converta para 9:16: a câmera segue o seu rosto devagar (os cortes e o resto continuam).'
                : 'O vídeo chegou 16:9: a câmera segue o seu rosto devagar e gera o 9:16 que o resto do processo usa. O retângulo mostra o recorte no instante do player.'}
          </p>
        </div>
        {e?.aplica && (
          <>
            {e.original && (
            <div className="relative overflow-hidden rounded-[6px] bg-black ring-1 ring-line-dark" style={{ aspectRatio: `${e.largura ?? 16} / ${e.altura ?? 9}` }}>
              <video ref={original} src={urlArquivo(p.projetoId, e.original)} muted playsInline preload="auto" className="size-full object-contain" />
              {e.recorte && (
                <div
                  className="pointer-events-none absolute inset-y-0 rounded-[3px] ring-2 ring-yellow shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                  style={{ left: `${(centro - e.recorte / 2) * 100}%`, width: `${e.recorte * 100}%` }}
                />
              )}
            </div>
            )}
            <div className="grid gap-1.5">
              <span className="text-[11px] text-fog">Suavidade da câmera</span>
              <div className="flex rounded-full p-0.5 ring-1 ring-line-dark">
                {SUAVIDADES.map((s) => (
                  <button key={s.id} onClick={() => setSuav(s.id)} className={cn('flex-1 rounded-full py-1 text-[11.5px] font-semibold', suav === s.id ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}>
                    {s.nome}
                  </button>
                ))}
              </div>
            </div>
            <label className="grid gap-1.5">
              <span className="flex text-[11px] text-fog">
                Deslocamento do rosto no quadro
                <b className="ml-auto font-semibold text-cream tabular-nums">{desloca === 0 ? 'centro' : `${Math.round(Math.abs(desloca) * 100)}% ${desloca > 0 ? '←' : '→'}`}</b>
              </span>
              <input type="range" min={-0.3} max={0.3} step={0.02} value={desloca} onChange={(x) => setDesloca(Number(x.target.value))} className="accent-coral" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={reenquadrar}
                disabled={!mudou || rodando}
                className="flex items-center gap-1.5 rounded-full bg-cream px-4 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-40"
              >
                {rodando && <Loader2 className="size-3.5 animate-spin" />}
                {rodando ? `Reenquadrando… ${Math.round((e.progresso ?? 0) * 100)}%` : converter ? 'Converter para 9:16' : 'Reenquadrar'}
              </button>
              <span className="text-[11px] leading-[1.5] text-fog">{converter ? 'Gera o vídeo 9:16 (os cortes e o resto continuam).' : 'Refaz o vídeo 9:16 (os cortes e o resto continuam).'}</span>
            </div>
            {e.estado === 'erro' && <p className="text-[12px] text-coral">Não deu para reenquadrar: {e.erro}</p>}
          </>
        )}
      </section>
    </div>
  )
}
