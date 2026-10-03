import { useState } from 'react'
import { Play } from 'lucide-react'
import { ms3, type DadosEditor, type Duvida, type Palavra } from '@/api'
import { cn } from '@/lib/utils'
import { bordasDoCorte, refCorte, refPalavra, type Corte, type Selecao } from './cortes'

type Props = {
  dados: DadosEditor
  cortes: Corte[]
  selecao: Selecao
  selecionar: (s: Selecao) => void
  bruto: number
  buscarBruto: (t: number) => void
  ouvirPalavra: (p: Palavra) => void
  ouvirEmenda: (c: Corte) => void
  loop: boolean
  setLoop: (v: boolean) => void
}

/** Texto da etapa de Cortes: o que a IA tirou fica riscado, cada corte mostra os tempos exatos no bruto. */
export default function PainelCortes(p: Props) {
  const [preciso, setPreciso] = useState(false)
  const { palavras, duvidas } = p.dados
  const indice = new Map(palavras.map((w, i) => [w.id, i]))
  const duvidaDe = (i: number) => duvidas.find((d: Duvida) => indice.get(d.ini)! <= i && i <= indice.get(d.fim)!)

  const linhas: Palavra[][] = []
  palavras.forEach((w, i) => {
    if (i === 0 || w.inicio - palavras[i - 1].fim > 0.8) linhas.push([])
    linhas[linhas.length - 1].push(w)
  })
  const aposPalavra = new Map(p.cortes.filter((c) => c.palavraAntes).map((c) => [c.palavraAntes!.id, c]))
  const noComeco = p.cortes.find((c) => !c.antes)

  const marca = (c: Corte) => <MarcaCorte key={`c${c.n}`} corte={c} escolhido={p.selecao?.tipo === 'corte' && p.selecao.n === c.n} selecionar={p.selecionar} buscarBruto={p.buscarBruto} ouvir={p.ouvirEmenda} />

  return (
    <section className="flex h-full min-h-0 flex-col text-cream">
      <div className="flex shrink-0 items-center justify-between gap-3 pb-3 text-[11px] text-fog">
        <span>
          Clique numa palavra ou num corte para ver os milissegundos. <kbd className="rounded border border-line-dark px-1">E</kbd> ouve a emenda mais próxima.
        </span>
        <button
          onClick={() => setPreciso((v) => !v)}
          className={cn('h-7 shrink-0 rounded-full border px-3 font-semibold', preciso ? 'border-yellow text-yellow' : 'border-line-dark hover:border-cream/50 hover:text-cream')}
        >
          Modo preciso
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <div className={cn('grid text-[17px] tracking-[-0.01em]', preciso ? 'gap-4 leading-[2.6]' : 'gap-3 leading-[1.9]')}>
          {duvidas.length > 0 && (
            <p className="border-l-2 border-yellow pl-3 text-[12px] leading-[1.6] text-fog">
              A IA ficou em dúvida em {duvidas.length} trecho{duvidas.length > 1 && 's'} (sublinhado amarelo) e os manteve.
            </p>
          )}
          {linhas.map((linha, li) => (
            <p key={linha[0].id}>
              {li === 0 && noComeco && marca(noComeco)}
              {linha.map((w) => {
                const sai = !w.mantida
                const atual = p.bruto >= w.inicio && p.bruto < w.fim
                const escolhida = p.selecao?.tipo === 'palavra' && p.selecao.id === w.id
                const duvida = duvidaDe(indice.get(w.id)!)
                const corte = aposPalavra.get(w.id)
                return (
                  <span key={w.id}>
                    <button
                      onClick={() => {
                        p.selecionar({ tipo: 'palavra', id: w.id })
                        p.buscarBruto(w.inicio)
                      }}
                      title={duvida ? `Dúvida da IA: ${duvida.motivo}` : `${w.id} · ${ms3(w.inicio)} → ${ms3(w.fim)} s`}
                      className={cn(
                        'rounded-[2px] px-0.5 align-bottom transition-colors',
                        sai ? 'text-fog/55 line-through decoration-coral decoration-[1.5px]' : 'hover:bg-cream/10',
                        duvida && 'underline decoration-yellow decoration-2 underline-offset-4',
                        atual && 'bg-yellow/90 text-ink hover:bg-yellow/90',
                        escolhida && 'ring-2 ring-yellow',
                      )}
                    >
                      {preciso ? (
                        <span className="inline-flex flex-col items-center leading-none">
                          <span>{w.texto}</span>
                          <span className="mt-0.5 font-mono text-[9px] tracking-tight text-fog no-underline">{ms3(w.inicio)}</span>
                        </span>
                      ) : (
                        w.texto
                      )}
                    </button>{' '}
                    {corte && marca(corte)}
                  </span>
                )
              })}
            </p>
          ))}
        </div>
      </div>

      <Detalhe {...p} />
    </section>
  )
}

