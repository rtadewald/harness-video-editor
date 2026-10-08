import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Star, X } from 'lucide-react'
import { listarClipes, marcarFavorito, urlArquivoReferencia, type ClipeReferencia } from '@/api'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import { useLembrado } from '@/lib/useLembrado'
import { Cartao, Chip, gruposDe, SO_ATOR, useAgrupar, useTrecho } from '@/paginas/Referencias'

const chave = (c: ClipeReferencia) => `${c.ref}/${c.id}`
const seg = (t: number) => `${t.toFixed(1).replace('.', ',')} s`

/** "Buscar por referências" (etapa Inserts): os planos dos vídeos de referência (a galeria de Referências), já filtrados
 *  pelo grupo do plano selecionado. Passar o mouse toca o trecho mudo; clicar abre ao lado, com som, em loop. */
export default function BuscarReferencias({ tipo, fechar, usar }: { tipo: string | null; fechar: () => void; usar?: (c: ClipeReferencia) => void }) {
  const [clipes, setClipes] = useState<ClipeReferencia[] | null>(null)
  const [categorias, setCategorias] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  // a mesma caixa "Agrupar insert e motion" da página Referências; trocar volta ao grupo do plano no agrupamento novo
  const [agrupar, lembrarAgrupar] = useAgrupar()
  const grupos = gruposDe(agrupar)
  const doPlano = (gs: typeof grupos) => gs.find((g) => tipo && g.tipos.includes(tipo))?.id ?? tipo
  const [grupo, setGrupo] = useState<string | null>(() => doPlano(grupos))
  const setAgrupar = (v: boolean) => {
    lembrarAgrupar(v)
    setGrupo(doPlano(gruposDe(v)))
  }
  const [soFavoritos, setSoFavoritos] = useState(false)
  const [busca, setBusca] = useState('')
  // a mesma caixa da página Referências (marcada por padrão, lembrada no navegador)
  const [semFullAtor, lembrarSemFullAtor] = useLembrado('referencias.semFullAtor', true)
  const setSemFullAtor = (v: boolean) => {
    lembrarSemFullAtor(v)
    if (v && grupo && SO_ATOR.includes(grupo)) setGrupo(null)
  }
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    listarClipes()
      .then((d) => {
        setClipes(d.clipes)
        setCategorias(d.categorias)
      })
      .catch((e) => setErro(e.message))
  }, [])

  const favoritar = (c: ClipeReferencia) => {
    const novo = !c.favorito
    const trocar = (v: boolean) => setClipes((l) => l && l.map((x) => (chave(x) === chave(c) ? { ...x, favorito: v } : x)))
    trocar(novo)
    marcarFavorito(c.ref, c.inicio, c.fim, novo).catch((e) => {
      trocar(!novo)
      setErro(e.message)
    })
  }

  const tiposDe = (g: string) => grupos.find((x) => x.id === g)?.tipos ?? [g]
  // favoritos primeiro; dentro deles e fora, ordem aleatória sorteada uma vez (favoritar não embaralha)
  const sorteado = useRef(new Map<string, number>())
  const base = useMemo(() => {
    const q = busca.trim().toLowerCase()
    for (const c of clipes ?? []) if (!sorteado.current.has(chave(c))) sorteado.current.set(chave(c), Math.random())
    return (clipes ?? [])
      .filter((c) => (!semFullAtor || !SO_ATOR.includes(c.tipo)) && (!soFavoritos || c.favorito) && (!q || [c.descricao, c.texto ?? '', c.fala, c.ref_nome].some((t) => t.toLowerCase().includes(q))))
      .sort((a, b) => sorteado.current.get(chave(a))! - sorteado.current.get(chave(b))!)
  }, [clipes, busca, soFavoritos, semFullAtor])
  const visiveis = base.filter((c) => !grupo || tiposDe(grupo).includes(c.tipo))
  const contagem = (g: string | null) => base.filter((c) => !g || tiposDe(g).includes(c.tipo)).length
  const sel = visiveis.find((c) => chave(c) === aberto) ?? null

  return (
    <Modal titulo="Buscar por referências" fechar={fechar} tamanho="tela">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setSoFavoritos((v) => !v)}
          className={cn(
            'mr-1 flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition-colors',
            soFavoritos ? 'border-yellow bg-yellow text-ink' : 'border-line-dark text-fog hover:border-yellow/60 hover:text-cream',
          )}
        >
          <Star className={cn('size-3.5', soFavoritos && 'fill-current')} /> Favoritos
        </button>
        <Chip ativo={!grupo} onClick={() => setGrupo(null)} n={contagem(null)} icone="todos">
          Todos
        </Chip>
        {grupos.filter((g) => !semFullAtor || !g.tipos.every((t) => SO_ATOR.includes(t))).map((g) => (
          <Chip key={g.id} ativo={grupo === g.id} onClick={() => setGrupo(g.id)} n={contagem(g.id)} icone={g.icone ?? g.id}>
            {g.nome}
          </Chip>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[12px] text-fog" title="Desmarcado, tela dividida e tela cheia aparecem separadas em insert e motion">
          <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} /> Agrupar insert e motion
        </label>
        <label className="ml-3 flex cursor-pointer items-center gap-1.5 text-[12px] text-fog" title="Esconde os planos em que só o ator fala (com ou sem lettering)">
          <input type="checkbox" checked={semFullAtor} onChange={(e) => setSemFullAtor(e.target.checked)} /> Ignorar Full ator
        </label>
        <label className="ml-3 flex h-8 w-[260px] items-center gap-2 rounded-full border border-line-dark px-3 text-fog focus-within:border-cream/50">
          <Search className="size-3.5" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na marcação, no texto ou na fala" className="w-full bg-transparent text-[12px] text-cream outline-none placeholder:text-fog/70" />
        </label>
      </div>
      {erro && <p className="text-[12px] text-coral">{erro}</p>}
      <div className="flex min-h-0 flex-1 gap-5">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {!clipes ? (
            <p className="text-[12px] text-fog">Carregando…</p>
          ) : visiveis.length === 0 ? (
            <p className="text-[12px] text-fog">Nenhuma referência com esses filtros.</p>
          ) : (
            <ul className={cn('grid gap-x-4 gap-y-6 pt-1', 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]')}>
              {visiveis.map((c) => (
                <Cartao key={chave(c)} clipe={c} nome={categorias[c.tipo]} abrir={() => setAberto(chave(c))} favoritar={() => favoritar(c)} />
              ))}
            </ul>
          )}
        </div>
        {sel && <Tocador key={chave(sel)} c={sel} nome={categorias[sel.tipo]} fechar={() => setAberto(null)} usar={usar && (() => usar(sel))} />}
      </div>
    </Modal>
  )
}

/** O trecho aberto, com som e controles, em loop, e o que a referência diz dele. */
function Tocador({ c, nome, fechar, usar }: { c: ClipeReferencia; nome: string; fechar: () => void; usar?: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [usada, setUsada] = useState(false)
  useTrecho(video, c, true)
  return (
    <aside className="flex min-h-0 w-[360px] shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex items-center gap-2">
        <span className="truncate text-[12px] font-semibold">{nome}</span>
        <span className="text-[11px] text-fog tabular-nums">{seg(c.fim - c.inicio)}</span>
        <button onClick={fechar} className="ml-auto text-fog hover:text-cream" aria-label="Fechar o trecho">
          <X className="size-4" />
        </button>
      </div>
      <video
        ref={video}
        src={`${urlArquivoReferencia(c.ref, 'proxy.mp4')}#t=${c.inicio},${c.fim}`}
        controls
        playsInline
        preload="auto"
        className="aspect-[9/16] w-full rounded-[6px] bg-black object-contain"
      />
      <p className="text-[11px] text-fog">
        {c.ref_nome} · {seg(c.inicio)}
      </p>
      {c.texto && <p className="text-[12.5px] font-semibold">“{c.texto}”</p>}
      <p className="text-[12.5px] leading-[1.6] text-cream/85">{c.descricao}</p>
      {c.fala && <p className="border-l-2 border-line-dark pl-3 text-[12px] leading-[1.6] text-fog">{c.fala}</p>}
      {usar && (
        <button
          onClick={() => {
            usar()
            setUsada(true)
          }}
          disabled={usada}
          className="rounded-full bg-coral px-4 py-2 text-[12.5px] font-semibold text-cream hover:bg-coral/90 disabled:opacity-50"
        >
          {usada ? '✓ Adicionada ao motion' : '+ Usar como referência'}
        </button>
      )}
    </aside>
  )
}
