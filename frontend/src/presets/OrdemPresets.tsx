import { useState } from 'react'
import { Star } from 'lucide-react'
import { urlAmostraPreset } from '@/api'
import Modal from '@/components/Modal'
import { cn } from '@/lib/utils'
import Simulacao, { TELAS, type Sim } from '@/presets/Simulacao'
import { comRecomendados, definirOrdem, N_RECOMENDADOS, PROPORCOES_USO, serve, situacao, type ProporcaoSituacao, useOrdem, usosDe, type Preset } from '@/presets/presets'
import { chip, versao } from './comum'

/** Uma imagem vazia para o arrastar do navegador (sem o fantasma do card). */
const SEM_IMAGEM = (() => {
  if (typeof Image === 'undefined') return null as unknown as HTMLImageElement
  const i = new Image()
  i.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  return i
})()

/** A ordem dos presets em cada situação (o modo de tela e o número de mídias), numa grade: arrastar reordena; a estrela
 *  favorita (até 3), e os favoritos ficam sempre no começo: são os Recomendados, em cima, no Enriquecimento do insert.
 *  Só os aprovados que valem na situação; a prévia toca ao passar o mouse. Sem ordem, o insert mostra uma lista só. */
export default function OrdemPresets({ presets, fechar }: { presets: Preset[]; fechar: () => void }) {
  const ordem = useOrdem()
  // as situações: com 1 mídia, separadas pela proporção (9:16 ou horizontal); com várias, só pelo número
  type Sit = { tela: Sim['tela']; n: number; prop?: ProporcaoSituacao }
  const VARIANTES: Omit<Sit, 'tela'>[] = [{ n: 1, prop: 'pe' }, { n: 1, prop: 'deitada' }, { n: 2 }, { n: 3 }]
  const [sit, setSit] = useState<Sit>({ tela: 'vertical', n: 1, prop: 'pe' })
  const [sobre, setSobre] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const valem = (s: Sit) => presets.filter((p) => p.aprovado && serve(p, '', s.n, s.tela, s.prop ? [s.prop === 'pe' ? 9 / 16 : 16 / 9] : undefined))
  const chave = situacao(sit.tela, sit.n, sit.prop)
  const chaveDe = (s: Sit) => situacao(s.tela, s.n, s.prop)
  const { recomendados, outros } = comRecomendados(valem(sit), ordem?.[chave])
  const lista = [...recomendados, ...outros]
  const nFav = recomendados.length
  const salvar = (ids: string[], favoritos: number) => void definirOrdem(chave, { ids, favoritos }).catch((x) => window.alert((x as Error).message))
  // a estrela: favoritar põe no fim dos favoritos; desfavoritar, logo depois deles
  const favoritar = (id: string) => {
    const ids = lista.map((p) => p.id).filter((x) => x !== id)
    const fav = recomendados.some((p) => p.id === id)
    ids.splice(fav ? nFav - 1 : nFav, 0, id)
    salvar(ids, nFav + (fav ? -1 : 1))
  }
  // arrastar: a grade já mostra onde vai cair (o card arrastado fica no lugar novo, tracejado, e os outros abrem espaço);
  // o que cai entre os favoritos vira favorito (o número de favoritos fica o mesmo; o último sai)
  const [alvo, setAlvo] = useState<string | null>(null)
  const exibida = (() => {
    if (!arrastando || !alvo || alvo === arrastando) return lista
    const sem = lista.filter((p) => p.id !== arrastando)
    sem.splice(lista.findIndex((p) => p.id === alvo), 0, lista.find((p) => p.id === arrastando)!) // vindo de antes, depois do alvo; de depois, antes
    return sem
  })()
  const parar = () => {
    setArrastando(null)
    setAlvo(null)
  }
  const soltar = () => {
    if (arrastando && alvo && alvo !== arrastando) salvar(exibida.map((p) => p.id), nFav)
    parar()
  }
  const nomeN = (s: Omit<Sit, 'tela'>) => (s.n === 1 ? (s.prop === 'pe' ? '1 mídia 9:16' : '1 mídia horizontal') : s.n === 2 ? '2 mídias' : '3 ou mais')
  return (
    <Modal titulo="Recomendados por situação" fechar={fechar} tamanho="cheia">
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] gap-5">
        <div className="grid content-start gap-4">
          <p className="text-[12px] leading-[1.6] text-fog">
            Arraste para ordenar. A <Star className="inline size-3 fill-yellow text-yellow" /> favorita até {N_RECOMENDADOS}: ficam no começo e em <b className="text-cream">Recomendados</b>, em cima, no Enriquecimento do insert.
          </p>
          {TELAS.map((t) => (
            <div key={t.id} className="grid gap-1.5">
              <p className="eyebrow text-sage">{t.nome}</p>
              <div className="flex flex-wrap gap-1.5">
                {VARIANTES.map((v) => {
                  const s = { ...v, tela: t.id }
                  const nf = ordem?.[situacao(t.id, v.n, v.prop)]?.favoritos ?? 0
                  return (
                    <button key={`${v.n}${v.prop ?? ''}`} onClick={() => setSit(s)} className={chip(chaveDe(sit) === chaveDe(s))}>
                      {nomeN(v)} <span className="opacity-60">{valem(s).length}</span>
                      {nf > 0 && <span className="ml-1 text-yellow">★{nf}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="grid min-h-0 content-start gap-2.5 overflow-y-auto p-1">
          <p className="flex items-center gap-3 text-[13px] font-semibold">
            {TELAS.find((t) => t.id === sit.tela)?.nome} · {nomeN(sit)}
            <span className="font-normal text-fog">
              {nFav}/{N_RECOMENDADOS} favoritos
            </span>
            {ordem?.[chave] && (
              <button onClick={() => salvar([], 0)} className="ml-auto text-[11.5px] font-normal text-fog hover:text-cream" title="Volta a uma lista só, sem recomendados">
                Limpar a ordem
              </button>
            )}
          </p>
          {!lista.length && <p className="text-[12px] text-fog">Nenhum preset aprovado vale nesta situação (veja o “Vale em” de cada um).</p>}
          <div className="grid grid-cols-6 gap-3" onDragOver={(e) => e.preventDefault()} onDrop={soltar}>
            {exibida.map((p, i) => {
              const fav = i < nFav
              const cheio = !fav && nFav >= N_RECOMENDADOS
              const props = usosDe(p).proporcoes
              return (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', p.id)
                    e.dataTransfer.setDragImage(SEM_IMAGEM, 0, 0) // sem o fantasma voando: o card já aparece onde vai cair
                    setArrastando(p.id)
                  }}
                  onDragEnd={parar}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (arrastando && p.id !== arrastando && alvo !== p.id) setAlvo(p.id)
                  }}
                  onMouseEnter={() => setSobre(p.id)}
                  onMouseLeave={() => setSobre(null)}
                  className={cn('grid cursor-grab gap-1.5 transition-opacity active:cursor-grabbing', arrastando === p.id && 'opacity-50')}
                >
                  <div
                    className={cn(
                      'relative overflow-hidden rounded-[6px]',
                      arrastando === p.id ? 'outline-2 outline-offset-2 outline-coral outline-dashed' : fav ? 'ring-2 ring-yellow/70' : 'ring-1 ring-line-dark',
                    )}
                  >
                    <Simulacao
                      preset={p}
                      sim={{ tela: sit.tela, n: sit.n, prop: sit.prop === 'pe' ? 'pe' : sit.prop === 'deitada' ? '16:9' : !props || props.includes('deitada') ? 'deitada' : 'pe' }}
                      tocando={sobre === p.id && !arrastando}
                      t={p.receita.duracao_ref * 0.7}
                      dur={p.receita.duracao_ref}
                      midia={(k) => urlAmostraPreset(p.id, k % Math.max(p.recortes?.length ?? 1, 1), versao(p, k % Math.max(p.recortes?.length ?? 1, 1)))}
                    />
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-ink/70 px-1.5 text-[10.5px] font-semibold text-fog tabular-nums">{i + 1}</span>
                    <button
                      onClick={() => favoritar(p.id)}
                      disabled={cheio}
                      className={cn(
                        'absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full transition-colors disabled:opacity-30',
                        fav ? 'bg-yellow/20 text-yellow' : 'bg-ink/70 text-fog hover:text-cream',
                      )}
                      title={fav ? 'Tirar dos recomendados' : cheio ? `Já há ${N_RECOMENDADOS} favoritos: tire um antes` : 'Favoritar (recomendado nesta situação)'}
                      aria-label="Favoritar"
                    >
                      <Star className={cn('size-3.5', fav && 'fill-yellow')} />
                    </button>
                  </div>
                  <div className="grid min-w-0">
                    <span className="truncate text-[12px] font-semibold">{p.nome}</span>
                    <span className="truncate text-[10.5px] text-fog">{(props ?? PROPORCOES_USO.map((x) => x.id)).map((x) => PROPORCOES_USO.find((y) => y.id === x)?.nome).join(' · ')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}
