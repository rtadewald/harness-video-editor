import { useEffect, useRef, useState, } from 'react'
import {
  ArrowDown,
  
  ArrowUp,
  
  
  
  
  
  
  
  
  
  
  
  
  
  Image as 
  
  
  
  
  
  
  Pause,
  
  Play,
  
  
  Scissors,
  
  
  
  
  
  
  
  
  X,
} from 'lucide-react'
import {
  s1,
  NOME_TIPO_MIDIA,
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  urlBancoArquivo,
  urlBancoMiniatura,
  
  versaoBanco,
  
  
  
  
  
  
  
  type ItemBanco,
  
  type MidiaLigada,
} from '@/api'

/** Uma mídia ligada: o vídeo (um trecho toca só a parte dele) ou a imagem, ordem, editar (vídeo) e tirar. */
export default function MidiaCard(p: { m: MidiaLigada; item: ItemBanco | undefined; editar: () => void; subir?: () => void; descer?: () => void; tirar: () => void }) {
  const { m, item } = p
  return (
    // a mídia encosta nas bordas do card; só o texto e os botões têm margem
    <div className="grid gap-2 overflow-hidden rounded-[6px] pb-2.5 ring-1 ring-line-dark">
      {item?.tipo === 'video' ? (
        <PlayerTrecho key={`${m.banco}:${item.inicio ?? 0}:${item.fim ?? item.duracao}`} item={item} />
      ) : (
        <img src={urlBancoMiniatura(m.banco)} alt="" className="max-h-[200px] w-full bg-black object-contain" />
      )}
      <div className="flex items-center gap-2 px-2.5 text-[11.5px]">
        <span className="min-w-0 flex-1 truncate font-semibold" title={item?.descricao}>
          {item?.nome ?? m.banco}
        </span>
        {item && (
          <span className="shrink-0 text-fog">
            {item.pai ? `trecho · ${s1(item.duracao)} s` : `${NOME_TIPO_MIDIA[item.tipo]} · ${item.formato}`}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 text-[11px] text-fog">
        {item?.tipo === 'video' && (
          <button onClick={p.editar} className="flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-0.5 font-semibold hover:text-cream" title="Escolher trechos ou cortar as pontas">
            <Scissors className="size-3" /> Editar
          </button>
        )}
        <span className="ml-auto flex gap-1">
          <button onClick={p.subir} disabled={!p.subir} aria-label="Subir" className="grid size-6 place-items-center rounded-full hover:bg-cream/10 disabled:opacity-30">
            <ArrowUp className="size-3" />
          </button>
          <button onClick={p.descer} disabled={!p.descer} aria-label="Descer" className="grid size-6 place-items-center rounded-full hover:bg-cream/10 disabled:opacity-30">
            <ArrowDown className="size-3" />
          </button>
          <button onClick={p.tirar} aria-label="Tirar deste insert" className="grid size-6 place-items-center rounded-full hover:bg-coral/20 hover:text-coral">
            <X className="size-3" />
          </button>
        </span>
      </div>
    </div>
  )
}

/** Player pequeno de um vídeo do banco: num trecho, toca só ele e mostra o tempo dele (não o do original). */
function PlayerTrecho({ item }: { item: ItemBanco }) {
  const ref = useRef<HTMLVideoElement>(null)
  const ini = item.inicio ?? 0
  const fim = item.fim ?? item.duracao
  const dur = Math.max(fim - ini, 0.001)
  const [t, setT] = useState(0)
  const [tocando, setTocando] = useState(false)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const ir = () => (v.currentTime = ini)
    const tique = () => {
      if (v.currentTime >= fim - 0.02) {
        v.pause()
        v.currentTime = ini
      }
      setT(Math.max(0, Math.min(v.currentTime - ini, dur)))
    }
    const liga = () => setTocando(true)
    const desliga = () => setTocando(false)
    v.addEventListener('loadedmetadata', ir)
    v.addEventListener('timeupdate', tique)
    v.addEventListener('play', liga)
    v.addEventListener('pause', desliga)
    return () => {
      v.removeEventListener('loadedmetadata', ir)
      v.removeEventListener('timeupdate', tique)
      v.removeEventListener('play', liga)
      v.removeEventListener('pause', desliga)
    }
  }, [ini, fim, dur])
  const alternar = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) {
      if (v.currentTime < ini || v.currentTime >= fim - 0.02) v.currentTime = ini
      void v.play()
    } else v.pause()
  }
  const buscar = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const v = ref.current
    if (v) v.currentTime = ini + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur
  }
  return (
    <div className="group/p relative overflow-hidden bg-black">
      <video ref={ref} src={urlBancoArquivo(item.id) + versaoBanco(item)} muted playsInline preload="metadata" onClick={alternar} className="max-h-[200px] w-full cursor-pointer object-contain" />
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-1.5 text-[11px] text-cream tabular-nums">
        <button onClick={alternar} className="grid size-6 shrink-0 place-items-center rounded-full bg-cream/15 hover:bg-cream/25" aria-label={tocando ? 'Pausar' : 'Tocar'}>
          {tocando ? <Pause className="size-3" /> : <Play className="size-3 fill-current" />}
        </button>
        <span className="shrink-0">
          {s1(t)} / {s1(dur)} s
        </span>
        <div onPointerDown={buscar} className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-cream/25">
          <div className="absolute inset-y-0 left-0 rounded-full bg-coral" style={{ width: `${(t / dur) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}
