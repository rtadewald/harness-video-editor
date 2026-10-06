import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Scissors, Search, Sparkles, Trash2, X } from 'lucide-react'
import {
  NOME_TIPO_MIDIA,
  apagarItemBanco,
  descreverItemBanco,
  editarItemBanco,
  lerItemBanco,
  listarBanco,
  subirNoBanco,
  urlBancoArquivo,
  urlBancoMiniatura,
  type ItemBanco,
  type TipoMidia,
} from '@/api'
import EditorVideo from '@/editor/EditorVideo'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACEITA = 'video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp'
const STATUS_IA: Record<ItemBanco['ia']['status'], string> = {
  fila: 'descrição na fila',
  rodando: 'descrevendo…',
  pronto: '',
  erro: 'a descrição falhou',
  pendente: 'sem descrição',
}
const FILTROS: [TipoMidia | null, string][] = [
  [null, 'Todos'],
  ['video', 'Vídeos'],
  ['imagem', 'Imagens'],
]
const seg = (t: number) => `${t.toFixed(1).replace('.', ',')} s`
const CAMPO = 'w-full rounded-[3px] border border-line-dark bg-deeper px-2.5 py-2 text-[12.5px] text-cream outline-none focus:border-cream/60'

/** O banco de mídias (SPEC §8.3): os vídeos e imagens que os inserts dos projetos usam. Subir (arrastando vários), buscar,
 *  filtrar, editar nome/descrição/palavras-chave (a IA sugere descrição e palavras em segundo plano), ver onde é usado. */
