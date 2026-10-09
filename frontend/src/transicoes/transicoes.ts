import { createContext, useCallback, useEffect, useState } from 'react'
import { enviar, json } from '@/api'
import { criarLoja } from '@/editor/loja'
import { eventoNoTempo, type Catalogo, type EventoSom, type Intensidade } from '@/editor/sons'

/** As transições entre planos (SPEC §8.8; docs/transicoes.md): a biblioteca, os pares, as escolhas do projeto e o efeito
 *  no tempo. A curva do efeito é a mesma da exportação (`transicoes.py`), então a prévia sai igual ao MP4. */
export type Efeito = { tipo: 'seco' | 'luz' | 'brilho' | 'zoom'; antes: number; depois: number; forca: number }
export type Transicao = {
  id: string
  nome: string
  descricao: string
  efeito: Efeito
  som: { som: string; intensidade: Intensidade; atraso: number } | null
  fontes: { ref: string; t: number }[]
  aprovado: boolean
}
export type Par = { n: number; classes: Record<string, number>; sons: Record<string, number>; cortes: { ref: string; t: number; classe: string; sons: string[] }[] }
export type Biblioteca = { transicoes: Transicao[]; pares: Record<string, Par>; ordem: Record<string, { ids: string[]; favoritas: number }> }

const loja = criarLoja(() => fetch('/api/transicoes').then(json<Biblioteca>))
export const useBiblioteca = loja.use
export const recarregarBiblioteca = loja.recarregar

export async function editarTransicao(id: string, campos: Partial<Pick<Transicao, 'aprovado' | 'nome' | 'som'>>) {
  const t = await enviar<Transicao>('PATCH', `/api/transicoes/${id}`, { campos })
  const b = loja.get()
  if (b) loja.definir({ ...b, transicoes: b.transicoes.map((x) => (x.id === id ? t : x)) })
  return t
}
export async function definirOrdem(par: string, ids: string[], favoritas: number) {
  const b = loja.get()
  if (b) loja.definir({ ...b, ordem: { ...b.ordem, [par]: { ids, favoritas } } })
  const o = await enviar<Biblioteca['ordem']>('PUT', `/api/transicoes/ordem/${encodeURIComponent(par)}`, { campos: { ids, favoritas } })
  const b2 = loja.get()
  if (b2) loja.definir({ ...b2, ordem: o })
}

/** A família de uma categoria de plano (para os pares que nunca apareceram nas referências; igual a `transicoes.py`). */
export const familia = (c: string) => (c.includes('motion') ? 'motion' : c.startsWith('full_ator') || c === 'comentario_insert_ator' ? 'ator' : 'insert')
export const chavePar = (de: string, para: string) => `${de}>${para}`
/** A ordem que vale para um par: a dele, ou a da família. */
export const ordemDoPar = (b: Biblioteca, de: string, para: string) => b.ordem[chavePar(de, para)] ?? b.ordem[`familia:${familia(de)}>${familia(para)}`]
/** A transição que um corte recebe sozinho: a 1ª favorita do par (ou da família); sem nada, o corte seco. */
export function padraoDoPar(b: Biblioteca, de: string, para: string): string {
  const o = ordemDoPar(b, de, para)
  const id = o && o.favoritas > 0 ? o.ids[0] : null
  return id && b.transicoes.some((t) => t.id === id) ? id : 'corte-seco'
}

/** Uma transição trocada à mão: a transição e o par do corte quando ela foi escolhida. Os ids dos planos são de posição
 *  (`p5`): com outra direção, `p5` pode ser outro corte, e a escolha só vale se o par ainda bater (as antigas, sem par,
 *  valem sempre). */
export type Escolha = { id: string; par?: string }
export type Escolhas = Record<string, Escolha>

/** As escolhas do projeto (o plano que entra → a transição) e como trocar uma (null volta ao padrão do par). */
export function useEscolhas(projetoId: string): [Escolhas, (plano: string, tid: string | null, par: string) => void] {
  const [e, setE] = useState<Escolhas>({})
  useEffect(() => {
    void fetch(`/api/projetos/${projetoId}/transicoes`)
      .then(json<Escolhas>)
      .then(setE)
      .catch(() => {})
  }, [projetoId])
  const mudar = useCallback(
    (plano: string, tid: string | null, par: string) => {
      setE((x) => {
        const n = { ...x }
        if (tid) n[plano] = { id: tid, par }
        else delete n[plano]
        return n
      })
      void enviar<Escolhas>('PUT', `/api/projetos/${projetoId}/transicoes`, { campos: { [plano]: tid ? { id: tid, par } : null } })
        .then(setE)
        .catch((x) => window.alert((x as Error).message))
    },
    [projetoId],
  )
  return [e, mudar]
}

