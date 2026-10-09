import { useState, type ReactNode } from 'react'
import { Captions, EyeOff, Link2, Merge, RotateCcw, Split, Trash2 } from 'lucide-react'
import { formatarTempo, type ItemRef } from '@/api'
import { CATEGORIAS } from '@/editor/EtapaDirecao'
import LinhaBase, { type Trilha } from '@/editor/LinhaBase'
import { Alca, Cabecalho, useTamanhos } from '@/editor/inserts/layout'
import { cn } from '@/lib/utils'
import { COR_PLANO } from '@/referencias/LinhaDirecao'
import type { Ajuste, Bloco, Legenda, Modo, Orfao } from './legenda'

const LINHA: Trilha[] = [
  { id: 'planos', nome: 'Planos', alt: 26 },
  { id: 'legenda', nome: 'Legenda', alt: 34 },
]
const MODOS: { id: Modo; nome: string; dica: string }[] = [
  { id: 'palavra', nome: 'Palavra a palavra', dica: 'Uma palavra por vez, como em 7 das 10 referências' },
  { id: 'frase', nome: 'Frase curta', dica: 'Até 3 palavras por vez (quebra nas pausas e na pontuação)' },
]

/** A etapa Legenda (SPEC §8.10; docs/legenda.md), no arranjo da etapa Inserts: à esquerda ligar, o modo e o bloco
 *  selecionado (o texto, juntar com o próximo, separar, esconder, voltar ao automático); no meio a prévia com a
 *  legenda; embaixo a linha do tempo com os planos e os blocos. Os ajustes ficam presos às palavras: mexer nos cortes
 *  leva os blocos junto; um ajuste cujas palavras saíram todas do vídeo fica órfão (SPEC §9), listado para reatar à
 *  próxima palavra ou descartar. */
