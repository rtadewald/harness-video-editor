import { useEffect, useMemo, useState, type RefObject } from 'react'
import { lerInserts, listarBanco, mapaBanco, urlArquivo, type InsertsProjeto, type ItemBanco, type ItemRef, type Projeto } from '@/api'
import { falaDoPlano, fundoDoMotion, urlPaginaMotionPlano, type MotionPlano } from '@/motions/api'
import MotionNoLugar from '@/motions/MotionNoLugar'
import { usePresets as usePresetsMotion } from '@/motions/PresetMotion'
import { escolhasDeSom, usePreCarregarMarcas } from '@/motions/sons'
import { useMotionsDoProjeto } from '@/motions/useMotionsDoProjeto'
import AtorArrastavel from './AtorArrastavel'
import AtorRecortado from './AtorRecortado'
import { ajusteNaFolga, estiloDaPessoaNaGeometria, estiloDoQuadro, geometriaDoAtor, type AjusteAtor, type Rosto } from './ator'
import { CardComentario, comentarioDe, type Comentario } from './ComentarioIG'
import type { PalavraSaida } from './direcaoProjeto'
import { divisaoDe, lugarDoComentario, type Divisao } from './divisao'
import { useEntradas } from './entradas'
import InsertNoLugar, { pedidosNoTempo, presetDe } from './InsertNoLugar'
import type { Pedido } from './inserts/comum'
import { usePresets } from './presets'
import { precarregarSons } from './sons'

/** O quadro montado por cima do ator (SPEC §13, camada 2): o insert sob o cursor no lugar (com a entrada, o fundo, o
 *  card do comentário), o ator descendo ou encolhendo na tela dividida, a pessoa recortada por cima, ou o motion do
 *  plano. É a `sobreposicao` do Preview na etapa Inserts e na etapa Transições (a transição age sobre o quadro inteiro
 *  já montado). `mudarComentario`: o card do comentário arrasta e muda (só na etapa Inserts). */
