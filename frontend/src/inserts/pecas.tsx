import { Check, UserRound } from 'lucide-react'
import type { ItemRef } from '@/api'
import { MOVIMENTOS, ehFullAtor, type Movimento } from '@/ator/movimento'
import { cn } from '@/lib/utils'
import { CATEGORIAS } from '@/direcao/EtapaDirecao'
import EditorPreset from '@/presets/EditorPreset'
import { usePresets } from '@/presets/presets'
import { FUNDOS } from '@/inserts/Fundo'
import { NOME_TIPO, TEM_MOTION } from '@/inserts/comum'
import { Campo, Recolhivel } from '@/inserts/layout'

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
      <p>
        Este plano não tem insert
        {TEM_MOTION.includes(plano.tipo) ? ' (é um motion: veja a aba Motion)' : ehFullAtor(plano.tipo) ? ': o preset do ator (zoom) fica no Enriquecimento, à direita' : ''}.
      </p>
    </div>
  )
}

/** Os presets do Full ator (pedido de Rodrigo, out/2026): o movimento de câmera no ator durante o plano. Cada cartão
 *  mostra o movimento num boneco animado; no player, o próprio plano. */
export function PresetsDoAtor(p: { atual: Movimento | null; mudar: (m: Movimento | null) => void }) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="eyebrow text-sage">Presets do Full ator</p>
        <p className="text-[11.5px] leading-[1.6] text-fog">O movimento de câmera no ator durante este plano. O centro do zoom é o rosto.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MOVIMENTOS.map((m) => {
          const ativo = (p.atual ?? null) === m.id
          return (
            <button
              key={m.id ?? 'nada'}
              onClick={() => p.mudar(m.id)}
              title={m.descricao}
              className={cn('grid gap-2 rounded-[8px] p-1.5 text-left ring-1', ativo ? 'bg-cream/[0.07] ring-2 ring-cream' : 'ring-line-dark hover:ring-cream/40')}
            >
              <span className="relative grid aspect-[9/16] place-items-center overflow-hidden rounded-[5px] bg-gradient-to-b from-[#2a3b36] to-[#14201d]">
                <UserRound
                  className={cn('size-1/2 text-cream/70', m.id === 'zoom_lento' && 'animate-[zoomLento_3s_ease-in-out_infinite]', m.id === 'zoom_seco' && 'animate-[zoomSeco_2.4s_steps(1,end)_infinite]')}
                  style={{ transformOrigin: '50% 40%' }}
                />
              </span>
              <span className="flex items-center gap-1 px-0.5 text-[11.5px] font-semibold">
                <span className="min-w-0 flex-1 truncate">{m.nome}</span>
                {ativo && <Check className="size-3.5 shrink-0 text-mint" />}
              </span>
              <span className="px-0.5 pb-0.5 text-[10.5px] leading-[1.45] text-fog">{m.descricao}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A categoria do plano, trocável aqui mesmo (a direção muda; a sugestão da IA fica marcada). */
export function Categoria(p: { atual: string; sugestao: string | null; mudar: (tipo: string) => void }) {
  return (
    <div className="grid gap-1.5">
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

/** O chip da categoria do plano, na cor do tipo (insert em tela cheia, tela dividida, motion, ator). */
function ChipCategoria({ tipo }: { tipo: string }) {
  const cor = TEM_MOTION.includes(tipo) ? 'bg-yellow text-ink' : tipo === 'insert_tela_cheia' ? 'bg-blue text-cream' : tipo.includes('insert') ? 'bg-mint text-ink' : 'bg-cream/10 text-cream'
  return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', cor)}>{NOME_TIPO[tipo] ?? CATEGORIAS.planos[tipo] ?? tipo}</span>
}

/** A sugestão da IA de um plano (a fala e o que a direção pede), num toggle fechado por padrão (lembrado aberto), com o
 *  chip da categoria na barra: igual nos inserts, nos motions e nos planos sem insert. */
export function SugestaoIA(p: { tipo: string; fala: string; descricao?: string | null; rotulo?: string }) {
  return (
    <Recolhivel chave="sugestao" titulo="Sugestão da IA" fechado resumo={<ChipCategoria tipo={p.tipo} />}>
      <div className="grid gap-3">
        <p className="border-l-2 border-line-dark pl-3 text-[12.5px] leading-[1.6] text-cream/90">“{p.fala}”</p>
        {p.descricao ? (
          <Campo rotulo={p.rotulo ?? 'O que acontece no insert'}>{p.descricao}</Campo>
        ) : (
          <p className="text-[11.5px] text-fog">A direção não descreveu este plano.</p>
        )}
      </div>
    </Recolhivel>
  )
}