export default function EtapaLegenda(p: {
  previa: ReactNode
  lg: Legenda | null
  blocos: Bloco[]
  orfaos: Orfao[]
  planos: ItemRef[]
  mudar: (campos: Record<string, unknown>) => void
  duracao: number
  tempo: number
  tocando: boolean
  buscar: (t: number) => void
}) {
  const [tam, arrastarBorda] = useTamanhos()
  const esq = Math.min(tam.esq, 480)
  // o bloco escolhido é o do cursor (clicar num bloco leva o cursor até ele); entre dois blocos, o último clicado. O
  // clicado vale enquanto o cursor estiver nele ou bem perto: num bloco de 1 ou 2 quadros, o player pode parar no vizinho
  const [clicado, setClicado] = useState<string | null>(null)
  const cl = clicado ? p.blocos.find((b) => b.id === clicado) : null
  const sel = cl && p.tempo >= cl.ini - 0.1 && p.tempo < cl.fim + 0.1 ? cl.id : (p.blocos.find((b) => b.ini <= p.tempo && p.tempo < b.fim)?.id ?? clicado)
  const k = p.blocos.findIndex((b) => b.id === sel)
  const bloco = k >= 0 ? p.blocos[k] : null
  const escolher = (b: Bloco) => {
    setClicado(b.id)
    p.buscar(b.ini + 0.01)
  }
  // só os ajustes que ainda valem (os órfãos aparecem à parte)
  const ajustados = p.blocos.filter((b) => b.ajustado).length
  const temAjustes = Object.keys(p.lg?.ajustes ?? {}).length > 0

  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)]" style={{ gridTemplateRows: `minmax(0,1fr) ${tam.linha}px` }}>
      <div className="relative grid min-h-0 min-w-0" style={{ gridTemplateColumns: `${esq}px minmax(0,1fr)` }}>
        <Alca lado="esq" pos={esq} arrastar={arrastarBorda} />
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-line-dark text-cream">
          <Cabecalho
            icone={Captions}
            titulo="Legenda"
            extra={
              p.lg && (
                <label className="ml-auto flex cursor-pointer items-center gap-2 text-fog">
                  {p.lg.ligada ? 'ligada' : 'desligada'}
                  <input type="checkbox" checked={p.lg.ligada} onChange={(e) => p.mudar({ ligada: e.target.checked })} className="accent-coral" />
                </label>
              )
            }
          />
          <div className={cn('grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-4', !p.lg?.ligada && 'opacity-50')}>
            {p.lg && (
              <div className="grid gap-1.5">
                <span className="text-[11px] text-fog">Ritmo</span>
                <div className="flex rounded-full p-0.5 ring-1 ring-line-dark">
                  {MODOS.map((m) => (
                    <button
                      key={m.id}
                      title={m.dica}
                      onClick={() => p.mudar({ modo: m.id })}
                      className={cn('flex-1 rounded-full py-1 text-[11.5px] font-semibold', p.lg!.modo === m.id ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
                    >
                      {m.nome}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-[1.6] text-fog">
                  O estilo das referências: SF Pro em negrito, branca, com sombra, na altura de cada tipo de plano (na costura da tela dividida, um pouco acima do
                  centro no ator). {p.blocos.length} blocos{ajustados ? ` · ${ajustados} mexidos à mão` : ''}.
                </p>
                {temAjustes && (
                  <button
                    onClick={() => window.confirm('Voltar todos os blocos ao automático (os textos e as junções feitos à mão saem)?') && p.mudar({ limpar: true })}
                    className="w-fit text-[11px] text-fog underline-offset-2 hover:text-cream hover:underline"
                  >
                    Voltar tudo ao automático
                  </button>
                )}
              </div>
            )}
            {p.orfaos.length > 0 && <Orfaos orfaos={p.orfaos} mudar={p.mudar} />}
            {bloco ? (
              // o texto e o tamanho entram na chave: juntar, separar, esconder ou trocar o ritmo refazem o campo
              <EditorBloco key={bloco.id} b={bloco} prox={p.blocos[k + 1] ?? null} lg={p.lg} mudar={p.mudar} />
            ) : (
              <p className="text-[12px] leading-[1.7] text-fog">Escolha um bloco na linha do tempo para corrigir o texto, juntar, separar ou esconder.</p>
            )}
          </div>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col px-6 pt-5 pb-3">{p.previa}</section>
      </div>
      <div className="relative min-h-0">
        <Alca lado="linha" pos={tam.linha} arrastar={arrastarBorda} />
        <LinhaBase duracao={p.duracao} trilhas={LINHA} tempo={p.tempo} tocando={p.tocando} buscar={p.buscar}>
          {({ x, faixa }) => (
            <>
              {p.planos.map((pl) => (
                <div
                  key={pl.id}
                  className={cn('absolute overflow-hidden rounded-[3px] px-1 text-[9.5px] leading-[26px] font-semibold whitespace-nowrap opacity-70', COR_PLANO[pl.tipo])}
                  style={{ left: x(pl.inicio) + 1, width: Math.max(x(pl.fim - pl.inicio) - 2, 2), top: faixa(0), height: LINHA[0].alt }}
                  title={CATEGORIAS.planos[pl.tipo] ?? pl.tipo}
                >
                  {CATEGORIAS.planos[pl.tipo] ?? pl.tipo}
                </div>
              ))}
              {p.blocos.map((b) => {
                // a largura é a do tempo do bloco (sem mínimo nem margem que passe dele: no zoom inteiro, os blocos
                // estreitos não se cobrem e o clique cai no bloco certo); o texto só quando cabe
                const w = Math.max(x(b.fim - b.ini) - 1, 1)
                const largo = w >= 14
                return (
                  <button
                    key={b.id}
                    onClick={() => escolher(b)}
                    className={cn(
                      'absolute overflow-hidden rounded-[3px] text-left text-[10px] font-semibold whitespace-nowrap ring-1',
                      largo ? 'px-1' : 'px-0',
                      b.oculto ? 'text-fog/50 ring-line-dark' : b.ajustado ? 'bg-yellow/15 text-yellow ring-yellow/40' : 'bg-cream/10 text-cream ring-line-dark',
                      sel === b.id && 'z-10 ring-2 ring-coral',
                    )}
                    style={{ left: x(b.ini), width: w, top: faixa(1), height: LINHA[1].alt }}
                    title={`${formatarTempo(b.ini)} · ${b.oculto ? '(escondido)' : b.texto}`}
                  >
                    {largo && (b.oculto ? '—' : b.texto)}
                  </button>
                )
              })}
            </>
          )}
        </LinhaBase>
      </div>
    </div>
  )
}

function EditorBloco(p: { b: Bloco; prox: Bloco | null; lg: Legenda | null; mudar: (c: Record<string, unknown>) => void }) {
  const aj = p.lg?.ajustes[p.b.id] ?? {}
  const ultima = p.b.palavras[p.b.palavras.length - 1]
  const [texto, setTexto] = useState(p.b.texto)
  // só grava o que foi digitado (focar e sair do campo não regrava o texto do bloco)
  const [editado, setEditado] = useState(false)
  // o texto do bloco mudou por uma ação (juntar, esconder, automático, o ritmo): o campo acompanha, se não está sendo editado
  const [base, setBase] = useState(p.b.texto)
  if (base !== p.b.texto) {
    setBase(p.b.texto)
    if (!editado) setTexto(p.b.texto)
  }
  // os botões não tiram o foco do campo (o clique chega a eles) e descartam o que estava sendo digitado
  const agir = (f: () => void) => () => {
    setEditado(false)
    f()
  }
  // o texto prende também o fim: corrigido, ele fica sempre com as mesmas palavras (trocar o ritmo não o espalha)
  const salvarTexto = () => {
    if (!editado || texto === p.b.texto) return
    setEditado(false)
    p.mudar({ ajustes: { [p.b.id]: { ...aj, fim: ultima, texto } } })
  }
  const juntar = () => {
    if (!p.prox) return
    const novo: Record<string, unknown> = { ...aj, fim: p.prox.palavras[p.prox.palavras.length - 1] }
    if (aj.texto != null || p.prox.ajustado) novo.texto = `${p.b.texto} ${p.prox.texto}`.trim()
    p.mudar({ ajustes: { [p.b.id]: novo, [p.prox.id]: null } })
  }
  const separar = () => p.mudar({ ajustes: separado(p.b, aj, p.lg?.modo ?? 'palavra') })
  const esconder = () => {
    if (!p.b.oculto) return p.mudar({ ajustes: { [p.b.id]: { ...aj, fim: ultima, texto: '' } } })
    // mostrar de novo: o texto volta ao automático; um bloco de uma palavra só, no palavra a palavra, volta inteiro
    const resto = { ...aj }
    delete resto.texto
    const nada = p.lg?.modo !== 'frase' && p.b.palavras.length === 1
    p.mudar({ ajustes: { [p.b.id]: nada ? null : resto } })
  }
  return (
    <div className="grid gap-3 border-t border-line-dark pt-4">
      <p className="flex items-center gap-2 text-[11.5px] text-fog">
        <span className="tabular-nums">
          {formatarTempo(p.b.ini)} → {formatarTempo(p.b.fim)}
        </span>
        <span>· {p.b.palavras.length === 1 ? '1 palavra' : `${p.b.palavras.length} palavras`}</span>
        {p.b.ajustado && <span className="ml-auto text-yellow">mexido à mão</span>}
      </p>
      <input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setEditado(true)
        }}
        onBlur={salvarTexto}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
        placeholder="(escondido)"
        className="h-10 rounded-[6px] border border-line-dark bg-ink px-3 text-[15px] font-semibold text-cream outline-none focus:border-cream/50"
      />
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Acao icone={Merge} onClick={agir(juntar)} desligado={!p.prox} titulo="Juntar com o próximo bloco">
          Juntar com o próximo
        </Acao>
        <Acao icone={Split} onClick={agir(separar)} desligado={p.b.palavras.length < 2} titulo="A 1ª palavra num bloco, o resto noutro">
          Separar
        </Acao>
        <Acao icone={EyeOff} onClick={agir(esconder)} titulo={p.b.oculto ? 'Mostrar este bloco de novo' : 'Não mostrar este bloco'}>
          {p.b.oculto ? 'Mostrar' : 'Esconder'}
        </Acao>
        {p.b.ajustado && (
          <Acao icone={RotateCcw} onClick={agir(() => p.mudar({ ajustes: { [p.b.id]: null } }))} titulo="O texto e o tamanho automáticos">
            Automático
          </Acao>
        )}
      </div>
    </div>
  )
}

/** Separar: a 1ª palavra num bloco, o resto noutro. Um texto corrigido à mão é dividido entre as partes (as últimas
 *  palavras do texto vão para o resto, uma por palavra; o que sobrar fica na 1ª); um bloco escondido continua
 *  escondido. Só ficam ajustes que mudam algo: no palavra a palavra, uma parte de uma palavra sem texto volta ao
 *  automático; no frase curta, o resto fica preso (senão o automático juntaria tudo de novo). */
function separado(b: Bloco, aj: Ajuste, modo: Modo): Record<string, Ajuste | null> {
  const ws = b.palavras
  const ultima = ws[ws.length - 1]
  let t1: string | undefined
  let t2: string | undefined
  if (aj.texto === '') t1 = t2 = ''
  else if (aj.texto != null) {
    const partes = aj.texto.trim().split(/\s+/).filter(Boolean)
    const k = Math.max(1, partes.length - (ws.length - 1))
    t1 = partes.slice(0, k).join(' ') || undefined
    t2 = partes.slice(k).join(' ') || undefined
  }
  const a1 = t1 != null ? { fim: ws[0], texto: t1 } : null
  const a2 = t2 != null ? { fim: ultima, texto: t2 } : ws.length > 2 || modo === 'frase' ? { fim: ultima } : null
  return { [b.id]: a1, [ws[1]]: a2 }
}

/** Os ajustes órfãos (SPEC §9): as palavras deles saíram todas do vídeo. Reatar leva o ajuste à próxima palavra que
 *  ficou (só ela); descartar apaga. */
function Orfaos(p: { orfaos: Orfao[]; mudar: (c: Record<string, unknown>) => void }) {
  const reatar = (o: Orfao) => o.reatar && p.mudar({ ajustes: { [o.id]: null, [o.reatar]: { ...o.ajuste, fim: o.reatar } } })
  return (
    <div className="grid gap-2 rounded-[6px] border border-yellow/40 bg-yellow/5 px-3 py-2.5">
      <p className="text-[11px] leading-[1.6] text-yellow">
        {p.orfaos.length === 1 ? '1 ajuste ficou órfão' : `${p.orfaos.length} ajustes ficaram órfãos`}: as palavras saíram do vídeo nos cortes.
      </p>
      {p.orfaos.map((o) => (
        <div key={o.id} className="flex items-center gap-1.5 text-[11px]">
          <span className="min-w-0 flex-1 truncate text-cream" title={o.fala}>
            {o.ajuste.texto === '' ? `escondido: “${o.fala}”` : o.ajuste.texto != null ? `“${o.ajuste.texto}”` : `junção: “${o.fala}”`}
          </span>
          <Acao icone={Link2} onClick={() => reatar(o)} desligado={!o.reatar} titulo="Prender este ajuste à próxima palavra que ficou no vídeo">
            Reatar
          </Acao>
          <Acao icone={Trash2} onClick={() => p.mudar({ ajustes: { [o.id]: null } })} titulo="Apagar este ajuste">
            Descartar
          </Acao>
        </div>
      ))}
    </div>
  )
}

function Acao(p: { icone: typeof Merge; onClick: () => void; desligado?: boolean; titulo: string; children: ReactNode }) {
  const I = p.icone
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
      disabled={p.desligado}
      title={p.titulo}
      className="flex items-center gap-1 rounded-full border border-line-dark px-2.5 py-1 font-semibold text-fog hover:text-cream disabled:opacity-40"
    >
      <I className="size-3" /> {p.children}
    </button>
  )
}
