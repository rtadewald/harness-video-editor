import type { ItemRef } from '@/api'
import { cn } from '@/lib/utils'
import { CATEGORIAS } from '../EtapaDirecao'
import EditorPreset from '../EditorPreset'
import { usePresets } from '../presets'
import { FUNDOS } from '../Fundo'
import { TEM_MOTION } from './comum'
import { Recolhivel } from './layout'

/** O editor do preset com a engrenagem aberta, na coluna ao lado do vídeo. Assina os presets sozinho: mexer num slider
 *  redesenha só ele (e quem mostra o preset), não a etapa inteira. */
export function EditorPresetAberto({ id, ver }: { id: string; ver?: () => void }) {
  const preset = usePresets()?.find((x) => x.id === id)
  if (!preset) return null
  return (
    <Recolhivel chave="preset" titulo="Preset">
      <EditorPreset preset={preset} ver={ver} />
    </Recolhivel>
  )
}

export function ResumoFundo({ id, so }: { id: string; so?: boolean }) {
  const f = FUNDOS.find((x) => x.id === id) ?? FUNDOS[4]
  return (
    <>
      <span className={cn('shrink-0 rounded-[3px] ring-1 ring-white/15', so ? 'h-4 w-4 rounded-full' : 'h-3.5 w-5')} style={{ background: f.amostra }} />
      {!so && <span className="truncate text-[11.5px] text-fog">{f.nome}</span>}
    </>
  )
}

/** O fundo atrás dos inserts com moldura, para o vídeo todo. */
export function EscolhaFundo({ atual, escolher }: { atual: string; escolher: (f: string) => void }) {
  return (
    <div className="grid gap-2">
      <p className="text-[11px] leading-[1.5] text-fog">Vale para o vídeo todo, atrás dos inserts com moldura.</p>
      {[true, false].map((claro) => (
        <div key={String(claro)} className="grid grid-cols-3 gap-1.5">
          {FUNDOS.filter((x) => x.claro === claro).map((x) => (
            <button
              key={x.id}
              onClick={() => escolher(x.id)}
              className={cn('grid gap-1 rounded-[6px] p-1.5 text-[10px] ring-1 transition-colors', atual === x.id ? 'text-cream ring-2 ring-coral' : 'text-fog ring-line-dark hover:text-cream')}
            >
              <span className="h-9 w-full rounded-[4px] ring-1 ring-white/10" style={{ background: x.amostra }} />
              {x.nome}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export function SemInsert({ plano }: { plano: ItemRef & { fala: string } }) {
  return (
    <div className="grid gap-3 text-[12.5px] leading-[1.7] text-fog">
      <span className="w-fit rounded-full bg-cream/10 px-2.5 py-1 text-[11px] font-semibold text-cream">{CATEGORIAS.planos[plano.tipo]}</span>
      <p>Este plano não tem insert{TEM_MOTION.includes(plano.tipo) ? ' (é um motion: veja a aba Motion)' : ''}.</p>
    </div>
  )
}

/** A categoria do plano, trocável aqui mesmo (a direção muda; a sugestão da IA fica marcada). */
export function Categoria(p: { atual: string; sugestao: string | null; mudar: (tipo: string) => void }) {
  return (
    <div className="mb-4 grid gap-1.5 border-b border-line-dark pb-4">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="eyebrow text-sage">Categoria</span>
        {p.sugestao && p.sugestao !== p.atual && (
          <button onClick={() => p.mudar(p.sugestao!)} className="ml-auto text-fog hover:text-cream" title="Voltar ao que a direção sugeriu">
            Sugestão: <span className="text-cream">{CATEGORIAS.planos[p.sugestao] ?? p.sugestao}</span> ↺
          </button>
        )}
      </div>
      <select
        value={p.atual}
        onChange={(e) => p.mudar(e.target.value)}
        className="h-8 rounded-[6px] border border-line-dark bg-deeper px-2 text-[12.5px] text-cream outline-none focus:border-cream/50"
      >
        {Object.entries(CATEGORIAS.planos).map(([id, nome]) => (
          <option key={id} value={id}>
            {nome}
            {id === p.sugestao ? ' · sugestão' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
