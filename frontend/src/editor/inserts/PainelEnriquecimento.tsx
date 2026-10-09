import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, RotateCcw, Settings2 } from 'lucide-react'
import type { ItemBanco } from '@/api'
import { cn } from '@/lib/utils'
import { CATEGORIAS } from '../EtapaDirecao'
import MiniPreset from '../MiniPreset'
import { comRecomendados, ordemDoInsert, presetsPara, useOrdem, usePresets } from '../presets'
import { aspectosDe, divisaoDe, receitaParaInsert } from '../divisao'
import { presetDe } from '../InsertNoLugar'
import type { Qual } from '../enriquecimento'
import { type Lado, type Entradas } from '../entradas'
import { BOTAO, NOME_TIPO, type Pedido } from './comum'

export default function PainelEnriquecimento(p: {
  pedido: Pedido
  banco?: Map<string, ItemBanco>
  mudar: (c: Record<string, string | number | number[] | null>) => void
  aplicarAoTipo: () => void
  /** Toca a entrada ou a saída de uma mídia (o "▶ Ver" da engrenagem). */
  ver: (lado: Lado, qual: Qual) => void
  entradas: Entradas | null
  /** O preset com a engrenagem aberta (o editor fica na coluna ao lado do vídeo) e como abrir/fechar. */
  presetAberto?: string | null
  abrirPreset?: (id: string | null) => void
  fundo?: string
  /** Só para ver as opções (motions): o aviso aparece em cima e nada é salvo. */
  aviso?: string
}) {
  const x = p.pedido
  const presets = usePresets()
  const [verTodos, setVerTodos] = useState(false)
  // as proporções só filtram quando o banco já deu as medidas (sem elas, aspectosDe supõe 16:9)
  const opcoesPreset = presetsPara(presets, x.formato, x.midias.length, !verTodos, x.enriquecimento?.divisao === 'atras', p.banco?.size ? aspectosDe(x.midias, p.banco) : undefined)
  // a ordem da situação (página Presets → Ordem e recomendados): os 3 primeiros que servem ficam em cima
  const ordem = useOrdem()
  const tela = x.enriquecimento?.divisao === 'atras' ? 'atras' : x.formato === 'vertical' ? 'vertical' : 'dividida'
  const grupos = comRecomendados(opcoesPreset, ordemDoInsert(ordem, tela, aspectosDe(x.midias, p.banco)))
  const idsMidias = useMemo(() => x.midias.map((m) => m.banco), [x.midias])
  const presetAtual = presetDe(x, presets)
  const [sobre, setSobre] = useState<string | null>(null)
  const mudado = Object.keys(x.enriquecimento ?? {}).length > 0
  const nomeTipo = NOME_TIPO[x.tipo] ?? CATEGORIAS.planos[x.tipo] ?? x.tipo
  return (
    <div className="grid gap-5">
      {p.aviso && <p className="rounded-[6px] border border-dashed border-yellow/40 px-3 py-2 text-[11.5px] leading-[1.6] text-yellow/90">{p.aviso}</p>}
      {!p.aviso && x.formato === 'dividida' && x.midias.length > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-[12px]" title="O insert na tela toda e o ator encolhido numa janela embaixo, com a cabeça saindo por cima">
          <input type="checkbox" checked={x.enriquecimento?.divisao === 'atras'} onChange={(ev) => p.mudar({ divisao: ev.target.checked ? 'atras' : null })} />
          Ator embaixo, cropado numa janela
        </label>
      )}
      {!p.aviso && x.enriquecimento?.preset && !presetAtual && (
        <p className="rounded-[6px] border border-dashed border-yellow/40 px-3 py-2 text-[11.5px] leading-[1.6] text-yellow/90">
          O preset escolhido ({presets?.find((y) => y.id === x.enriquecimento?.preset)?.nome ?? 'apagado'}) não serve a {x.midias.length} mídia{x.midias.length > 1 ? 's' : ''}: escolha outro.
        </p>
      )}
      {!p.aviso && x.midias.length > 0 && (
        <div className="grid gap-2">
          <div className="eyebrow flex items-center text-sage">
            Presets {x.midias.length > 1 && `· ${x.midias.length} mídias`}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 tracking-normal normal-case text-fog">
              <input type="checkbox" checked={verTodos} onChange={(ev) => setVerTodos(ev.target.checked)} /> ver os não aprovados
            </label>
          </div>
          {opcoesPreset.length ? (
            <div className="grid gap-3">
              {[
                { titulo: 'Recomendados', l: grupos.recomendados, pequeno: false },
                { titulo: 'Outros presets', l: grupos.outros, pequeno: grupos.recomendados.length > 0 },
              ]
                .filter((g) => g.l.length)
                .map((g) => (
                  <div key={g.titulo} className="grid gap-1.5">
                    {grupos.recomendados.length > 0 && <p className="text-[10.5px] font-semibold text-fog">{g.titulo}</p>}
                    <div className={cn('grid gap-2', g.pequeno ? 'grid-cols-4' : 'grid-cols-3')}>
                      {g.l.map((pr) => {
                      const ativo = presetAtual?.id === pr.id
                      return (
                        <div key={pr.id} className="relative" onMouseEnter={() => setSobre(pr.id)} onMouseLeave={() => setSobre(null)}>
                          <button
                            onClick={() => p.mudar({ preset: ativo ? null : pr.id })}
                            className="group/p grid w-full gap-1.5 text-left"
                            title={pr.nome}
                          >
                            <MiniPreset
                              receita={receitaParaInsert(pr.receita, divisaoDe({ ...x, enriquecimento: { ...x.enriquecimento, preset: pr.id } }, p.banco, presets), aspectosDe(x.midias, p.banco), x.formato)}
                              midias={idsMidias}
                              fundo={p.fundo ?? 'gradiente'}
                              tocar={sobre === pr.id || ativo}
                              className={cn('overflow-hidden rounded-[6px] ring-1 transition-shadow', ativo ? 'ring-2 ring-coral' : 'ring-line-dark group-hover/p:ring-cream/40')}
                            />
                            <span className={cn('line-clamp-2 text-[10.5px] leading-tight', ativo ? 'text-cream' : 'text-fog')}>
                              {!pr.aprovado && <span className="text-yellow">● </span>}
                              {pr.nome}
                              {pr.adaptado && <span className="text-fog/60" title={`Feito para ${pr.formato === 'vertical' ? 'tela cheia' : 'tela dividida'}, adaptado a este formato`}> · adaptado</span>}
                            </span>
                          </button>
                          <button
                            onClick={() => p.abrirPreset?.(p.presetAberto === pr.id ? null : pr.id)}
                            className={cn('absolute top-2 left-2 grid size-6 place-items-center rounded-full transition-colors', p.presetAberto === pr.id ? 'bg-coral text-cream' : 'bg-ink/70 text-fog hover:text-cream')}
                            title="Configurar este preset (vale para todos os inserts)"
                            aria-label="Configurar"
                          >
                            <Settings2 className="size-3.5" />
                          </button>
                        </div>
                      )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-[11.5px] leading-[1.6] text-fog">
              Nenhum preset aprovado para {x.midias.length} mídia{x.midias.length > 1 ? 's' : ''} neste formato. Peça um ao Claude (mande o trecho de referência) e aprove na página{' '}
              <Link to="/presets" className="text-yellow hover:underline">
                Presets
              </Link>
              .
            </p>
          )}
        </div>
      )}
      <div className={cn('flex flex-wrap gap-2 border-t border-line-dark pt-4 text-[11px]', p.aviso && 'hidden')}>
        <button onClick={() => p.mudar({ layout: null, entrada: null, entrada_2: null, saida: null, saida_2: null, entre: null, corte: null, preset: null })} disabled={!mudado} className={cn(BOTAO, 'disabled:opacity-40')}>
          <RotateCcw className="size-3" /> Tirar o preset
        </button>
        <button onClick={p.aplicarAoTipo} className={BOTAO} title={`Copia este enriquecimento para todos os planos “${nomeTipo}”`}>
          <Copy className="size-3" /> Aplicar a todos “{nomeTipo}”
        </button>
      </div>
    </div>
  )
}
