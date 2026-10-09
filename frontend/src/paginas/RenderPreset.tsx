import { useEffect, useState } from 'react'
import CenaPreset from '@/presets/CenaPreset'
import type { Receita } from '@/presets/presets'

type Pedido = { receita: Receita; dur: number; midias: string[]; fundo?: string }
type Janela = Window & { __preset?: Pedido; __ir?: (t: number) => Promise<void> }

/** Uma receita de preset desenhada num instante qualquer, no quadro 9:16 inteiro (tela dividida: na metade de cima).
 *  Ferramenta do Claude para montar presets à mão: o script injeta `window.__preset` (a receita, a duração e as mídias)
 *  e chama `window.__ir(t)` antes de fotografar cada quadro, para comparar com a referência. */
export default function RenderPreset() {
  const w = window as Janela
  const [pedido] = useState(() => w.__preset ?? null)
  const [t, setT] = useState(0)
  useEffect(() => {
    w.__ir = (x: number) =>
      new Promise((ok) => {
        setT(x)
        requestAnimationFrame(() => requestAnimationFrame(() => ok()))
      })
  }, [w])
  if (!pedido) return <p className="p-4 text-cream">Sem receita (window.__preset).</p>
  const dividida = pedido.receita.formato === 'dividida'
  return (
    <div className="relative h-[960px] w-[540px] overflow-hidden bg-[#3a3f3a]">
      <CenaPreset
        receita={pedido.receita}
        rel={t}
        dur={pedido.dur}
        fundo={pedido.fundo ?? 'gradiente'}
        className={dividida ? 'inset-x-0 top-0 h-1/2' : 'inset-0'}
        midia={(k, _rel, topo) => <img src={pedido.midias[k]} alt="" className={topo ? 'size-full object-cover object-top' : 'size-full object-cover'} />}
      />
    </div>
  )
}
