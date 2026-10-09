import { useEffect, useRef, useState, } from 'react'
import {
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  Image as 
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  X,
} from 'lucide-react'
import {
  s1,
  
  
  PROPORCOES_CAPTURA,
  capturarSite,
  
  
  
  
  
  
  
  
  previaSite,
  
  
  
  
  urlPreviaSite,
  
  
  
  
  
  
  
  type InsertsProjeto,
  
  
  
  type PreviaSite,
  type ProporcaoCaptura,
} from '@/api'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import { type PedidoNoTempo } from '@/inserts/InsertNoLugar'

type Pedido = PedidoNoTempo

/** Captura de site (SPEC §8.3). Rápido por padrão: URL, proporção e "Capturar" grava a 1ª dobra (com o carregamento).
 *  Com "Várias dobras", abre a página inteira numa imagem: clicar no vazio marca uma dobra (até 3), clicar numa dobra a
 *  seleciona e arrastá-la a move; o × (ou Delete) apaga. */
export default function CapturaDeSite(p: { projetoId: string; pedido: Pedido; fechar: () => void; pronto: (r: InsertsProjeto) => void }) {
  type Dobra = { id: number; y: number }
  const [url, setUrl] = useState('')
  const [proporcao, setProporcao] = useState<ProporcaoCaptura>(p.pedido.capturas?.at(-1)?.proporcao ?? (p.pedido.formato === 'vertical' ? '9:16' : '16:9'))
  const [varias, setVarias] = useState(false)
  const [previa, setPrevia] = useState<PreviaSite | null>(null)
  const [abrindo, setAbrindo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [dobras, setDobras] = useState<Dobra[]>([{ id: 0, y: 0 }])
  const [sel, setSel] = useState<number | null>(null)
  const imagem = useRef<HTMLDivElement>(null)
  const prox = useRef(1)
  const [duracao, setDuracao] = useState(5) // s por dobra
  const ordenadas = [...dobras].sort((a, b) => a.y - b.y)

  const abrir = async () => {
    setAbrindo(true)
    setErro('')
    setPrevia(null)
    setDobras([{ id: 0, y: 0 }])
    setSel(null)
    try {
      setPrevia(await previaSite(p.projetoId, url, proporcao))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAbrindo(false)
    }
  }
  const capturar = async () => {
    setEnviando(true)
    setErro('')
    try {
      const alvo = previa ? { url: previa.url, titulo: previa.titulo, dobras: ordenadas.map((d) => d.y) } : { url, dobras: [0] }
      p.pronto(await capturarSite(p.projetoId, p.pedido.id, { ...alvo, proporcao, duracao }))
    } catch (e) {
      setErro((e as Error).message)
      setEnviando(false)
    }
  }

  // y (px da página) a partir do mouse, com a dobra inteira dentro da página
  const yDe = (clientY: number, deslocamento = 0) => {
    const r = imagem.current!.getBoundingClientRect()
    const y = ((clientY - r.top) / r.height) * previa!.altura_pagina - deslocamento
    return Math.round(Math.max(0, Math.min(y, previa!.altura_pagina - previa!.altura_janela)))
  }
  const marcar = (e: React.PointerEvent) => {
    if (!previa || dobras.length >= 3) return
    const id = prox.current++
    setDobras((d) => [...d, { id, y: yDe(e.clientY, previa.altura_janela / 2) }])
    setSel(id)
  }
  const arrastar = (e: React.PointerEvent, d: Dobra) => {
    e.stopPropagation()
    setSel(d.id)
    const r = imagem.current!.getBoundingClientRect()
    const pega = ((e.clientY - r.top) / r.height) * previa!.altura_pagina - d.y // onde, dentro da dobra, o mouse pegou
    const mover = (ev: PointerEvent) => setDobras((l) => l.map((x) => (x.id === d.id ? { ...x, y: yDe(ev.clientY, pega) } : x)))
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  const tirar = (id: number) => {
    setDobras((l) => (l.length > 1 ? l.filter((x) => x.id !== id) : l))
    setSel(null)
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel != null && !(e.target as HTMLElement).closest('input')) tirar(sel)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  return (
    <Modal titulo="Capturar site" fechar={p.fechar} tamanho={previa ? 'largo' : 'pequeno'}>
      <input
        autoFocus
        value={url}
        onChange={(e) => {
          setUrl(e.target.value)
          setPrevia(null)
        }}
        onKeyDown={(e) => e.key === 'Enter' && url.trim() && void (varias ? abrir() : capturar())}
        placeholder="Insira o endereço do site"
        className="h-10 w-full rounded-full border border-line-dark bg-deeper px-4 text-[13px] text-cream outline-none focus:border-cream/40"
      />
      <div className="flex flex-wrap items-center gap-2">
        {PROPORCOES_CAPTURA.map((f) => (
          <button
            key={f}
            onClick={() => {
              setProporcao(f)
              setPrevia(null)
            }}
            className={cn('h-8 rounded-full px-3 text-[12px] font-semibold', proporcao === f ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream')}
            title={f === '9:16' ? 'Versão de computador, em pé' : 'Versão de computador'}
          >
            {f}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-fog" title="Quanto tempo gravar cada dobra (1 a 30 s)">
          Gravar
          <input
            type="number"
            min={1}
            max={30}
            step={0.5}
            value={duracao}
            onChange={(e) => setDuracao(Math.max(1, Math.min(30, Number(e.target.value) || 5)))}
            className="h-8 w-14 rounded-full border border-line-dark bg-deeper px-2 text-center text-[12px] text-cream tabular-nums outline-none focus:border-cream/40"
          />
          s
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-fog">
          <input
            type="checkbox"
            checked={varias}
            onChange={(e) => {
              setVarias(e.target.checked)
              setPrevia(null)
            }}
            className="accent-coral"
          />
          Várias dobras
        </label>
      </div>
      {erro && <p className="text-[12px] text-coral">{erro}</p>}

      {!varias ? (
        <button
          onClick={() => void capturar()}
          disabled={!url.trim() || enviando}
          className="h-10 rounded-full bg-coral text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : `Capturar · ${s1(duracao)} s do topo, com o carregamento`}
        </button>
      ) : !previa ? (
        <button
          onClick={() => void abrir()}
          disabled={!url.trim() || abrindo}
          className="h-10 rounded-full bg-coral text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
        >
          {abrindo ? 'Lendo a página inteira…' : 'Ler a página para marcar as dobras'}
        </button>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px] gap-5">
          <div className="min-h-0 overflow-y-auto rounded-[6px] bg-black">
            <div
              ref={imagem}
              onPointerDown={marcar}
              className={cn('relative mx-auto select-none', dobras.length < 3 ? 'cursor-crosshair' : 'cursor-default')}
              style={{ maxWidth: proporcao === '9:16' ? 360 : undefined }}
            >
              <img src={urlPreviaSite(p.projetoId, previa.id)} alt="" draggable={false} className="pointer-events-none block w-full" />
              {ordenadas.map((d, k) => (
                <div
                  key={d.id}
                  onPointerDown={(e) => arrastar(e, d)}
                  className={cn(
                    'absolute inset-x-0 cursor-grab border-2 active:cursor-grabbing',
                    sel === d.id ? 'z-10 border-yellow bg-yellow/15' : 'border-coral bg-coral/10',
                  )}
                  style={{ top: `${(d.y / previa.altura_pagina) * 100}%`, height: `${(previa.altura_janela / previa.altura_pagina) * 100}%` }}
                >
                  <span className={cn('absolute top-1 left-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', sel === d.id ? 'bg-yellow text-ink' : 'bg-coral text-cream')}>
                    Dobra {k + 1}
                  </span>
                  {dobras.length > 1 && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => tirar(d.id)}
                      className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-ink/90 text-fog ring-1 ring-line-dark hover:text-coral"
                      aria-label="Tirar dobra"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-3 text-[12px]">
            <p className="font-semibold">{previa.titulo}</p>
            <p className="leading-[1.6] text-fog">
              Clique na página para marcar uma dobra (até 3); arraste para mudar de lugar; × apaga. Cada dobra grava {s1(duracao)} s parada, com as animações de entrada.
            </p>
            <div className="grid gap-1">
              {ordenadas.map((d, k) => (
                <button
                  key={d.id}
                  onClick={() => setSel(d.id)}
                  className={cn('flex items-center gap-2 rounded-[4px] px-2 py-1.5 text-left', sel === d.id ? 'bg-cream/12' : 'hover:bg-cream/6')}
                >
                  <span className="font-semibold">Dobra {k + 1}</span>
                  <span className="text-fog">{d.y === 0 ? 'topo, com o carregamento' : `${Math.round((d.y / previa.altura_pagina) * 100)}% da página`}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => void capturar()}
              disabled={enviando}
              className="mt-auto h-10 rounded-full bg-coral text-[13px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : `Capturar ${dobras.length} dobra${dobras.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
