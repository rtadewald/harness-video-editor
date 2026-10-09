import { useEffect, useMemo, useState } from 'react'
import { json, urlArquivo, type Projeto } from '@/api'
import type { Divisao } from './divisao'
import type { Sequencia } from './sequencia'

/** O ator nas áreas que sobram quando um insert divide a tela (SPEC §8.7; docs/rosto.md, a P5). Tudo vira uma
 *  **geometria**: o quadro do ator (do tamanho do vídeo) com o canto de cima à esquerda em (`tx`, `ty`) e a escala `s`,
 *  em frações do quadro. A mesma conta vale para a prévia (CSS) e para a exportação (a página de render manda a
 *  geometria junto da divisão; `exportacao._ator` só aplica os números).
 *  - **Tela dividida** (`metade`): o ator inteiro embaixo do insert, enquadrado pelo rosto do plano — o centro do rosto
 *    no meio da largura, os olhos a 40% da altura da área, o topo da cabeça com folga, ampliado até 1,6× se preciso
 *    (sempre cobrindo a área). Ajuste manual: deslocamento e zoom (`dx`, `dy`, `zoom`).
 *  - **"Ator embaixo"** (`atras`, o insert na tela toda), em três modos: a **janela** (o ator encolhido, recortado numa
 *    janela de cantos redondos, com a cabeça saindo por cima), **recortado** (só a pessoa, sem o cenário, pela máscara do
 *    recorte do ator) e **canto** (o ator inteiro encolhido num canto, cantos redondos). Centro e tamanho arrastáveis
 *    no vídeo (`x`, `y`, `escala`). */
export type ModoAtor = 'janela' | 'recortado' | 'canto'
export type AjusteAtor = { modo?: ModoAtor; x?: number; y?: number; escala?: number; dx?: number; dy?: number; zoom?: number }
export type Rosto = { cx: number; cy: number; w: number; h: number }
/** `topo`: na janela, onde ela começa dentro do quadro do ator (fração); `raio`: o raio dos cantos (fração da largura
 *  do quadro do ator encolhido). */
export type Geometria = { modo: 'metade' | ModoAtor; s: number; tx: number; ty: number; topo?: number; raio?: number }

export const NOME_MODO: Record<ModoAtor, string> = { janela: 'Janela', recortado: 'Recortado', canto: 'Canto' }
/** As posições de fábrica de cada modo (centro e tamanho, frações do quadro). A janela é a de antes da P5: o ator a 55%,
 *  apoiado embaixo, com a janela começando em 72% do quadro. */
export const PADRAO_MODO: Record<ModoAtor, { x: number; y: number; escala: number }> = {
  janela: { x: 0.5, y: 1 - 0.55 / 2, escala: 0.55 },
  recortado: { x: 0.5, y: 1 - 0.62 / 2, escala: 0.62 },
  canto: { x: 1 - 0.34 / 2 - 0.04, y: 1 - 0.34 / 2 - 0.035, escala: 0.34 },
}
const TOPO_JANELA = (0.72 - 0.45) / 0.55 // a janela começa a 49% do ator encolhido
const RAIO = 0.07
const REGRA = { olhos: 0.4, folga: 0.06, rosto: 0.3, zoomMax: 1.6 }
/** O zoom manual da tela dividida, um fator sobre o automático (igual em `inserts._LIMITES_ATOR`). */
export const ZOOM = { min: 1 / REGRA.zoomMax, max: REGRA.zoomMax }
const limite = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b)

/** O enquadramento automático da tela dividida: o ator cobre a área de baixo (de `f` a 1) e o rosto fica bem posto. */
export function enquadrar(f: number, r: Rosto | null): { s: number; tx: number; ty: number } {
  if (!r || r.h <= 0) return { s: 1, tx: 0, ty: f / 2 } // sem rosto medido: como antes (o ator desce metade do insert)
  const area = 1 - f
  const s = limite((REGRA.rosto * area) / r.h, 1, REGRA.zoomMax)
  const olhos = r.cy - 0.15 * r.h // os olhos, um pouco acima do centro da caixa do rosto
  const tx = limite(0.5 - s * r.cx, 1 - s, 0)
  let ty = f + REGRA.olhos * area - s * olhos
  ty = Math.max(ty, f + REGRA.folga * area - s * (r.cy - 0.6 * r.h)) // o topo da cabeça (com o cabelo) não encosta
  return { s, tx, ty: limite(ty, 1 - s, f) }
}

/** A tela dividida antes do deslocamento manual: a escala (o automático vezes o zoom, de 1 — cobrir a área — a 1,6×; o
 *  zoom pode ficar abaixo de 1 para voltar de um automático ampliado) e onde o canto do ator fica sem `dx`/`dy`. */
