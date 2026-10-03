import { useEffect, useRef, useState, type FormEvent } from 'react'
import { enviarMensagem, type Etapa, type Mensagem } from '@/api'
import { Marca } from '@/components/Marca'
import { Button } from '@/components/ui/button'
import { ETAPAS, SUGESTOES } from './etapas'

type Props = { projetoId: string; etapa: Etapa; mensagens: Mensagem[]; aoReceber: (novas: Mensagem[]) => void }

/** Chat da etapa aberta, no estilo do "workspace" do Otto. Na fase 2 o agente é simulado. */
export default function Chat({ projetoId, etapa, mensagens, aoReceber }: Props) {
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState('')
  const fim = useRef<HTMLDivElement>(null)
  const nome = ETAPAS.find((e) => e.id === etapa)!.nome

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, pensando])

  async function enviar(e?: FormEvent) {
    e?.preventDefault()
    if (!texto.trim() || pensando) return
    setPensando(true)
    setErro('')
    try {
      aoReceber(await enviarMensagem(projetoId, etapa, texto))
      setTexto('')
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setPensando(false)
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[#fffdf7] text-ink">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
        <span className="flex items-center gap-2 text-[13px] font-extrabold tracking-[-0.03em]">
          <Marca className="size-5 gap-[2px] text-coral" /> agente · {nome.toLowerCase()}
        </span>
        <span className="flex items-center gap-1.5 text-[9px] text-[#52745b]">
          <span className="size-1.5 rounded-full bg-current" /> {pensando ? 'Pensando…' : 'Pronto'}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        {mensagens.length === 0 && (
          <div className="grid gap-4">
            <p className="eyebrow text-[#6d7972]">Comece por aqui</p>
            <h3 className="titulo text-[30px]">Converse sobre {etapa === 'legenda' ? 'a legenda' : `os ${nome.toLowerCase()}`}.</h3>
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES[etapa].map((s) => (
                <button key={s} onClick={() => setTexto(s)} className="rounded-full border border-line px-3 py-1.5 text-left text-[11px] transition-colors hover:border-ink">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-6">
          {mensagens.map((m, i) =>
            m.autor === 'rodrigo' ? (
              <div key={i} className="flex items-start gap-2.5 text-[12px] leading-[1.6]">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#eed8c9] text-[8px] font-semibold">VOCÊ</span>
                <p className="pt-0.5">{m.texto}</p>
              </div>
            ) : (
              <div key={i} className="grid gap-2.5 pl-8">
                {m.ferramentas.map((f) => (
                  <div key={f} className="flex items-center gap-2.5 font-mono text-[10px]">
                    <span className="grid size-4 place-items-center rounded-full bg-[#e4ebdc] text-[9px] text-[#40624c]">✓</span>
                    {f}
                  </div>
                ))}
                <div className="border border-line bg-[#faf8f0] p-4">
                  <div className="mb-2 flex justify-between text-[8px] tracking-[0.08em] text-[#738074]">
                    <span>AGENTE{m.mock && ' · SIMULADO'}</span>
                    <span>↗</span>
                  </div>
                  <p className="text-[12px] leading-[1.75] text-[#3f4d48]">{m.texto}</p>
                </div>
              </div>
            ),
          )}
          {pensando && (
            <div className="flex items-center gap-2.5 pl-8 text-[10px] text-ink">
              <span className="size-4 animate-[otto-spin_1s_linear_infinite] rounded-full border border-coral border-t-transparent" />
              Usando as ferramentas da etapa…
            </div>
          )}
        </div>
        <div ref={fim} />
      </div>

      <form onSubmit={enviar} className="shrink-0 p-4">
        <div className="border border-[#182d2a26] bg-cream px-4 pt-3 pb-3 shadow-[5px_5px_0_#182d2a0d]">
          <label htmlFor="chat-texto" className="mb-2 block text-[9px] tracking-[0.1em]">
            PEÇA AO AGENTE
          </label>
          <textarea
            id="chat-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar()
              }
            }}
            rows={3}
            placeholder={`Ex.: ${SUGESTOES[etapa][0]}`}
            className="w-full resize-none bg-transparent text-[12px] leading-[1.7] outline-none placeholder:text-[#9aa49c]"
          />
          {erro && <p className="mb-2 text-[11px] text-destructive">{erro}</p>}
          <Button type="submit" disabled={pensando || !texto.trim()} className="mt-1 h-10 w-full justify-between text-[11px]">
            {pensando ? 'Pensando…' : 'Enviar'} <span className="seta">↗</span>
          </Button>
        </div>
      </form>
    </aside>
  )
}
