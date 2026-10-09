import { useRef, useState } from 'react'
import { Globe, Library, Upload } from 'lucide-react'
import type { InsertsProjeto, ItemBanco } from '@/api'
import { cn } from '@/lib/utils'
import CapturaDeSite from '@/inserts/CapturaDeSite'
import MidiaCard from '@/inserts/MidiaCard'
import SeletorBanco from '@/inserts/SeletorBanco'
import EditorVideo from '@/inserts/EditorVideo'
import { ACEITA, BOTAO, type NovaMidia, type Pedido } from '@/inserts/comum'

export default function DetalheInsert(p: {
  pedido: Pedido
  banco: Map<string, ItemBanco>
  subindo: boolean
  projetoId: string
  capturou: (r: InsertsProjeto) => void
  salvar: (midias: NovaMidia[]) => Promise<unknown>
  subir: (arquivos: File[]) => Promise<ItemBanco[]>
  bancoMudou: () => void
}) {
  const x = p.pedido
  const [escolhendo, setEscolhendo] = useState(false)
  // editor de vídeo: o que está aberto e os próximos (vídeos recém-subidos abrem um depois do outro)
  const [editando, setEditando] = useState<string[]>([])
  const [doBanco, setDoBanco] = useState(false) // o editor aberto veio do "Escolher do banco" (dá para voltar)
  const subir = (arquivos: File[]) =>
    void p.subir(arquivos).then((novos) => setEditando((f) => [...f, ...novos.filter((n) => n.tipo === 'video').map((n) => n.id)]))
  /** O editor devolve os itens a ligar (trechos ou o original): eles entram no lugar das mídias do mesmo vídeo. */
  const aplicarEdicao = (original: string, ids: string[], apagados: string[]) => {
    const doVideo = (b: string) => b === original || p.banco.get(b)?.pai === original || apagados.includes(b)
    const pos = x.midias.findIndex((m) => doVideo(m.banco))
    const resto = x.midias.filter((m) => !doVideo(m.banco))
    const novos = ids.map((id) => x.midias.find((m) => m.banco === id) ?? { banco: id })
    const corte = pos < 0 ? resto.length : x.midias.slice(0, pos).filter((m) => !doVideo(m.banco)).length
    void p.salvar([...resto.slice(0, corte), ...novos, ...resto.slice(corte)])
    setEditando((f) => f.slice(1))
    setDoBanco(false)
  }
  const [capturando, setCapturando] = useState(false)
  const capturas = x.capturas ?? []
  const semHttp = (u: string) => u.replace(/^https?:\/\//, '')
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const mover = (k: number, d: number) => {
    const l = [...x.midias]
    const [m] = l.splice(k, 1)
    l.splice(k + d, 0, m)
    void p.salvar(l)
  }
  return (
    <div
      className={cn('grid grid-cols-[minmax(0,1fr)] gap-4 rounded-[6px]', arrastando && 'ring-2 ring-coral ring-offset-4 ring-offset-transparent')}
      onDragOver={(e) => {
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        subir([...e.dataTransfer.files])
      }}
    >
      <input
        ref={entrada}
        type="file"
        multiple
        hidden
        accept={ACEITA}
        onChange={(e) => {
          subir([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />

      <div className="grid gap-2">
        <p className="eyebrow text-fog">
          Mídias deste insert ({x.midias.length}){p.subindo && <span className="text-yellow"> · subindo…</span>}
        </p>
        {x.midias.map((m, k) => (
          <MidiaCard
            key={m.id}
            m={m}
            item={p.banco.get(m.banco)}
            editar={() => setEditando((f) => [m.banco, ...f])}
            subir={k > 0 ? () => mover(k, -1) : undefined}
            descer={k < x.midias.length - 1 ? () => mover(k, 1) : undefined}
            tirar={() => void p.salvar(x.midias.filter((_, j) => j !== k))}
          />
        ))}
        {!x.midias.length && <p className="text-[11.5px] text-fog">Nenhuma ainda. Arraste arquivos para este painel, ou use os botões.</p>}
        {/* numa coluna estreita, os botões descem de linha em vez de empurrar a coluna (e cortar o que vem à direita) */}
        <div className="flex flex-wrap gap-2 text-[11px] [&>button]:whitespace-nowrap">
          <button onClick={() => entrada.current?.click()} disabled={p.subindo} className="flex items-center gap-1 rounded-full bg-coral px-3 py-1 font-semibold text-cream hover:bg-coral/90 disabled:opacity-50">
            <Upload className="size-3" /> {x.midias.length ? '+ outra mídia' : 'Subir mídia'}
          </button>
          <button onClick={() => setEscolhendo(true)} className={BOTAO}>
            <Library className="size-3" /> Escolher do banco
          </button>
          <button onClick={() => setCapturando(true)} className={BOTAO}>
            <Globe className="size-3" /> Capturar site
          </button>
        </div>
        {capturas.map((c) => (
          <p key={c.id} className={cn('text-[11.5px] [overflow-wrap:anywhere]', c.status === 'erro' ? 'text-coral' : c.status === 'pronto' ? 'text-mint' : 'text-yellow')}>
            {c.status === 'fila'
              ? `Na fila: ${semHttp(c.url)}`
              : c.status === 'rodando'
                ? `Capturando ${semHttp(c.url)} · dobra ${Math.min(c.feitas + 1, c.dobras.length)} de ${c.dobras.length}…`
                : c.status === 'pronto'
                  ? `Capturado: ${semHttp(c.url)}`
                  : `A captura de ${semHttp(c.url)} falhou: ${c.erro}`}
          </p>
        ))}
      </div>

      {capturando && (
        <CapturaDeSite
          projetoId={p.projetoId}
          pedido={x}
          fechar={() => setCapturando(false)}
          pronto={(r) => {
            p.capturou(r)
            setCapturando(false)
          }}
        />
      )}

      {escolhendo && (
        <SeletorBanco
          mudou={p.bancoMudou}
          fechar={() => setEscolhendo(false)}
          escolher={(item) => {
            // um vídeo original abre no editor (para escolher os trechos); trecho ou imagem entram direto
            if (item.tipo === 'video' && !item.pai) {
              setEditando((f) => [item.id, ...f])
              setDoBanco(true)
            }
            else void p.salvar([...x.midias, { banco: item.id }])
            setEscolhendo(false)
          }}
        />
      )}

      {editando.length > 0 && (
        <EditorVideo
          key={editando[0]}
          bid={editando[0]}
          ligados={x.midias.map((m) => m.banco)}
          mudou={p.bancoMudou}
          aplicar={aplicarEdicao}
          fechar={() => {
            setEditando((f) => f.slice(1))
            setDoBanco(false)
          }}
          voltar={
            doBanco
              ? () => {
                  setEditando((f) => f.slice(1))
                  setDoBanco(false)
                  setEscolhendo(true)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