function metadeSemDeslocamento(d: Divisao, aj: AjusteAtor | null | undefined, rosto: Rosto | null) {
  const auto = enquadrar(d.f, rosto)
  const s = limite(auto.s * (aj?.zoom ?? 1), 1, REGRA.zoomMax)
  // o zoom manual cresce em volta do centro da área
  const cx = 0.5
  const cy = d.f + (1 - d.f) / 2
  return { auto, s, tx: cx - ((cx - auto.tx) * s) / auto.s, ty: cy - ((cy - auto.ty) * s) / auto.s }
}

/** A geometria do ator num insert dividido (`null`: o ator como foi gravado). */
export function geometriaDoAtor(d: Divisao | null, aj: AjusteAtor | null | undefined, rosto: Rosto | null): Geometria | null {
  if (!d) return null
  if (d.modo === 'metade') {
    const m = metadeSemDeslocamento(d, aj, rosto)
    return { modo: 'metade', s: m.s, tx: limite(m.tx + (aj?.dx ?? 0), 1 - m.s, 0), ty: limite(m.ty + (aj?.dy ?? 0), 1 - m.s, d.f) }
  }
  const modo = aj?.modo ?? 'janela'
  const p = PADRAO_MODO[modo]
  const s = aj?.escala ?? p.escala
  // sem posição escolhida, o rosto no meio da largura (na janela e no recortado); o canto fica no canto
  const xAuto = modo !== 'canto' && rosto ? limite(0.5 - s * (rosto.cx - 0.5), s / 2, 1 - s / 2) : p.x
  const x = aj?.x ?? xAuto
  const y = aj?.y ?? (modo === 'canto' ? p.y : 1 - s / 2)
  return { modo, s, tx: x - s / 2, ty: y - s / 2, topo: modo === 'janela' ? TOPO_JANELA : undefined, raio: modo === 'recortado' ? undefined : RAIO }
}

/** O ajuste da tela dividida como ele vale na tela: o zoom e o deslocamento que sobram depois dos limites (o ator sempre
 *  cobre a área). Guardado assim, um arraste além da borda não acumula um deslocamento invisível (que faria o ator pular
 *  depois de um zoom, ou parar de andar na volta). */
export function ajusteNaFolga(d: Divisao, aj: AjusteAtor, rosto: Rosto | null): AjusteAtor {
  if (d.modo !== 'metade') return aj
  const m = metadeSemDeslocamento(d, aj, rosto)
  const g = geometriaDoAtor(d, aj, rosto)!
  const r = (v: number) => Math.round(v * 1e4) / 1e4
  return {
    ...aj,
    ...(aj.zoom != null && { zoom: r(m.s / m.auto.s) }),
    ...(aj.dx != null && { dx: r(g.tx - m.tx) }),
    ...(aj.dy != null && { dy: r(g.ty - m.ty) }),
  }
}

/** Onde fica o alto da cabeça do ator no "ator embaixo" (fração do quadro): na janela e no recortado, a ~10% do topo do
 *  quadro do ator encolhido; no canto, o topo da caixa. O card do comentário e a legenda desviam por aqui. */
export const topoDoAtor = (g: Geometria) => g.ty + (g.modo === 'canto' ? 0 : 0.1 * g.s)

const transformacao = (g: Geometria): React.CSSProperties => ({
  transform: `translate(${g.tx * 100}%, ${g.ty * 100}%) scale(${g.s})`,
  transformOrigin: '0 0',
})
const cantos = (g: Geometria) => `round ${(g.raio ?? 0) * 100}% / ${((g.raio ?? 0) * 100 * 9) / 16}%`

/** O vídeo do ator (com o cenário) na geometria: o quadro inteiro na tela dividida e no canto; na janela, só a parte de
 *  baixo, com os cantos redondos. No recortado, nada (só a pessoa aparece). */
export function estiloDoQuadro(g: Geometria | null): React.CSSProperties | null {
  if (!g) return {}
  if (g.modo === 'recortado') return null
  if (g.modo === 'metade') return transformacao(g)
  if (g.modo === 'canto') return { ...transformacao(g), clipPath: `inset(0 ${cantos(g)})` }
  return { ...transformacao(g), clipPath: `inset(${(g.topo ?? 0) * 100}% 0 0 0 ${cantos(g)})` }
}

/** A pessoa recortada (sem o cenário): na janela, a cabeça e os ombros saindo por cima dela; no recortado, inteira. */
export function estiloDaPessoaNaGeometria(g: Geometria | null): React.CSSProperties | null {
  if (g?.modo === 'janela') return { ...transformacao(g), clipPath: `inset(0 0 ${(1 - (g.topo ?? 0)) * 100}% 0)` }
  if (g?.modo === 'recortado') return transformacao(g)
  return null
}