function MarcaCorte({ corte: c, escolhido, selecionar, buscarBruto, ouvir }: { corte: Corte; escolhido: boolean; selecionar: Props['selecionar']; buscarBruto: Props['buscarBruto']; ouvir: Props['ouvirEmenda'] }) {
  return (
    <span
      className={cn(
        'mx-1 inline-flex items-center overflow-hidden rounded-full border align-middle text-[10px] font-semibold tabular-nums',
        escolhido ? 'border-yellow bg-yellow text-ink' : 'border-coral/60 bg-coral/10 text-coral',
      )}
    >
      <button
        onClick={() => {
          selecionar({ tipo: 'corte', n: c.n })
          buscarBruto(c.ini)
        }}
        className="py-0.5 pr-1.5 pl-2.5 hover:bg-coral/15"
        title="Ver detalhes do corte"
      >
        ✂{c.n} · {ms3(c.ini)} → {ms3(c.fim)} · −{(c.fim - c.ini).toFixed(2)} s
        {c.tipo === 'pausa' && ' · pausa'}
      </button>
      <button onClick={() => ouvir(c)} className="border-l border-current/25 px-2 py-0.5 hover:bg-coral/20" aria-label="Ouvir emenda" title="Ouvir emenda (E)">
        <Play className="size-2.5 fill-current" />
      </button>
    </span>
  )
}

function Detalhe(p: Props) {
  const [copiado, setCopiado] = useState(false)
  if (!p.selecao) {
    return <div className="mt-3 shrink-0 border-t border-line-dark pt-3 text-[12px] text-fog">Selecione uma palavra ou um corte para ver os tempos em milissegundos.</div>
  }
  const copiar = async (texto: string) => {
    await navigator.clipboard.writeText(texto).catch(() => undefined)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1400)
  }

  if (p.selecao.tipo === 'palavra') {
    const id = p.selecao.id
    const w = p.dados.palavras.find((x) => x.id === id)
    if (!w) return null
    const dif = (a: number, b: number) => `${a - b >= 0 ? '+' : '−'}${Math.abs(Math.round((a - b) * 1000))} ms`
    return (
      <Cartao>
        <div className="flex items-baseline gap-3">
          <b className="text-[15px]">“{w.texto}”</b>
          <span className="font-mono text-[11px] text-fog">{w.id}</span>
          <span className={cn('text-[10px] font-semibold tracking-[0.1em]', w.mantida ? 'text-mint' : 'text-coral')}>{w.mantida ? 'MANTIDA' : 'REMOVIDA PELA IA'}</span>
        </div>
        <p className="tabular-nums">
          {ms3(w.inicio)} → {ms3(w.fim)} s · <b>{Math.round((w.fim - w.inicio) * 1000)} ms</b>
        </p>
        {w.inicio_whisper != null && (
          <p className="text-fog tabular-nums">
            Whisper marcou {ms3(w.inicio_whisper)} → {ms3(w.fim_whisper!)} s (início {dif(w.inicio, w.inicio_whisper)}, fim {dif(w.fim, w.fim_whisper!)})
          </p>
        )}
        <Acoes>
          <Botao onClick={() => p.ouvirPalavra(w)}>▶ Ouvir</Botao>
          <Botao onClick={() => copiar(refPalavra(w))}>{copiado ? 'Copiado ✓' : 'Copiar referência'}</Botao>
        </Acoes>
      </Cartao>
    )
  }

  const n = p.selecao.n
  const c = p.cortes.find((x) => x.n === n)
  if (!c) return null
  const bordas = bordasDoCorte(c, p.dados.silencios)
  return (
    <Cartao>
      <div className="flex items-baseline gap-3">
        <b className="text-[15px]">✂{c.n}</b>
        <span className="tabular-nums">
          {ms3(c.ini)} → {ms3(c.fim)} s · <b>−{(c.fim - c.ini).toFixed(3).replace('.', ',')} s</b>
        </span>
        <span className="text-[11px] text-fog">{c.tipo === 'pausa' ? 'pausa longa encurtada' : `${c.removidas.length} palavras removidas`}</span>
      </div>
      {bordas.map((b) => (
        <p key={b.lado} className="tabular-nums">
          <span className="text-fog">{b.lado === 'inicio' ? 'Início' : 'Fim'} do corte ({ms3(b.t)}):</span>{' '}
          {b.folgaMs! >= 0 ? (
            <>
              <b>{b.folgaMs} ms</b> {b.lado === 'inicio' ? 'depois do fim' : 'antes do começo'} de “{b.palavra!.texto}”
            </>
          ) : (
            <b className="text-coral">⚠ entra {-b.folgaMs!} ms dentro de “{b.palavra!.texto}”</b>
          )}{' '}
          · {b.silencio ? `em pausa (${ms3(b.silencio.inicio)} → ${ms3(b.silencio.fim)})` : <b className="text-coral">⚠ fora de pausa</b>}
        </p>
      ))}
      {c.removidas.length > 0 && <p className="line-clamp-2 text-fog">“{c.removidas.map((w) => w.texto).join(' ')}”</p>}
      <Acoes>
        <Botao onClick={() => p.ouvirEmenda(c)}>▶ Ouvir emenda</Botao>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fog">
          <input type="checkbox" checked={p.loop} onChange={(e) => p.setLoop(e.target.checked)} /> repetir
        </label>
        <Botao onClick={() => copiar(refCorte(c))}>{copiado ? 'Copiado ✓' : 'Copiar referência'}</Botao>
      </Acoes>
    </Cartao>
  )
}

const Cartao = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-3 grid max-h-[42%] shrink-0 gap-1.5 overflow-y-auto border-t border-line-dark pt-3 text-[12px] leading-[1.55]">{children}</div>
)
const Acoes = ({ children }: { children: React.ReactNode }) => <div className="mt-1 flex items-center gap-3">{children}</div>
const Botao = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="h-7 rounded-full border border-line-dark px-3 text-[11px] font-semibold hover:border-cream/50 hover:text-cream">
    {children}
  </button>
)
