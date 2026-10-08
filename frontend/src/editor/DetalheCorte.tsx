import { useState } from 'react'
import { ms3, type DadosEditor, type Palavra, type TranscricaoCompleta } from '@/api'
import { cn } from '@/lib/utils'
import { bordasDoCorte, refCorte, refPalavra, type Corte, type Selecao } from './cortes'

type DetalheProps = {
  dados: DadosEditor
  cortes: Corte[]
  selecao: Selecao
  ouvirPalavra: (p: Palavra) => void
  ouvirEmenda: (c: Corte) => void
  loop: boolean
  setLoop: (v: boolean) => void
  restaurar?: (clipeId: string) => void
  devolver?: (ini: number, fim: number) => void
  comparacao?: TranscricaoCompleta | null
}

export function Detalhe(p: DetalheProps) {
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
        {p.comparacao && p.comparacao.familia === p.dados.projeto.transcricoes[p.dados.projeto.transcricao_ativa]?.familia && (() => {
          const o = p.comparacao.palavras.find((x) => x.id === w.id)
          return o ? (
            <p className="text-yellow tabular-nums">
              {p.comparacao.nome}: {ms3(o.inicio)} → {ms3(o.fim)} s (início {dif(o.inicio, w.inicio)}, fim {dif(o.fim, w.fim)} em relação a esta)
            </p>
          ) : null
        })()}
        {!p.comparacao && w.inicio_whisper != null && (
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
      {bordas
        .filter((b) => b.automatico != null && Math.abs(b.automatico - b.t) > 0.0005)
        .map((b) => (
          <p key={`aj${b.lado}`} className="flex flex-wrap items-center gap-2 tabular-nums text-yellow">
            ✎ {b.lado === 'inicio' ? 'Início' : 'Fim'} ajustado à mão: a IA tinha posto {ms3(b.automatico!)} ({b.t - b.automatico! >= 0 ? '+' : '−'}
            {Math.abs(Math.round((b.t - b.automatico!) * 1000))} ms)
            {p.restaurar && <Botao onClick={() => p.restaurar!(b.clipeId)}>↺ Restaurar da IA</Botao>}
          </p>
        ))}
      {c.removidas.length > 0 && <p className="line-clamp-2 text-fog">“{c.removidas.map((w) => w.texto).join(' ')}”</p>}
      <Acoes>
        <Botao onClick={() => p.ouvirEmenda(c)}>▶ Ouvir emenda</Botao>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-fog">
          <input type="checkbox" checked={p.loop} onChange={(e) => p.setLoop(e.target.checked)} /> repetir
        </label>
        <Botao onClick={() => copiar(refCorte(c))}>{copiado ? 'Copiado ✓' : 'Copiar referência'}</Botao>
        {p.devolver && <Botao onClick={() => p.devolver!(c.ini, c.fim)}>✕ Excluir corte</Botao>}
      </Acoes>
    </Cartao>
  )
}

const Cartao = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-3 grid shrink-0 gap-1.5 border-t border-line-dark pt-3 text-[12px] leading-[1.55]">{children}</div>
)
const Acoes = ({ children }: { children: React.ReactNode }) => <div className="mt-1 flex items-center gap-3">{children}</div>
const Botao = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="h-7 rounded-full border border-line-dark px-3 text-[11px] font-semibold hover:border-cream/50 hover:text-cream">
    {children}
  </button>
)
