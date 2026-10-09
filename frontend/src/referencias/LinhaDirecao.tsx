import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCirclePlus, Pencil, Trash2 } from 'lucide-react'
import { urlArquivoReferencia, type ItemRef, type Palavra } from '@/api'
import { cn } from '@/lib/utils'
import { elementosDe, faixasDeElementos, planosDe } from './edicao'

/** Colunas da timeline (px). O tempo corre de cima para baixo, como na etapa de Cortes. */
const X_PALAVRAS = 54
const X_BARRA = 196
const X_PLANOS = 208
const L_PLANOS = 138
const X_ELEMENTOS = X_PLANOS + L_PLANOS + 10
const L_ELEMENTO = 46
/** Coluna dos comentários (só na Direção do projeto): logo depois de duas faixas de elementos. */
export const X_COMENTARIOS = X_ELEMENTOS + 2 * (L_ELEMENTO + 4) + 8
const L_COMENTARIOS = 50
const ALT_PALAVRA = 15
const IMA_PX = 6
const ZONA_MORTA_PX = 3

export const COR_PLANO: Record<string, string> = {
  full_ator: 'bg-[#2c4540] text-cream ring-1 ring-inset ring-cream/25',
  full_ator_lettering: 'bg-[#2c4540] text-cream ring-2 ring-inset ring-coral',
  insert_tela_cheia: 'bg-blue text-cream',
  motion_tela_cheia: 'bg-yellow text-ink',
  tela_dividida_insert: 'bg-mint text-ink',
  tela_dividida_motion: 'bg-[#efe3a3] text-ink',
  comentario_insert_ator: 'bg-[#b9a6f2] text-ink',
}
export const COR_ELEMENTO: Record<string, string> = {
  lettering: 'bg-coral text-cream',
  palavra_manychat: 'bg-cream text-ink',
  caixinha_perguntas: 'bg-sage text-ink',
  print_sobreposto: 'bg-[#8aa6ff] text-ink',
}

export type Arrasto = { tipo: 'borda'; k: number } | { tipo: 'elemento'; id: string; lado: 'inicio' | 'fim' | 'corpo' }

type Props = {
  refId: string
  duracao: number
  palavras: Palavra[]
  cortes: number[]
  itens: ItemRef[]
  nomes: Record<string, string>
  tempo: number
  tocando: boolean
  selecionado: string | null
  px: number
  setPx: (f: (px: number) => number) => void
  buscar: (t: number) => void
  selecionar: (id: string | null) => void
  /** Começo de um arrasto (o chamador guarda o estado para desfazer). */
  aoIniciarArrasto: () => void
  arrastar: (a: Arrasto, t: number) => void
  /** Comentários do criador por ponto do vídeo (Direção do projeto): bolinhas numa coluna à direita dos elementos. */
  comentarios?: {
    lista: { id: string; t: number; texto: string }[]
    adicionar: (t: number) => void
    editar: (id: string) => void
    excluir: (id: string) => void
  }
}

type Estado = {
  a: Arrasto
  y0: number
  t0: number
  moveu: boolean
  deslocamento: number
}