export default function Banco() {
  const [itens, setItens] = useState<ItemBanco[] | null>(null)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<TipoMidia | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(0)
  const [arrastando, setArrastando] = useState(false)
  const [erro, setErro] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  const carregar = () =>
    listarBanco(busca)
      .then(setItens)
      .catch((e) => setErro((e as Error).message))
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 200)
    return () => clearTimeout(t)
  }, [busca]) // eslint-disable-line react-hooks/exhaustive-deps

  // enquanto a IA descreve algum item (ou um original está sendo cortado), acompanha
  const descrevendo = itens?.filter((i) => i.ia.status === 'fila' || i.ia.status === 'rodando').length ?? 0
  const cortando = itens?.some((i) => i.edicao?.status === 'rodando')
  useEffect(() => {
    if (!descrevendo && !cortando) return
    const t = setInterval(() => void carregar(), 3000)
    return () => clearInterval(t)
  }, [descrevendo > 0, cortando]) // eslint-disable-line react-hooks/exhaustive-deps

  async function subir(arquivos: File[]) {
    if (!arquivos.length) return
    setErro('')
    setEnviando(arquivos.length)
    try {
      await subirNoBanco(arquivos)
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(0)
    }
  }

  async function apagar(i: ItemBanco) {
    if (!window.confirm(`Apagar “${i.nome}” do banco? Os inserts que a usam ficam sem ela.`)) return
    await apagarItemBanco(i.id).catch((e) => setErro(e.message))
    await carregar()
  }

  const visiveis = useMemo(() => (itens ?? []).filter((i) => !tipo || i.tipo === tipo), [itens, tipo])
  const contagem = (t: TipoMidia | null) => (itens ?? []).filter((i) => !t || i.tipo === t).length

  return (
    <div
      className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream"
      onDragOver={(e) => {
        e.preventDefault()
        setArrastando(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        void subir([...e.dataTransfer.files])
      }}
    >
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
        <label className="ml-6 flex h-9 w-[min(420px,32vw)] items-center gap-2 rounded-full border border-line-dark px-3.5 text-fog focus-within:border-cream/50">
          <Search className="size-3.5" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no nome, na descrição ou nas palavras-chave"
            className="w-full bg-transparent text-[12px] text-cream outline-none placeholder:text-fog/70"
          />
        </label>
        <Button variant="coral" size="sm" className="ml-auto h-9 gap-6 px-4" onClick={() => entrada.current?.click()} disabled={enviando > 0}>
          {enviando ? `Enviando ${enviando}…` : 'Adicionar mídias'} <span className="seta">↗</span>
        </Button>
        <input
          ref={entrada}
          type="file"
          accept={ACEITA}
          multiple
          hidden
          onChange={(e) => {
            void subir([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>

      <nav className="flex flex-wrap items-center gap-1.5 border-b border-line-dark px-4 py-3">
        {FILTROS.map(([t, nome]) => (
          <Chip key={nome} ativo={tipo === t} onClick={() => setTipo(t)} n={contagem(t)}>
            {nome}
          </Chip>
        ))}
        <span className="ml-auto text-[12px] text-fog">
          {descrevendo > 0 && `IA descrevendo ${descrevendo} · `}
          {visiveis.length} mídia{visiveis.length === 1 ? '' : 's'}
        </span>
      </nav>

      <main className={cn('overflow-y-auto px-8 py-8 transition-colors', arrastando && 'bg-coral/10')}>
        <div className="mb-6 grid gap-3 border-b border-line-dark pb-4">
          <p className="eyebrow text-sage">Banco{itens && ` · ${String(itens.length).padStart(2, '0')} mídias`}</p>
          <p className="max-w-[720px] text-[12px] leading-[1.7] text-fog">
            Os vídeos e imagens dos inserts, de todos os projetos. Arraste vários arquivos para esta tela ou use “Adicionar mídias”. A IA descreve cada um e
            sugere palavras-chave, para achar depois; na etapa Inserts, cada insert liga as mídias daqui.
          </p>
        </div>

        {erro && <p className="mb-4 text-coral">{erro}</p>}
        {itens && itens.length > 0 && visiveis.length === 0 && <p className="mb-6 text-[13px] text-fog">Nenhuma mídia com esses filtros.</p>}

        <ul className="grid gap-x-5 gap-y-8" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
          {!busca && (
            <li>
              <button
                onClick={() => entrada.current?.click()}
                className="group flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-[6px] border border-dashed border-line-dark text-fog transition-colors hover:border-coral hover:text-cream"
              >
                <span className="grid size-11 place-items-center rounded-full bg-coral text-cream transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-90">
                  <Plus className="size-5" />
                </span>
                <span className="text-center">
                  <span className="block text-[14px] font-semibold text-cream">Adicionar</span>
                  <span className="text-[11px]">Vídeos e imagens, vários de uma vez</span>
                </span>
              </button>
            </li>
          )}
          {visiveis.map((i) => (
            <Cartao key={i.id} item={i} abrir={() => setAberto(i.id)} apagar={() => void apagar(i)} />
          ))}
        </ul>
      </main>

      {aberto && <Detalhe bid={aberto} fechar={() => setAberto(null)} mudou={() => void carregar()} />}
    </div>
  )
}

function Chip({ ativo, onClick, n, children }: { ativo: boolean; onClick: () => void; n: number; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold transition-colors',
        ativo ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:border-cream/50 hover:text-cream',
      )}
    >
      {children}
      <span className={cn('tabular-nums', ativo ? 'text-ink/60' : 'text-fog/60')}>{n}</span>
    </button>
  )
}

/** Miniatura da mídia; um vídeo toca (mudo) com o mouse em cima. */
function Cartao({ item: i, abrir, apagar }: { item: ItemBanco; abrir: () => void; apagar: () => void }) {
  const [tocando, setTocando] = useState(false)
  const status = STATUS_IA[i.ia.status]
  return (
    <li className="group relative" onMouseEnter={() => setTocando(i.tipo === 'video')} onMouseLeave={() => setTocando(false)}>
      <button onClick={abrir} className="block w-full text-left">
        <div className="relative aspect-video overflow-hidden rounded-[6px] bg-deeper ring-1 ring-line-dark transition-[transform,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-coral">
          <img src={urlBancoMiniatura(i.id)} alt="" loading="lazy" className="absolute inset-0 size-full object-contain" />
          {tocando && <video src={urlBancoArquivo(i.id)} autoPlay muted loop playsInline className="absolute inset-0 size-full bg-deeper object-contain" />}
          <span className={cn('absolute bottom-2.5 left-2.5 rounded-full px-2 py-0.5 text-[9px] font-semibold', i.tipo === 'video' ? 'bg-blue text-cream' : 'bg-mint text-ink')}>
            {NOME_TIPO_MIDIA[i.tipo]} · {i.formato}
          </span>
          {i.tipo === 'video' && (
            <span className="absolute right-2.5 bottom-2.5 rounded-full bg-ink/85 px-2 py-0.5 text-[10px] font-semibold tabular-nums">{seg(i.duracao)}</span>
          )}
          {(i.trechos?.length ?? 0) > 0 && (
            <span className="absolute top-2.5 right-2.5 rounded-full bg-coral px-2 py-0.5 text-[10px] font-semibold text-cream">
              {i.trechos!.length} trecho{i.trechos!.length > 1 ? 's' : ''}
            </span>
          )}
          {i.edicao?.status === 'rodando' && (
            <span className="absolute inset-0 grid place-items-center bg-black/60 text-[12px] font-semibold text-yellow">cortando o original…</span>
          )}
        </div>
        <h3 className="mt-3 truncate text-[14px] font-semibold tracking-[-0.02em]" title={i.nome}>
          {i.nome}
        </h3>
        {status ? (
          <p className={cn('mt-0.5 text-[11px]', i.ia.status === 'erro' ? 'text-coral' : i.ia.status === 'pendente' ? 'text-fog' : 'text-yellow')}>{status}</p>
        ) : (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-cream/85">{i.descricao}</p>
        )}
      </button>
      <button
        onClick={apagar}
        aria-label={`Apagar ${i.nome}`}
        title="Apagar do banco"
        className="absolute top-2.5 left-2.5 grid size-7 place-items-center rounded-full bg-ink/85 text-fog opacity-0 transition-opacity group-hover:opacity-100 hover:text-coral focus-visible:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  )
}

function Detalhe({ bid, fechar, mudou }: { bid: string; fechar: () => void; mudou: () => void }) {
  const [item, setItem] = useState<ItemBanco | null>(null)
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [palavras, setPalavras] = useState('')
  const preencher = (i: ItemBanco) => {
    setItem(i)
    setNome(i.nome)
    setDescricao(i.descricao)
    setPalavras(i.palavras.join(', '))
  }
  useEffect(() => {
    void lerItemBanco(bid).then(preencher)
  }, [bid])
  // enquanto a IA descreve, acompanha (e pega a descrição e as palavras quando chegarem)
  const andando = item?.ia.status === 'fila' || item?.ia.status === 'rodando'
  const cortando = item?.edicao?.status === 'rodando'
  useEffect(() => {
    if (!andando && !cortando) return
    const t = setInterval(() => void lerItemBanco(bid).then(preencher), 2500)
    return () => clearInterval(t)
  }, [andando, cortando, bid])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !editando && fechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fechar, editando])

  const falhar = (e: unknown) => window.alert((e as Error).message)
  const lista = palavras
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
  const alterado = !!item && (nome !== item.nome || descricao !== item.descricao || lista.join('|') !== item.palavras.join('|'))
  const salvar = () =>
    editarItemBanco(bid, { nome, descricao, palavras: lista })
      .then((i) => {
        preencher({ ...item!, ...i })
        mudou()
      })
      .catch(falhar)
  const apagar = () => {
    const n = item?.usos?.length ?? 0
    if (!window.confirm(n ? `Esta mídia está em ${n} insert(s). Apagar do banco e tirar de todos?` : 'Apagar esta mídia do banco?')) return
    void apagarItemBanco(bid)
      .then(() => {
        mudou()
        fechar()
      })
      .catch(falhar)
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6" onClick={fechar}>

      <div
        className="grid max-h-full w-full max-w-[1180px] grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)] gap-x-7 overflow-hidden rounded-[8px] bg-deep p-6 ring-1 ring-line-dark"
        onClick={(e) => e.stopPropagation()}
      >
        {!item ? (
          <p className="text-[13px] text-fog">Carregando…</p>
        ) : (
          <>
            <div className="grid min-h-0 place-items-center rounded-[6px] bg-black">
              {item.tipo === 'video' ? (
                <video src={urlBancoArquivo(bid)} controls muted playsInline className="max-h-[min(72vh,760px)] max-w-full rounded-[6px]" />
              ) : (
                <img src={urlBancoArquivo(bid)} alt="" className="max-h-[min(72vh,760px)] max-w-full rounded-[6px] object-contain" />
              )}
            </div>

            <div className="flex max-h-[min(80vh,820px)] min-h-0 flex-col gap-5 overflow-y-auto pr-1 text-[13px]">
              <div className="flex items-center gap-2">
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', item.tipo === 'video' ? 'bg-blue text-cream' : 'bg-mint text-ink')}>
                  {NOME_TIPO_MIDIA[item.tipo]} · {item.formato}
                </span>
                <button onClick={fechar} aria-label="Fechar" className="ml-auto grid size-8 place-items-center rounded-full text-fog hover:bg-cream/10 hover:text-cream">
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line-dark py-4">
                <Dado rotulo="Dimensões" valor={item.largura && item.altura ? `${item.largura}×${item.altura}` : '—'} />
                <Dado rotulo="Duração" valor={item.tipo === 'video' ? seg(item.duracao) : '— (imagem)'} />
                <Dado
                  rotulo="Origem"
                  valor={item.origem.tipo === 'captura de site' ? 'Captura de site' : item.origem.tipo === 'captura automática' ? 'Captura automática' : 'Upload'}
                  detalhe={(item.origem.tipo === 'captura de site' ? item.origem.url : item.origem.nome_original) ?? undefined}
                />
                <Dado
                  rotulo="Entrou em"
                  valor={item.criado_em ? new Date(item.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                />
              </div>

              <Bloco titulo="Nome">
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} />
              </Bloco>
              <Bloco titulo="Descrição">
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5} className={cn(CAMPO, 'resize-y leading-[1.6]')} />
              </Bloco>
              <Bloco titulo="Palavras-chave · separadas por vírgula">
                <input value={palavras} onChange={(e) => setPalavras(e.target.value)} className={CAMPO} />
              </Bloco>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="coral" size="sm" onClick={() => void salvar()} disabled={!alterado}>
                  Salvar
                </Button>
                <Button
                  variant="pill"
                  size="sm"
                  className="text-fog hover:text-cream"
                  onClick={() => void descreverItemBanco(bid).then((i) => preencher({ ...item, ...i })).catch(falhar)}
                  disabled={andando}
                  title="A IA vê a mídia de novo e sugere descrição e palavras-chave (não apaga o que você escreveu)"
                >
                  <Sparkles className="size-3.5" /> Descrever de novo
                </Button>
                {item.tipo === 'video' && (
                  <Button variant="pill" size="sm" className="text-fog hover:text-cream" onClick={() => setEditando(true)} disabled={cortando}>
                    <Scissors className="size-3.5" /> Editar vídeo
                  </Button>
                )}
                <Button variant="pill" size="sm" className="ml-auto text-fog hover:text-coral" onClick={apagar}>
                  <Trash2 className="size-3.5" /> Apagar
                </Button>
              </div>
              {cortando && <p className="text-yellow">Cortando o original (regravando em alta qualidade)…</p>}
              {item.edicao?.status === 'erro' && <p className="text-coral">O corte falhou: {item.edicao.erro}</p>}

              {item.tipo === 'video' && (
                <Bloco titulo={`Trechos · ${item.trechos?.length ?? 0}`}>
                  {item.trechos?.length ? (
                    <div className="grid gap-1.5">
                      {item.trechos.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setEditando(true)}
                          className="flex items-center gap-3 rounded-[6px] px-2 py-1.5 text-left ring-1 ring-line-dark transition-colors hover:ring-coral"
                        >
                          <img src={urlBancoMiniatura(t.id)} alt="" className="h-9 w-14 shrink-0 rounded-[3px] bg-black object-cover" />
                          <span className="min-w-0 flex-1 truncate font-semibold">{t.nome}</span>
                          <span className="shrink-0 text-[11px] text-fog tabular-nums">
                            {seg(t.duracao)}
                            {t.usos?.length ? ` · em ${t.usos.length}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-fog">Nenhum. Em “Editar vídeo”, marque trechos para usar pedaços deste vídeo.</p>
                  )}
                </Bloco>
              )}

              <Bloco titulo="Descrição da IA">
                {andando ? (
                  <p className="text-yellow">{STATUS_IA[item.ia.status]}</p>
                ) : item.ia.status === 'erro' ? (
                  <p className="text-coral">{item.ia.erro || 'falhou'}</p>
                ) : (
                  <p className="border-l-2 border-line-dark pl-3 leading-[1.7] text-fog">{item.descricao_ia || '—'}</p>
                )}
              </Bloco>

              <Bloco titulo={`Usada em · ${item.usos?.length ?? 0}`}>
                {item.usos?.length ? (
                  <div className="grid gap-1.5">
                    {item.usos.map((u) => (
                      <Link key={u.pedido} to={`/p/${u.projeto}`} className="rounded-[6px] px-3 py-2 ring-1 ring-line-dark transition-colors hover:ring-coral">
                        <span className="font-semibold">{u.nome}</span> <span className="text-fog">· “{u.fala}”</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-fog">Nenhum insert usa esta mídia.</p>
                )}
              </Bloco>
            </div>
          </>
        )}
      </div>
      {editando && item && (
        <div onClick={(e) => e.stopPropagation()}>
          <EditorVideo
            bid={item.id}
            fechar={() => {
              setEditando(false)
              void lerItemBanco(bid).then(preencher)
              mudou()
            }}
            mudou={mudou}
          />
        </div>
      )}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-1.5 text-sage">{titulo}</p>
      {children}
    </div>
  )
}

function Dado({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.1em] text-fog uppercase">{rotulo}</p>
      <p className="mt-0.5 font-semibold">{valor}</p>
      {detalhe && <p className="truncate text-[11px] text-fog">{detalhe}</p>}
    </div>
  )
}