/** A caixa do ator no quadro (frações), para o contorno de arrastar. Na tela dividida, a área visível embaixo do insert. */
export function caixaDoAtor(g: Geometria, d: Divisao): { x: number; y: number; w: number; h: number } {
  if (g.modo === 'metade') return { x: 0, y: d.f, w: 1, h: 1 - d.f }
  const topo = g.modo === 'janela' ? (g.topo ?? 0) * 0.6 : 0 // na janela, a caixa começa um pouco acima dela (a cabeça)
  return { x: g.tx, y: g.ty + topo * g.s, w: g.s, h: g.s * (1 - topo) }
}

// ---------------------------------------------------------------- o rosto medido (rosto.py)

type Amostra = { t: number; cx: number; cy: number; w: number; h: number; conf: number }
type ArquivoRosto = { por_segundo: number; largura?: number; altura?: number; amostras: Amostra[] }
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : 0
}
export type RostoEm = (ini: number, fim: number) => Rosto | null

/** O rosto típico num trecho do vídeo final (a mediana das medidas, como `rosto.rosto_mediano`), lido uma vez de
 *  `midia/rosto/<bruto>.json`. Devolve a função (ini, fim no tempo da saída) → rosto; `null` sem medida (a medida não
 *  ficou pronta, o vídeo não tem rosto nenhum, ou o arquivo não carregou: o enquadramento de antes); `undefined`
 *  enquanto a medida pronta ainda está sendo lida (a página de render espera só isso).
 *  Num bruto horizontal (projeto de antes do enquadramento), a medida é do proxy 16:9 e a saída é o recorte 9:16 em
 *  `enquadramento.x`: o centro e a largura do rosto são levados para esse recorte. */
export function useRosto(projeto: Projeto | null | undefined, seq: Sequencia | null): RostoEm | null | undefined {
  const bruto = projeto?.fontes.find((f) => f.papel === 'bruto')
  const pronto = projeto?.rosto?.estado === 'pronto'
  const versao = projeto?.enquadramento?.versao
  const ex = projeto?.enquadramento?.x ?? 0.5
  const chave = projeto && bruto && pronto ? `${projeto.id}/${bruto.id}/${versao ?? ''}` : null
  // o arquivo lido e de qual medida ele é (outra chave: ainda carregando)
  const [lido, setLido] = useState<{ chave: string; arq: ArquivoRosto | null } | null>(null)
  useEffect(() => {
    if (!projeto || !bruto || !chave) return
    let vivo = true
    void fetch(urlArquivo(projeto.id, `midia/rosto/${bruto.id}.json`) + (versao ? `?v=${versao}` : ''))
      .then(json<ArquivoRosto>)
      .then((arq) => vivo && setLido({ chave, arq }))
      .catch(() => vivo && setLido({ chave, arq: null }))
    return () => {
      vivo = false
    }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  const arq = chave && lido?.chave === chave ? lido.arq : null
  const carregando = !!chave && lido?.chave !== chave
  const fn = useMemo((): RostoEm | null => {
    if (!arq?.amostras?.length || !seq) return null
    const a = arq.amostras
    // a medida num quadro deitado: o recorte 9:16 tem `rw` da largura e começa em (1 − rw)·ex
    const L = arq.largura ?? 0
    const A = arq.altura ?? 0
    const rw = L > A && A > 0 ? (A * 9) / 16 / L : 1
    const noRecorte = (r: Rosto): Rosto => (rw >= 1 ? r : { ...r, cx: (r.cx - (1 - rw) * ex) / rw, w: r.w / rw })
    return (ini: number, fim: number) => {
      const pts: Amostra[] = []
      for (let t = ini; t < fim; t += 0.2) {
        const tb = seq.saidaParaFonte(t)
        const i = limite(Math.round(tb * arq.por_segundo), 0, a.length - 1)
        // a amostra mais perto daquele instante (o arquivo tem uma a cada 1/por_segundo s, a partir do zero)
        const m = a[i] && Math.abs(a[i].t - tb) < 1 ? a[i] : a.reduce((x, y) => (Math.abs(y.t - tb) < Math.abs(x.t - tb) ? y : x))
        pts.push(m)
      }
      const boas = pts.filter((x) => x.conf > 0)
      const us = boas.length ? boas : pts
      if (!us.length) return null
      return noRecorte({ cx: mediana(us.map((x) => x.cx)), cy: mediana(us.map((x) => x.cy)), w: mediana(us.map((x) => x.w)), h: mediana(us.map((x) => x.h)) })
    }
  }, [arq, seq, ex])
  return carregando ? undefined : fn
}
