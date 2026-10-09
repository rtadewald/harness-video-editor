import { useRef } from 'react'
import { Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCatalogoLook, type Look } from './look'

const NOME_VINHETA: Record<Look['vinheta'], string> = { sem: 'Sem', leve: 'Leve', normal: 'Normal', forte: 'Forte' }

/** O Look do Pré-processamento (docs/preprocessamento.md), na coluna da direita: o LUT (ou nenhum), a intensidade e a
 *  vinheta, com a prévia mudando na hora; segurar "Ver sem o look" mostra o vídeo como foi gravado, para comparar. */
export default function PainelLook(p: {
  look: Look | null
  mudar: (c: Partial<Look>) => void
  ver: (c: Partial<Look>) => void
  comparar: (sem: boolean) => void
}) {
  const cat = useCatalogoLook()
  const l = p.look
  // a intensidade: a prévia e o número mudam a cada passo do slider; o servidor recebe quando ele para (arraste ou teclado)
  const salvar = useRef(0)
  const mudarIntensidade = (k: number) => {
    p.ver({ intensidade: k })
    window.clearTimeout(salvar.current)
    salvar.current = window.setTimeout(() => p.mudar({ intensidade: k }), 400)
  }
  return (
    <section className="grid content-start gap-5 rounded-[8px] bg-cream/[0.03] p-4 ring-1 ring-line-dark">
        <div className="grid gap-1">
          <p className="eyebrow text-sage">Look do ator</p>
          <p className="text-[12px] leading-[1.6] text-fog">Vale para o vídeo inteiro, só no ator (os inserts e os motions ficam como são). A prévia mostra igual ao MP4.</p>
        </div>
        {!l || !cat ? (
          <p className="text-[12px] text-fog">Carregando…</p>
        ) : (
          <>
            <div className="grid gap-2">
              <span className="text-[11px] text-fog">LUT</span>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: null, nome: 'Sem LUT' }, ...cat.luts].map((x) => (
                  <button
                    key={x.id ?? 'sem'}
                    onClick={() => p.mudar({ lut: x.id })}
                    className={cn('rounded-[6px] px-3 py-2.5 text-left text-[12.5px] font-semibold ring-1', l.lut === x.id ? 'bg-cream text-ink ring-cream' : 'text-fog ring-line-dark hover:text-cream')}
                  >
                    {x.nome}
                    {x.id === cat.padrao.lut && <span className="ml-1.5 text-[10.5px] font-normal opacity-60">padrão</span>}
                  </button>
                ))}
              </div>
            </div>
            <label className={cn('grid gap-1.5', !l.lut && 'opacity-40')}>
              <span className="flex text-[11px] text-fog">
                Intensidade <b className="ml-auto font-semibold text-cream tabular-nums">{Math.round(l.intensidade * 100)}%</b>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={!l.lut}
                value={Math.round(l.intensidade * 100)}
                onChange={(e) => mudarIntensidade(Number(e.target.value) / 100)}
                className="accent-coral"
              />
            </label>
            <div className="grid gap-1.5">
              <span className="text-[11px] text-fog">Vinheta (bordas escurecidas)</span>
              <div className="flex rounded-full p-0.5 ring-1 ring-line-dark">
                {(Object.keys(NOME_VINHETA) as Look['vinheta'][]).map((v) => (
                  <button
                    key={v}
                    onClick={() => p.mudar({ vinheta: v })}
                    className={cn('flex-1 rounded-full py-1 text-[11.5px] font-semibold', l.vinheta === v ? 'bg-cream text-ink' : 'text-fog hover:text-cream')}
                  >
                    {NOME_VINHETA[v]}
                  </button>
                ))}
              </div>
            </div>
            <button
              onPointerDown={() => p.comparar(true)}
              onPointerUp={() => p.comparar(false)}
              onPointerLeave={() => p.comparar(false)}
              className="flex w-fit items-center gap-1.5 rounded-full border border-line-dark px-3 py-1.5 text-[11.5px] font-semibold text-fog select-none hover:text-cream"
            >
              <Eye className="size-3.5" /> Segure para ver sem o look
            </button>
          </>
        )}
    </section>
  )
}
