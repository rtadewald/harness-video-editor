import { Play, Trash2 } from 'lucide-react'
import { urlArquivoReferencia, type ItemRef } from '@/api'
import { cn } from '@/lib/utils'
import { COR_ELEMENTO, COR_PLANO } from './LinhaDirecao'

/** Peças da edição de direção (planos e elementos), usadas na revisão da Calibragem e na Direção visual do projeto. */

export const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`.replace('.', ',')

export function Botao({ onClick, titulo, desligado, children }: { onClick: () => void; titulo: string; desligado?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={titulo}
      disabled={desligado}
      className="flex h-7 items-center gap-1.5 rounded-full border border-line-dark px-2.5 text-fog hover:border-cream/50 hover:text-cream disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function Detalhe(p: {
  item: ItemRef
  /** Referência dona das miniaturas (só na Calibragem). */
  refId?: string
  /** Rótulo do campo de descrição (padrão: "Marcação", a anotação de roteiro do bloco). */
  rotuloDescricao?: string
  nomes: Record<string, string>
  fala: string
  editar: (c: Partial<ItemRef>) => void
  ver: () => void
  apagar: () => void
  unicoPlano: boolean
  elementos: ItemRef[]
  nomesElementos: Record<string, string>
  selecionar: (id: string) => void
}) {
  const i = p.item
  const cor = i.camada === 'plano' ? COR_PLANO[i.tipo] : COR_ELEMENTO[i.tipo]
  return (
    <div className="grid gap-4 text-[12px]">
      <div className="flex items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold', cor)}>{p.nomes[i.tipo]}</span>
        <span className="text-[10px] tracking-[0.1em] text-fog uppercase">{i.camada === 'plano' ? 'Plano-base' : 'Elemento'}</span>
      </div>
      <p className="tabular-nums">
        {fmt(i.inicio)} → {fmt(i.fim)} · <b>{(i.fim - i.inicio).toFixed(2).replace('.', ',')} s</b>
      </p>
      {i.miniatura && p.refId && <img src={urlArquivoReferencia(p.refId, i.miniatura)} alt="" className="max-h-[220px] w-auto self-start rounded-[4px]" />}
      {p.fala && <p className="border-l-2 border-line-dark pl-3 leading-[1.6] text-fog">“{p.fala}”</p>}
      {p.elementos.length > 0 && (
        <div className="grid gap-1.5">
          <span className="text-[10px] tracking-[0.1em] text-fog uppercase">Elementos neste plano</span>
          <div className="flex flex-wrap gap-1.5">
            {p.elementos.map((e) => (
              <button
                key={e.id}
                onClick={() => p.selecionar(e.id)}
                className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold hover:opacity-80', COR_ELEMENTO[e.tipo])}
                title={`${fmt(e.inicio)} → ${fmt(e.fim)}`}
              >
                {e.texto ? `“${e.texto}”` : p.nomesElementos[e.tipo]}
              </button>
            ))}
          </div>
        </div>
      )}

      <Campo rotulo="Tipo">
        <select value={i.tipo} onChange={(e) => p.editar({ tipo: e.target.value })} className="h-9 rounded-[3px] border border-line-dark bg-deeper px-2.5 text-cream outline-none focus:border-cream/60">
          {Object.entries(p.nomes).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </Campo>
      {(i.camada === 'elemento' || i.tipo === 'full_ator_lettering' || i.tipo === 'comentario_insert_ator') && (
        <Campo rotulo={i.tipo === 'comentario_insert_ator' ? 'Texto do comentário' : 'Texto exato'}>
          <input defaultValue={i.texto ?? ''} onBlur={(e) => e.target.value !== (i.texto ?? '') && p.editar({ texto: e.target.value })} className={CAMPO} />
        </Campo>
      )}
      <Campo rotulo={temInsert(i) ? 'Marcação · o que acontece no insert' : (p.rotuloDescricao ?? 'Marcação')}>
        <textarea defaultValue={i.descricao} rows={8} onBlur={(e) => e.target.value !== i.descricao && p.editar({ descricao: e.target.value })} className={cn(CAMPO, 'h-auto py-2')} />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <button onClick={p.ver} className="flex h-8 items-center gap-1.5 rounded-full border border-line-dark px-3 text-[11px] font-semibold hover:border-cream/50">
          <Play className="size-3 fill-current" /> Ver trecho
        </button>
        <button
          onClick={p.apagar}
          disabled={p.unicoPlano}
          className="flex h-8 items-center gap-1.5 rounded-full border border-line-dark px-3 text-[11px] font-semibold text-fog hover:border-coral hover:text-coral disabled:opacity-40"
          title={i.camada === 'plano' ? 'O plano some e o anterior (ou o seguinte) ocupa o lugar dele' : 'Tira o elemento'}
        >
          <Trash2 className="size-3" /> {i.camada === 'plano' ? 'Juntar com o vizinho' : 'Excluir'}
        </button>
      </div>
    </div>
  )
}

const temInsert = (i: ItemRef) => ['insert_tela_cheia', 'tela_dividida_insert', 'comentario_insert_ator'].includes(i.tipo)

const CAMPO = 'h-9 w-full rounded-[3px] border border-line-dark bg-deeper px-2.5 text-[12px] text-cream outline-none focus:border-cream/60'

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[10px] tracking-[0.1em] text-fog uppercase">{rotulo}</span>
      {children}
    </label>
  )
}

export function Ajuda({ planos, elementos, intro, rodape }: { planos: Record<string, string>; elementos: Record<string, string>; intro?: string; rodape?: string }) {
  return (
    <div className="grid gap-5 text-[12px] leading-[1.7] text-fog">
      <p>
        {intro ??
          'Confira o que a IA viu em cada trecho. Clique num bloco para editar tipo, marcação, texto e como gerar. Arraste a linha entre dois planos para mudar o momento da troca e as pontas de um elemento para ajustar a duração. O ímã gruda em palavras e nos cortes de cena detectados (linhas tracejadas); Alt desliga.'}
      </p>
      <div className="grid gap-1.5">
        <p className="text-[10px] tracking-[0.1em] uppercase">Planos-base</p>
        {Object.entries(planos).map(([k, n]) => (
          <span key={k} className={cn('w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold', COR_PLANO[k])}>
            {n}
          </span>
        ))}
      </div>
      <div className="grid gap-1.5">
        <p className="text-[10px] tracking-[0.1em] uppercase">Elementos</p>
        {Object.entries(elementos).map(([k, n]) => (
          <span key={k} className={cn('w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold', COR_ELEMENTO[k])}>
            {n}
          </span>
        ))}
      </div>
      <div className="grid gap-1 text-[11px]">
        <p className="text-[10px] tracking-[0.1em] uppercase">Atalhos</p>
        <p>
          <kbd>Espaço</kbd> tocar/pausar · <kbd>←</kbd> <kbd>→</kbd> 0,1 s (Shift: 1 s) · <kbd>S</kbd> dividir plano no cursor · <kbd>E</kbd> novo elemento ·{' '}
          <kbd>Delete</kbd> excluir · <kbd>⌘Z</kbd> desfazer
        </p>
      </div>
      <p className="text-[11px]">{rodape ?? 'Quando tudo estiver certo, “Marcar como revisada” põe este vídeo no dataset da Direção visual.'}</p>
    </div>
  )
}