export default function MontagemNoPalco(p: {
  projeto: Projeto
  planos: ItemRef[]
  saida: PalavraSaida[]
  pedidos: Pedido[]
  banco: Map<string, ItemBanco>
  fundo: string
  motions: Record<string, MotionPlano>
  tempo: number
  tocando: boolean
  /** A velocidade da prévia (0,5× a 2×): as mídias dos inserts andam junto. */
  velocidade?: number
  /** Marca os inserts ainda sem mídia (só na etapa Inserts; nas outras, como na exportação, fica o ator limpo). */
  avisoSemMidia?: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  src: string
  enquadramentoX: number
  mudarComentario?: (pid: string, campos: Partial<Comentario>) => void
  /** O rosto típico num trecho do vídeo final (`useRosto`): o enquadramento do ator na tela dividida (P5). */
  rostoEm?: ((ini: number, fim: number) => Rosto | null) | null
  /** O ator arrasta e muda de tamanho no vídeo (só na etapa Inserts): o ajuste novo do insert. */
  mudarAtor?: (pid: string, ator: AjusteAtor, salvar: boolean) => void
}) {
  const { projeto, tempo, motions } = p
  const presets = usePresets()
  const presetsMotion = usePresetsMotion()
  const entradas = useEntradas()
  // os arquivos dos sons do projeto (dos presets dos inserts e dos motions), baixados ao abrir a etapa: o insert e o
  // motion só montam quando aparecem, e o 1º toque, esperando baixar e decodificar, saía sem o começo
  const idsSons = [
    ...new Set([
      ...p.pedidos.flatMap((x) => (presetDe(x, presets)?.receita.sons ?? []).map((s) => s.som)),
      ...Object.values(motions).flatMap((m) => Object.values(escolhasDeSom(presetsMotion, m)).map((s) => s.som)),
    ]),
  ]
    .filter((x): x is string => !!x)
    .sort()
    .join()
  useEffect(() => precarregarSons(idsSons.split(',').filter(Boolean)), [idsSons])
  const noCursor = p.pedidos.find((x) => tempo >= x.t.inicio && tempo < x.t.fim) ?? null
  const planoNoCursor = p.planos.find((pl) => tempo >= pl.inicio && tempo < pl.fim) ?? null
  const motionNoCursor = planoNoCursor && motions[planoNoCursor.id] ? planoNoCursor : null
  // a divisão do insert sob o cursor: onde o ator fica (desce, ou encolhe numa janela) e se a pessoa recortada sai por cima
  const divisao: Divisao | null =
    noCursor && noCursor.midias.length > 0 ? divisaoDe(noCursor, p.banco, presets) : motionNoCursor?.tipo === 'tela_dividida_motion' ? { modo: 'metade', tipo: 'area', f: 0.5 } : null
  // a geometria do ator (P5): na tela dividida o vídeo principal desce/amplia pelo rosto; no "ator embaixo", uma cópia
  // sincronizada vai por cima do insert (a janela, o canto) e/ou a pessoa recortada, e o vídeo principal fica como está
  const rosto = noCursor && p.rostoEm ? p.rostoEm(noCursor.t.inicio, noCursor.t.fim) : motionNoCursor && p.rostoEm ? p.rostoEm(motionNoCursor.inicio, motionNoCursor.fim) : null
  const ajuste = (noCursor?.enriquecimento as { ator?: AjusteAtor } | undefined)?.ator
  const g = geometriaDoAtor(divisao, ajuste, rosto)
  const estiloAtor = JSON.stringify(g?.modo === 'metade' ? estiloDoQuadro(g) : {})
  const { videoRef } = p
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const e = JSON.parse(estiloAtor) as React.CSSProperties
    v.style.transform = (e.transform as string) ?? ''
    v.style.transformOrigin = (e.transformOrigin as string) ?? ''
    v.style.clipPath = (e.clipPath as string) ?? ''
    return () => {
      v.style.transform = v.style.transformOrigin = v.style.clipPath = ''
    }
  }, [estiloAtor, videoRef])
  const bruto = projeto.fontes.find((f) => f.papel === 'bruto')
  const urlPessoa = projeto.recorte?.estado === 'pronto' && bruto ? urlArquivo(projeto.id, `midia/recorte/${bruto.id}_pessoa.webm`) : null
  const estiloPessoa = urlPessoa ? estiloDaPessoaNaGeometria(g) : null
  // o recortado sem o recorte do ator pronto: o ator com o cenário, no mesmo lugar (com os cantos redondos)
  const estiloQuadro = g && g.modo !== 'metade' ? (estiloDoQuadro(g) ?? (urlPessoa ? null : estiloDoQuadro({ ...g, modo: 'canto', raio: 0.07 }))) : null

  if (motionNoCursor) {
    const m = motions[motionNoCursor.id]
    return (
      <MotionNoLugar
        src={urlPaginaMotionPlano(projeto.id, motionNoCursor.id, m, motionNoCursor.fim - motionNoCursor.inicio, falaDoPlano(p.saida, motionNoCursor.inicio, motionNoCursor.fim))}
        formato={m.formato}
        fundo={fundoDoMotion(m)}
        rel={tempo - motionNoCursor.inicio}
        sons={{ ativo: p.tocando, escolhas: escolhasDeSom(presetsMotion, m) }}
      />
    )
  }
  if (!noCursor) return null
  const mudar = p.mudarComentario
  return (
    <>
      <InsertNoLugar pedido={noCursor} banco={p.banco} tempo={tempo} tocando={p.tocando} velocidade={p.velocidade} avisoSemMidia={p.avisoSemMidia} fundo={p.fundo} entradas={entradas} />
      {/* o ator por cima do insert vai também por cima do card do comentário (z-10), como na exportação: lá o card é
          fotografado junto com a camada dos inserts e o ator é posto depois (SPEC §13) */}
      {(estiloQuadro || estiloPessoa) && (
        <div className="pointer-events-none absolute inset-0 z-[15]">
          {estiloQuadro && <AtorRecortado fonte={videoRef} src={p.src} estilo={estiloQuadro} enquadramentoX={p.enquadramentoX} />}
          {estiloPessoa && urlPessoa && <AtorRecortado fonte={videoRef} src={urlPessoa} estilo={estiloPessoa} enquadramentoX={p.enquadramentoX} />}
        </div>
      )}
      {g && divisao && p.mudarAtor && (
        <AtorArrastavel g={g} d={divisao} aj={ajuste ?? {}} mudar={(campos, salvar) => p.mudarAtor!(noCursor.id, ajusteNaFolga(divisao, { ...ajuste, ...campos }, rosto), salvar)} />
      )}
      {noCursor.tipo === 'comentario_insert_ator' && (
        <CardComentario
          c={comentarioDe(noCursor, lugarDoComentario(noCursor, divisao, g))}
          texto={comentarioDe(noCursor).texto ?? noCursor.texto ?? ''}
          mudar={mudar && ((campos) => mudar(noCursor.id, campos))}
        />
      )}
    </>
  )
}

/** A montagem lida do projeto (os inserts, o banco e os motions), para as etapas que só mostram o quadro montado (a
 *  etapa Transições). */
export function MontagemDoProjeto(p: {
  projeto: Projeto
  planos: ItemRef[]
  saida: PalavraSaida[]
  tempo: number
  tocando: boolean
  velocidade?: number
  videoRef: RefObject<HTMLVideoElement | null>
  src: string
  enquadramentoX: number
  rostoEm?: ((ini: number, fim: number) => Rosto | null) | null
}) {
  const id = p.projeto.id
  const [ins, setIns] = useState<InsertsProjeto | null>(null)
  const [banco, setBanco] = useState<Map<string, ItemBanco>>(new Map())
  const { motions } = useMotionsDoProjeto(id)
  useEffect(() => {
    void lerInserts(id)
      .then(setIns)
      .catch(() => {})
    void listarBanco()
      .then((l) => setBanco(mapaBanco(l)))
      .catch(() => {})
  }, [id, p.projeto.direcao?.ativa, p.projeto.direcao?.gerado_em])
  const pedidos = useMemo(() => pedidosNoTempo(ins?.pedidos ?? [], p.planos), [ins, p.planos])
  // as marcas de som dos motions, de antemão: na 1ª passagem por um motion, o som já entra no tempo
  usePreCarregarMarcas(id, p.planos, motions, p.saida)
  return <MontagemNoPalco {...p} pedidos={pedidos} banco={banco} fundo={ins?.fundo ?? 'gradiente'} motions={motions} />
}