export default function LinhaDirecao(p: Props) {
  const rolagem = useRef<HTMLDivElement>(null)
  const [arrasto, setArrasto] = useState<Estado | null>(null)
  const [guia, setGuia] = useState<number | null>(null)
  const [comentarioAberto, setComentarioAberto] = useState<string | null>(null)
  const total = Math.max(p.duracao * p.px, 200)
  const y = (t: number) => t * p.px
  const planos = useMemo(() => planosDe(p.itens), [p.itens])
  const elementos = useMemo(() => elementosDe(p.itens), [p.itens])
  const faixas = useMemo(() => faixasDeElementos(elementos), [elementos])
  const nFaixas = Math.max(1, ...[...faixas.values()].map((k) => k + 1))

  // ímã: começos e fins de palavras e cortes de cena detectados
  const imas = useMemo(() => [...p.cortes, ...p.palavras.flatMap((w) => [w.inicio, w.fim])].sort((a, b) => a - b), [p.cortes, p.palavras])
  const imantar = (t: number, livre: boolean) => {
    if (livre) return t
    let melhor = t
    let dist = IMA_PX / p.px
    for (const c of imas) {
      const d = Math.abs(c - t)
      if (d < dist) {
        dist = d
        melhor = c
      }
    }
    return melhor
  }

  // segue a cabeça de reprodução enquanto toca
  useEffect(() => {
    const el = rolagem.current
    if (!el || !p.tocando) return
    const yt = y(p.tempo)
    if (yt < el.scrollTop + 40 || yt > el.scrollTop + el.clientHeight - 80) el.scrollTop = yt - el.clientHeight * 0.3
  })

  // Ctrl/⌘ + roda: zoom mantendo o ponto sob o mouse
  useEffect(() => {
    const el = rolagem.current
    if (!el) return
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const caixa = el.getBoundingClientRect()
      const tMouse = (e.clientY - caixa.top + el.scrollTop) / p.px
      const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15
      p.setPx((v) => {
        const novo = Math.min(Math.max(v * fator, 8), 600)
        requestAnimationFrame(() => (el.scrollTop = tMouse * novo - (e.clientY - caixa.top)))
        return novo
      })
    }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [p])

  // arrasto pelo documento inteiro (o ponteiro pode sair da alça)
  useEffect(() => {
    if (!arrasto) return
    const mover = (e: PointerEvent) => {
      const dy = e.clientY - arrasto.y0
      if (!arrasto.moveu && Math.abs(dy) < ZONA_MORTA_PX) return
      if (!arrasto.moveu) {
        p.aoIniciarArrasto()
        arrasto.moveu = true
      }
      const bruto = arrasto.t0 + dy / p.px
      // no corpo, o ímã vale para o começo do elemento
      const t = imantar(bruto, e.altKey)
      setGuia(t)
      p.arrastar(arrasto.a, t)
    }
    const soltar = () => {
      setArrasto(null)
      setGuia(null)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  })

  const pegar = (e: React.PointerEvent, a: Arrasto, t0: number) => {
    e.stopPropagation()
    e.preventDefault()
    setArrasto({ a, y0: e.clientY, t0, moveu: false, deslocamento: 0 })
  }

  const tDoEvento = (e: React.MouseEvent) => {
    const el = rolagem.current!
    return (e.clientY - el.getBoundingClientRect().top + el.scrollTop) / p.px
  }

  // rótulos das palavras empurrados para baixo quando colidem
  const mostrarPalavras = p.px >= 30
  const topos = useMemo(() => {
    let livre = -Infinity
    return p.palavras.map((w) => {
      const top = Math.max(w.inicio * p.px, livre)
      livre = top + ALT_PALAVRA
      return top
    })
  }, [p.palavras, p.px])

  const passoRegua = p.px >= 120 ? 0.5 : p.px >= 40 ? 1 : p.px >= 15 ? 5 : 10
  const marcas = Array.from({ length: Math.floor(p.duracao / passoRegua) + 1 }, (_, k) => k * passoRegua)
  const fimElementos = X_ELEMENTOS + nFaixas * (L_ELEMENTO + 4) + 12
  const xComentarios = Math.max(X_COMENTARIOS, fimElementos - 4)
  const largura = p.comentarios ? xComentarios + L_COMENTARIOS : fimElementos

  return (
    <div ref={rolagem} className="relative min-h-0 flex-1 overflow-auto">
      <div
        className="relative"
        style={{ height: total + 40, width: Math.max(largura, 100) }}
        onClick={(e) => p.buscar(Math.min(Math.max(tDoEvento(e), 0), p.duracao))}
      >
        {/* régua */}
        {marcas.map((t) => (
          <div key={t} className="pointer-events-none absolute left-0 flex items-center gap-1" style={{ top: y(t) - 6 }}>
            <span className="w-9 text-right text-[9px] text-fog/70 tabular-nums">
              {t % 60 === 0 ? `${t / 60}:00` : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}${t % 1 ? ',5' : ''}`}
            </span>
            <span className="h-px w-2 bg-fog/40" />
          </div>
        ))}

        {/* palavras */}
        {p.palavras.map((w) => (
          <i
            key={`b${w.id}`}
            className="pointer-events-none absolute w-[5px] rounded-[1px] bg-cream/35"
            style={{
              left: X_BARRA,
              top: y(w.inicio),
              height: Math.max((w.fim - w.inicio) * p.px - 1, 1),
            }}
          />
        ))}
        {mostrarPalavras &&
          p.palavras.map((w, i) => (
            <span
              key={w.id}
              title={`${w.texto} · ${w.inicio.toFixed(2)} → ${w.fim.toFixed(2)} s`}
              className={cn('absolute truncate text-[11px] leading-[15px]', Math.abs(topos[i] - y(w.inicio)) > 3 ? 'text-fog/70' : 'text-cream/90')}
              style={{
                left: X_PALAVRAS,
                top: topos[i],
                width: X_BARRA - X_PALAVRAS - 6,
              }}
            >
              {w.texto}
            </span>
          ))}
        {!mostrarPalavras && (
          <p className="pointer-events-none sticky top-3 ml-[54px] w-[130px] text-[10px] leading-snug text-fog/70">
            Aproxime (+ ou Ctrl/⌘ + roda) para ver as palavras.
          </p>
        )}

        {/* cortes de cena detectados */}
        {p.cortes.map((c) => (
          <div
            key={c}
            className="pointer-events-none absolute border-t border-dashed border-cream/30"
            style={{
              left: X_BARRA + 8,
              top: y(c),
              width: largura - X_BARRA - 8,
            }}
            title="Corte de cena detectado"
          />
        ))}

        {/* planos-base */}
        {planos.map((pl, k) => {
          const h = (pl.fim - pl.inicio) * p.px
          const sel = p.selecionado === pl.id
          return (
            <div key={pl.id}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  p.selecionar(pl.id)
                  p.buscar(pl.inicio + 0.01)
                }}
                className={cn(
                  'absolute flex flex-col items-start overflow-hidden rounded-[4px] px-2 py-1 text-left text-[10px] leading-tight transition-shadow',
                  COR_PLANO[pl.tipo],
                  sel && 'z-10 shadow-[0_0_0_2px_#f9db6d]',
                )}
                style={{
                  left: X_PLANOS,
                  top: y(pl.inicio) + 1,
                  width: L_PLANOS,
                  height: Math.max(h - 2, 3),
                }}
                title={`${p.nomes[pl.tipo]} · ${pl.descricao}`}
              >
                {h >= 16 && (
                  <b className="w-full truncate font-semibold">
                    {p.nomes[pl.tipo]}
                  </b>
                )}
                {h >= 90 && pl.miniatura && (
                  <img
                    src={urlArquivoReferencia(p.refId, pl.miniatura)}
                    alt=""
                    className="mt-1 max-h-[96px] w-auto rounded-[2px] object-cover"
                    draggable={false}
                  />
                )}
                {h >= 28 && pl.texto && <span className="mt-0.5 line-clamp-2 font-semibold">“{pl.texto}”</span>}
                {h >= 40 && pl.descricao && <span className="mt-1 line-clamp-3 opacity-80">{pl.descricao}</span>}
              </button>
              {k < planos.length - 1 && (
                <div
                  onPointerDown={(e) => pegar(e, { tipo: 'borda', k }, pl.fim)}
                  onClick={(e) => e.stopPropagation()}
                  className="group absolute z-20 cursor-ns-resize"
                  style={{
                    left: X_PLANOS - 4,
                    top: y(pl.fim) - 5,
                    width: L_PLANOS + 8,
                    height: 10,
                  }}
                  title="Arraste para mover a troca de plano (Alt: sem ímã)"
                >
                  <span className="absolute inset-x-0 top-[4px] h-[2px] rounded-full bg-yellow opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              )}
            </div>
          )
        })}

        {/* elementos */}
        {elementos.map((el) => {
          const h = Math.max((el.fim - el.inicio) * p.px, 6)
          const sel = p.selecionado === el.id
          const x = X_ELEMENTOS + (faixas.get(el.id) ?? 0) * (L_ELEMENTO + 4)
          return (
            <div
              key={el.id}
              onPointerDown={(e) => {
                p.selecionar(el.id)
                pegar(e, { tipo: 'elemento', id: el.id, lado: 'corpo' }, el.inicio)
              }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'group absolute cursor-grab overflow-hidden rounded-[4px] px-1 py-0.5 text-[9px] leading-tight select-none active:cursor-grabbing',
                COR_ELEMENTO[el.tipo],
                sel && 'z-10 shadow-[0_0_0_2px_#f9db6d]',
              )}
              style={{
                left: x,
                top: y(el.inicio),
                width: L_ELEMENTO,
                height: h,
              }}
              title={`${p.nomes[el.tipo]}${el.texto ? `: “${el.texto}”` : ''}`}
            >
              {h >= 14 && <b className="block truncate">{el.texto || p.nomes[el.tipo]}</b>}
              <span
                onPointerDown={(e) => pegar(e, { tipo: 'elemento', id: el.id, lado: 'inicio' }, el.inicio)}
                className="absolute inset-x-0 top-0 h-[5px] cursor-ns-resize group-hover:bg-ink/25"
              />
              <span
                onPointerDown={(e) => pegar(e, { tipo: 'elemento', id: el.id, lado: 'fim' }, el.fim)}
                className="absolute inset-x-0 bottom-0 h-[5px] cursor-ns-resize group-hover:bg-ink/25"
              />
            </div>
          )
        })}

        {/* guia do arrasto e cabeça de reprodução */}
        {guia != null && (
          <div className="pointer-events-none absolute z-30 border-t border-yellow" style={{ left: 0, top: y(guia), width: largura }}>
            <span className="absolute -top-[9px] left-1 rounded-full bg-yellow px-1.5 text-[9px] font-semibold text-ink tabular-nums">
              {guia.toFixed(3).replace('.', ',')}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute z-20 h-0 border-t-2 border-coral" style={{ left: 0, top: y(p.tempo), width: largura }} />

        {/* comentários: bolinhas no ponto do vídeo; passar o mouse mostra o texto. O 💬+ anda com a cabeça de reprodução. */}
        {p.comentarios && (
          <>
            <div className="pointer-events-none absolute top-0 border-l border-line-dark" style={{ left: xComentarios - 2, height: total + 40 }} />
            {p.comentarios.lista.map((c) => (
              <div
                key={c.id}
                className={cn('absolute', comentarioAberto === c.id ? 'z-40' : 'z-30')}
                style={{
                  left: xComentarios + 2,
                  top: Math.max(y(c.t) - 10, 2),
                }}
                onMouseEnter={() => setComentarioAberto(c.id)}
                onMouseLeave={() => setComentarioAberto((a) => (a === c.id ? null : a))}
                onClick={(e) => {
                  e.stopPropagation()
                  p.buscar(c.t)
                }}
              >
                <span className="grid size-5 cursor-pointer place-items-center rounded-full bg-yellow text-[10px] text-ink shadow-[0_0_0_2px_#13201d]">💬</span>
                {comentarioAberto === c.id && (
                  <div className="absolute top-0 right-full w-[240px] pr-2">
                    <div className="grid gap-2 rounded-[6px] bg-cream p-3 text-[11.5px] leading-snug text-ink shadow-xl">
                      <p className="whitespace-pre-wrap">{c.texto}</p>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            p.comentarios!.editar(c.id)
                          }}
                          className="flex items-center gap-1 rounded-full border border-ink/20 px-2 py-0.5 text-[10.5px] font-semibold hover:bg-ink/10"
                        >
                          <Pencil className="size-3" /> Editar
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            p.comentarios!.excluir(c.id)
                          }}
                          className="flex items-center gap-1 rounded-full border border-ink/20 px-2 py-0.5 text-[10.5px] font-semibold text-coral hover:bg-coral/10"
                        >
                          <Trash2 className="size-3" /> Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation()
                p.comentarios!.adicionar(p.tempo)
              }}
              className="absolute z-30 grid size-6 place-items-center rounded-full bg-coral text-cream shadow-md hover:scale-110"
              style={{
                left: xComentarios + 24,
                top: Math.max(y(p.tempo) - 12, 2),
              }}
              title="Comentar este ponto da direção (C)"
              aria-label="Comentar este ponto"
            >
              <MessageCirclePlus className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
