import { useEffect, useMemo, useState, type RefObject } from 'react'
import { lerInserts, listarBanco, mapaBanco, urlArquivo, type InsertsProjeto, type ItemBanco, type ItemRef, type Projeto } from '@/api'
import { falaDoPlano, fundoDoMotion, urlPaginaMotionPlano, type MotionPlano } from '@/motions/api'
import MotionNoLugar from '@/motions/MotionNoLugar'
import { usePresets as usePresetsMotion } from '@/motions/PresetMotion'
import { escolhasDeSom } from '@/motions/sons'
import { useMotionsDoProjeto } from '@/motions/useMotionsDoProjeto'
import AtorRecortado from './AtorRecortado'
import { CardComentario, comentarioDe, type Comentario } from './ComentarioIG'
import type { PalavraSaida } from './direcaoProjeto'
import { divisaoDe, estiloDaPessoa, estiloDoAtor, posicaoDoComentario, type Divisao } from './divisao'
import { useEntradas } from './entradas'
import InsertNoLugar, { pedidosNoTempo } from './InsertNoLugar'
import type { Pedido } from './inserts/comum'
import { usePresets } from './presets'

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
  videoRef: RefObject<HTMLVideoElement | null>
  src: string
  enquadramentoX: number
  mudarComentario?: (pid: string, campos: Partial<Comentario>) => void
}) {
  const { projeto, tempo, motions } = p
  const presets = usePresets()
  const presetsMotion = usePresetsMotion()
  const entradas = useEntradas()
  const noCursor = p.pedidos.find((x) => tempo >= x.t.inicio && tempo < x.t.fim) ?? null
  const planoNoCursor = p.planos.find((pl) => tempo >= pl.inicio && tempo < pl.fim) ?? null
  const motionNoCursor = planoNoCursor && motions[planoNoCursor.id] ? planoNoCursor : null
  // a divisão do insert sob o cursor: onde o ator fica (desce, ou encolhe numa janela) e se a pessoa recortada sai por cima
  const divisao: Divisao | null =
    noCursor && noCursor.midias.length > 0 ? divisaoDe(noCursor, p.banco, presets) : motionNoCursor?.tipo === 'tela_dividida_motion' ? { modo: 'metade', tipo: 'area', f: 0.5 } : null
  // no "insert atrás" o ator vai por cima do insert (uma cópia sincronizada, abaixo); o vídeo principal fica como está
  const estiloAtor = JSON.stringify(divisao?.modo === 'atras' ? {} : estiloDoAtor(divisao))
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
  const estiloPessoa = estiloDaPessoa(divisao)
  const bruto = projeto.fontes.find((f) => f.papel === 'bruto')
  const urlPessoa = projeto.recorte?.estado === 'pronto' && bruto ? urlArquivo(projeto.id, `midia/recorte/${bruto.id}_pessoa.webm`) : null

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
      <InsertNoLugar pedido={noCursor} banco={p.banco} tempo={tempo} tocando={p.tocando} fundo={p.fundo} entradas={entradas} />
      {divisao?.modo === 'atras' && <AtorRecortado fonte={videoRef} src={p.src} estilo={estiloDoAtor(divisao)} enquadramentoX={p.enquadramentoX} />}
      {estiloPessoa && urlPessoa && <AtorRecortado fonte={videoRef} src={urlPessoa} estilo={estiloPessoa} enquadramentoX={p.enquadramentoX} />}
      {noCursor.tipo === 'comentario_insert_ator' && (
        <CardComentario
          c={comentarioDe(noCursor, posicaoDoComentario(divisao))}
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
  videoRef: RefObject<HTMLVideoElement | null>
  src: string
  enquadramentoX: number
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
  return <MontagemNoPalco {...p} pedidos={pedidos} banco={banco} fundo={ins?.fundo ?? 'gradiente'} motions={motions} />
}
