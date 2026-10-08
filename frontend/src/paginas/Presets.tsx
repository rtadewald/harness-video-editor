import { useState } from 'react'
import { Star } from 'lucide-react'
import { Logo } from '@/components/Marca'
import NavHome from '@/components/NavHome'
import { cn } from '@/lib/utils'
import { nMidias, recarregarOrdem, recarregarPresets, usePresets, type Preset } from '@/editor/presets'
import CardPreset from '@/presets/CardPreset'
import OrdemPresets from '@/presets/OrdemPresets'
import { useMidiasSim } from '@/presets/useMidiasSim'

/** A revisão dos presets (SPEC §8.4): cada um numa miniatura com o trecho de referência de onde veio e a recriação lado
 *  a lado (a recriação segue o relógio do próprio vídeo de referência, então os dois andam juntos), o editor e
 *  aprovar/descartar. Só os aprovados aparecem no Enriquecimento. Os presets são feitos pelo Claude, a partir de trechos
 *  que o criador manda. */
export default function Presets() {
  const presets = usePresets()
  const midiasSim = useMidiasSim()
  const [filtro, setFiltro] = useState<'pendentes' | 'aprovados' | 'todos'>('todos')
  const [qtd, setQtd] = useState<'todas' | '1' | '2' | '3+'>('todas') // quantas mídias o preset pede
  const [aberto, setAberto] = useState<string | null>(null)
  const [tocando, setTocando] = useState<string | null>(null) // um por vez
  const [ordenando, setOrdenando] = useState(false)

  const passa = (f: typeof filtro, p: Preset) => (f === 'todos' ? true : f === 'aprovados' ? p.aprovado : !p.aprovado)
  // os que faltam revisar primeiro (a ordem fica a mesma dentro de cada grupo)
  const temQtd = (q: typeof qtd, p: Preset) =>
    q === 'todas' || (p.receita.repete ? q !== '1' : q === '3+' ? nMidias(p.receita) >= 3 : nMidias(p.receita) === Number(q))
  const lista = (presets ?? []).filter((p) => passa(filtro, p) && temQtd(qtd, p)).sort((a, b) => Number(a.aprovado) - Number(b.aprovado))

  return (
    <div className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      <nav className="flex flex-wrap items-center gap-2 border-b border-line-dark px-6 py-3 text-[12px]">
        {(['todos', 'pendentes', 'aprovados'] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)} className={cn('h-8 rounded-full border px-3.5 font-semibold', filtro === f ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:text-cream')}>
            {f === 'todos' ? 'Todos' : f === 'pendentes' ? 'A revisar' : 'Aprovados'}{' '}
            <span className="opacity-60">{(presets ?? []).filter((p) => passa(f, p) && temQtd(qtd, p)).length}</span>
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-line-dark" />
        {(['todas', '1', '2', '3+'] as const).map((q) => (
          <button key={q} onClick={() => setQtd(q)} className={cn('h-8 rounded-full border px-3.5 font-semibold', qtd === q ? 'border-cream bg-cream text-ink' : 'border-line-dark text-fog hover:text-cream')}>
            {q === 'todas' ? 'Qualquer nº de mídias' : q === '1' ? '1 mídia' : q === '2' ? '2 mídias' : '3 ou mais'}{' '}
            <span className="opacity-60">{(presets ?? []).filter((p) => passa(filtro, p) && temQtd(q, p)).length}</span>
          </button>
        ))}
        <button
          onClick={() => {
            void recarregarOrdem()
            setOrdenando(true)
          }}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-full border border-line-dark px-3.5 font-semibold text-fog hover:text-cream"
          title="Os 3 presets favoritos de cada situação, que ficam em cima no Enriquecimento"
        >
          <Star className="size-3.5" /> Recomendados
        </button>
      </nav>
      {ordenando && presets && <OrdemPresets presets={presets} fechar={() => setOrdenando(false)} />}
      <main className="overflow-y-auto px-6 py-6">
        {presets && !presets.length && <p className="text-[13px] text-fog">Nenhum preset ainda. Mande ao Claude o trecho de uma referência (ou um print) e ele monta o preset.</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-x-6 gap-y-8">
          {lista.map((p) => (
            <CardPreset
              midiasSim={midiasSim}
              key={p.id}
              p={p}
              aberto={aberto === p.id}
              abrir={() => {
                if (aberto !== p.id) void recarregarPresets() // abre com o preset como está no servidor agora
                setAberto(aberto === p.id ? null : p.id)
              }}
              tocando={tocando === p.id}
              tocar={(sim) => setTocando(sim ? p.id : null)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
