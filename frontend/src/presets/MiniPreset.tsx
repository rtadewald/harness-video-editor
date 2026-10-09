import { memo, useEffect, useState } from 'react'
import { urlBancoMiniatura } from '@/api'
import { cn } from '@/lib/utils'
import CenaPreset from '@/presets/CenaPreset'
import { janela, type Receita } from '@/presets/presets'

/** A miniatura de um preset no banco: parada no repouso e, com o mouse em cima, tocando em loop. As mídias são as
 *  miniaturas das do insert (ou `amostras`, na revisão). */
function MiniPreset(p: { receita: Receita; midias: string[]; amostras?: string[]; fundo: string; tocar?: boolean; className?: string }) {
  const r = p.receita
  const dur = Math.max(r.duracao_ref, 1.2)
  // o instante de repouso: depois da última entrada e antes da primeira saída
  const repouso = Math.min(
    Math.max(...r.cards.map((c) => janela(c, dur).ini + (c.entrada?.duracao ?? 0))) + 0.05,
    Math.min(...r.cards.map((c) => janela(c, dur).fim - (c.saida?.duracao ?? 0))) - 0.02,
  )
  const [t, setT] = useState(repouso)
  useEffect(() => {
    if (!p.tocar) return void setT(repouso)
    let id = 0
    const base = performance.now()
    const passo = (agora: number) => {
      setT(((agora - base) / 1000) % (dur + 0.5))
      id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [p.tocar, dur, repouso])
  return (
    <div className={cn('relative overflow-hidden bg-black', r.formato === 'vertical' ? 'aspect-[9/16]' : 'aspect-[9/8]', p.className)}>
      <CenaPreset
        receita={r}
        rel={Math.min(t, dur)}
        dur={dur}
        fundo={p.fundo}
        className="inset-0"
        midia={(k, _rel, topo) => {
          const src = p.amostras?.[k] ?? (p.midias[k] ? urlBancoMiniatura(p.midias[k]) : null)
          return src ? <img src={src} alt="" className={cn('size-full object-cover', topo && 'object-top')} /> : <div className="size-full bg-cream/20" />
        }}
      />
    </div>
  )
}

export default memo(MiniPreset)