/** Um corte entre planos do vídeo, com a transição que vale nele. */
export type CorteDoVideo = { t: number; plano: string; de: string; para: string; transicao: Transicao | null; manual: boolean }

/** Os cortes entre planos do vídeo final (os planos da direção já no tempo da saída) e a transição de cada um. */
export function cortesDoVideo(planos: { id: string; tipo: string; inicio: number; fim: number }[], b: Biblioteca | null, escolhas: Escolhas): CorteDoVideo[] {
  if (!b) return []
  const ps = [...planos].sort((x, y) => x.inicio - y.inicio)
  const out: CorteDoVideo[] = []
  for (let k = 1; k < ps.length; k++) {
    const a = ps[k - 1]
    const p = ps[k]
    // a escolha à mão vale se foi feita neste par (a direção pode ter mudado e posto outro corte com este id)
    const e = escolhas[p.id]
    const manual = !!e && (!e.par || e.par === chavePar(a.tipo, p.tipo))
    const id = manual ? e.id : padraoDoPar(b, a.tipo, p.tipo)
    out.push({ t: p.inicio, plano: p.id, de: a.tipo, para: p.tipo, transicao: b.transicoes.find((x) => x.id === id) ?? null, manual })
  }
  return out
}

const suave = (u: number) => {
  const x = Math.min(Math.max(u, 0), 1)
  return x * x * (3 - 2 * x)
}
/** O envelope de um efeito em volta do corte (igual a `transicoes._janela`): sobe até o corte e desce depois. */
export function envelope(e: Efeito, tCorte: number, t: number): number {
  if (t < tCorte) return e.antes > 0 ? suave((t - (tCorte - e.antes)) / e.antes) : 0
  return e.depois > 0 ? 1 - suave((t - tCorte) / e.depois) : 0
}

/** O que as transições fazem no instante `t`: a escala e o desfoque (0–1) do zoom, o branco do brilho e a luz (o
 *  instante dentro do vídeo dela). */
export type EfeitoNoTempo = { escala: number; desfoque: number; branco: number; luz: number | null }
export const LUZ = { src: '/api/transicoes/efeitos/luz.webm', duracao: 0.433 } // o vídeo da luz (540×960, 30 fps, ampliado no MP4)
export function efeitoNoTempo(cortes: CorteDoVideo[], t: number): EfeitoNoTempo {
  const r: EfeitoNoTempo = { escala: 1, desfoque: 0, branco: 0, luz: null }
  for (const c of cortes) {
    const e = c.transicao?.efeito
    if (!e || e.tipo === 'seco' || t < c.t - e.antes - 0.01 || t > c.t + Math.max(e.depois, e.tipo === 'luz' ? LUZ.duracao : 0) + 0.01) continue
    const k = envelope(e, c.t, t)
    if (e.tipo === 'zoom') {
      r.escala += 0.22 * e.forca * k
      r.desfoque = Math.max(r.desfoque, Math.min(e.forca * k, 1))
    } else if (e.tipo === 'brilho') r.branco = Math.max(r.branco, 0.85 * e.forca * k)
    else if (e.tipo === 'luz') {
      const rel = t - (c.t - e.antes)
      if (rel >= 0 && rel <= LUZ.duracao) r.luz = rel
    }
  }
  return r
}

/** Os sons das transições do vídeo (o golpe no corte + atraso), para tocar e para a exportação (grupo "transicoes"). */
export function sonsDasTransicoes(cortes: CorteDoVideo[], cat: Catalogo | null): (EventoSom & { grupo: 'transicoes' })[] {
  if (!cat) return []
  return cortes.flatMap((c) => {
    const s = c.transicao?.som
    const e = s ? eventoNoTempo(s, c.t, cat) : null
    return e ? [{ ...e, grupo: 'transicoes' as const }] : []
  })
}

/** Os cortes do vídeo aberto no editor, para o player desenhar as transições (null: sem transições). */
export const TransicoesDoVideo = createContext<CorteDoVideo[] | null>(null)
