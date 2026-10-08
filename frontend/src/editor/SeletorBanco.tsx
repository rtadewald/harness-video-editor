import { useEffect, useState, } from 'react'
import {
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  Image as IconeImagem,
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  Trash2,
  
  Video,
} from 'lucide-react'
import {
  s1,
  NOME_TIPO_MIDIA,
  apagarItemBanco,
  
  
  
  
  
  
  
  
  listarBanco,
  
  
  
  
  
  urlBancoMiniatura,
  
  
  
  
  
  
  
  
  
  type ItemBanco,
  
  
  
  
  type TipoMidia,
} from '@/api'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'

/** Escolher uma mídia do banco: busca no nome, na descrição e nas palavras-chave, filtro vídeo/imagem. */
export default function SeletorBanco(p: { tipo?: TipoMidia; fechar: () => void; escolher: (i: ItemBanco) => void; mudou: () => void }) {
  const { fechar, escolher } = p
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<TipoMidia | ''>(p.tipo ?? '')
  const [itens, setItens] = useState<ItemBanco[] | null>(null)
  const carregar = () => listarBanco(busca, filtro || undefined).then(setItens)
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 200)
    return () => clearTimeout(t)
  }, [busca, filtro]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Apaga do banco (com confirmação; avisa quantos trechos vão junto) e tira dos inserts que usavam. */
  const apagar = async (i: ItemBanco) => {
    const n = i.trechos?.length ?? 0
    const aviso = i.pai
      ? `Apagar o trecho “${i.nome}” do banco? Ele sai dos inserts que o usam.`
      : `Apagar “${i.nome}” do banco?${n === 1 ? ' O trecho dele vai junto.' : n ? ` Os ${n} trechos dele vão junto.` : ''} A mídia sai dos inserts que a usam.`
    if (!window.confirm(aviso)) return
    try {
      await apagarItemBanco(i.id)
      await carregar()
      p.mudou()
    } catch (e) {
      window.alert((e as Error).message)
    }
  }
  const lixeira = (i: ItemBanco, classe: string) => (
    <button
      onClick={(e) => {
        e.stopPropagation()
        void apagar(i)
      }}
      aria-label={`Apagar ${i.nome}`}
      title="Apagar do banco"
      className={cn('grid size-6 place-items-center rounded-full bg-ink/85 text-fog opacity-0 transition-opacity group-hover:opacity-100 hover:text-coral', classe)}
    >
      <Trash2 className="size-3.5" />
    </button>
  )
  return (
    <Modal titulo="Escolher do banco" fechar={fechar} tamanho="largo">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no nome, na descrição e nas palavras-chave"
          className="h-9 min-w-[240px] flex-1 rounded-full border border-line-dark bg-deeper px-4 text-[12.5px] text-cream outline-none focus:border-cream/40"
        />
        {(['', 'video', 'imagem'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn('rounded-full px-3 py-1.5 text-[11px] font-semibold', filtro === f ? 'bg-cream text-ink' : 'border border-line-dark text-fog hover:text-cream')}
          >
            {f === '' ? 'Todos' : NOME_TIPO_MIDIA[f]}
          </button>
        ))}
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-1 pb-2">
        {itens === null ? (
          <p className="text-[12px] text-fog">Carregando…</p>
        ) : !itens.length ? (
          <p className="text-[12px] text-fog">Nada no banco com essa busca. Suba arquivos no insert ou na página do Banco.</p>
        ) : (
          <ul className="grid grid-cols-5 gap-3">
            {itens.map((i) => (
              <li key={i.id} className="grid min-w-0 grid-cols-1 content-start gap-1.5">
                <div className="group relative">
                <button onClick={() => escolher(i)} className="grid w-full gap-1.5 rounded-[6px] p-2 text-left ring-1 ring-line-dark hover:ring-coral">
                  {/* a altura sai da largura (56,25% = 16:9): o cartão mais alto da linha não estica a miniatura */}
                  <div className="relative overflow-hidden rounded-[3px] bg-black pt-[56.25%]">
                    <img src={urlBancoMiniatura(i.id)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                    <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-ink/85 text-cream" title={NOME_TIPO_MIDIA[i.tipo]}>
                      {i.tipo === 'video' ? <Video className="size-3.5" /> : <IconeImagem className="size-3.5" />}
                    </span>
                    {i.tipo === 'video' && (
                      <span className="absolute right-1.5 bottom-1.5 rounded-full bg-ink/85 px-1.5 py-0.5 text-[10px] font-semibold text-cream tabular-nums">{s1(i.duracao)} s</span>
                    )}
                  </div>
                  <span className="truncate text-[12px] font-semibold">{i.nome}</span>
                  <span className="text-[10.5px] text-fog">
                    {entrouEm(i.criado_em)} · {i.formato}
                  </span>
                </button>
                {lixeira(i, 'absolute top-3.5 left-3.5')}
                </div>
                {(i.trechos ?? []).map((t) => (
                  <div key={t.id} className="group relative">
                    <button
                      onClick={() => escolher(t)}
                      className="flex w-full items-center gap-2 rounded-[6px] p-1.5 text-left text-[11px] ring-1 ring-line-dark hover:ring-coral"
                      title="Usar este trecho"
                    >
                      <img src={urlBancoMiniatura(t.id)} alt="" className="h-8 w-12 shrink-0 rounded-[2px] bg-black object-cover" />
                      <span className="min-w-0 flex-1 truncate">{t.nome}</span>
                      <span className="shrink-0 text-fog tabular-nums group-hover:invisible">{s1(t.duracao)} s</span>
                    </button>
                    {lixeira(t, 'absolute top-1/2 right-1.5 -translate-y-1/2')}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/** "06 out, 17:27": quando a mídia entrou no banco. */
function entrouEm(quando?: string) {
  if (!quando) return '—'
  const d = new Date(quando)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace(' de ', ' ').replace('.', '')}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
