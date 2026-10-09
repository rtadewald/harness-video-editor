import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { abrirEditor, json, lerInserts, listarBanco, mapaBanco, type DadosEditor, type InsertsProjeto, type ItemBanco } from '@/api'
import { falaDoPlano, fundoDoMotion, listarPresets as listarPresetsMotion, motionsDoProjeto, urlPaginaMotionPlano, type MotionPlano } from '@/motions/api'
import { escolhasDeSom, eventosDoMotion, marcasDaPagina } from '@/motions/sons'
import { geometriaDoAtor, useRosto } from '@/ator/ator'
import { blocosDaLegenda, paraExportar, zonasDaLegenda, type Legenda } from '@/legenda/legenda'
import { cortesDoVideo, sonsDasTransicoes, type Biblioteca, type Escolhas } from '@/transicoes/transicoes'
import { CardComentario, comentarioDe } from '@/inserts/ComentarioIG'
import { paraTempo, palavrasNaSaida } from '@/direcao/direcaoProjeto'
import { ChuvaAoVivo, RelogioRender } from '@/inserts/Fundo'
import InsertNoLugar, { chaveParada, pedidosNoTempo, receitaDoInsert } from '@/inserts/InsertNoLugar'
import { carregarCatalogoSons, eventosDaReceita, type EventoSom } from '@/editor/sons'
import { divisaoDe, lugarDoComentario, type Divisao } from '@/presets/divisao'
import MotionNoLugar from '@/motions/MotionNoLugar'
import { usePresets } from '@/presets/presets'
import { useEntradas } from '@/inserts/entradas'
import { montarSequencia } from '@/player/sequencia'

/** Páginas abertas pelo navegador escondido do backend (nunca pelo criador). */

/** `/render/chuva`: a cena ao vivo da chuva, para gravar o `chuva.mp4`. */
export function RenderChuva() {
  return (
    <div className="fixed inset-0">
      <ChuvaAoVivo fps={240} />
    </div>
  )
}

/** `divisao`: como a tela se divide no trecho (o ator: onde fica, e se a pessoa recortada sai por cima do insert). */
type Trecho = { ini: number; fim: number; dividida: boolean; divisao: Divisao | null }
declare global {
  interface Window {
    /** `ir(t)` responde com a chave do quadro quando ele fica igual aos seguintes (insert parado: o backend reaproveita a foto). */
    /** `sons()`: os sons de apoio dos presets (SPEC §8.6), no tempo do vídeo final, para o ffmpeg misturar com a voz. */
    /** Os campos das camadas que vêm depois da montagem (SPEC §13; cada área acrescenta o seu, como valor ou função
     *  assíncrona, e o backend lê em `exportacao._trechos`):
     *  - `transicoes` (P2, §8.8): as transições entre planos no tempo do vídeo final (o corte, o efeito, o som);
     *  - `legenda` (P4, §8.10): os blocos visíveis da legenda no tempo do vídeo final (`{blocos: [{ini, fim, texto, y}]}`,
     *    ou null se desligada), para o ASS (`legenda.py`). */
    __render?: {
      duracao: number
      trechos: Trecho[]
      ir: (t: number) => Promise<string | null>
      sons: () => Promise<EventoSom[]>
      transicoes?: unknown[] | (() => Promise<unknown[]>)
      legenda?: unknown | (() => Promise<unknown>)
    }
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Espera tudo o que está na tela mostrar o instante novo: fontes, imagens e cada vídeo já no quadro pedido. */
async function pronto() {
  await document.fonts.ready
  const limite = Date.now() + 15_000
  const ok = () => [...document.querySelectorAll('video')].every((v) => v.error || (v.readyState >= 2 && !v.seeking))
  while (!ok() && Date.now() < limite) await esperar(5)
  await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => {}))))
  // motions: o iframe carregado e a cena já no instante pedido
  const motions = () => !document.querySelector('iframe[data-pronto="0"], iframe[data-pintando]')
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  while (!motions() && Date.now() < limite) await esperar(10)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

/** `/render/p/:id`: só a camada dos inserts (layout, entrada, fundo e card de comentário), em fundo transparente, parada
 *  no instante que o backend pede (`window.__render.ir(t)`). O ator e o áudio saem do bruto, pelo ffmpeg (SPEC §13). */
export function RenderProjeto() {
  const { id = '' } = useParams()
  const [dados, setDados] = useState<DadosEditor | null>(null)
  const [ins, setIns] = useState<InsertsProjeto | null>(null)
  const [banco, setBanco] = useState<Map<string, ItemBanco> | null>(null)
  const [motions, setMotions] = useState<Record<string, MotionPlano> | null>(null)
  const entradas = useEntradas()
  const presets = usePresets()
  const [pedido, setPedido] = useState({ t: -1, n: 0 }) // n: cada pedido responde, mesmo repetindo o instante
  const tempo = pedido.t
  const chegou = useRef<((chave: string | null) => void) | null>(null)
  const chave = useRef<string | null>(null)

  useEffect(() => {
    // a tela tem o tamanho do vídeo final e o conteúdo é desenhado como numa prévia de 540 px de largura, ampliado pelo
    // zoom (não pela densidade de pixels: com ela, o Chrome desenhava os vídeos com perspectiva 3D em baixa resolução)
    document.documentElement.style.zoom = String(window.innerWidth / 540)
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    void abrirEditor(id).then(setDados)
    void lerInserts(id).then(setIns)
    void motionsDoProjeto(id).then(setMotions)
    void listarBanco().then((l) => setBanco(mapaBanco(l)))
  }, [id])

  const seqRender = useMemo(() => (dados ? montarSequencia(dados.timeline, dados.palavras, dados.projeto.velocidade ?? 1) : null), [dados])
  // o rosto do ator (P5): a geometria do ator em cada trecho dividido vai junto da divisão, para o ffmpeg aplicar
  const rostoEm = useRosto(dados?.projeto, seqRender)
  const pedidos = useMemo(() => {
    if (!dados || !ins) return null
    const seq = seqRender ?? montarSequencia(dados.timeline, dados.palavras, dados.projeto.velocidade ?? 1)
    const saida = palavrasNaSaida(dados.palavras, seq)
    const planos = paraTempo(dados.projeto.direcao?.itens ?? [], dados.palavras, saida, seq.duracao).visiveis.filter((i) => i.camada === 'plano')
    // os motions: os planos de motion que já têm um motion escolhido
    const comMotion = planos.filter((pl) => motions?.[pl.id]).map((pl) => ({ plano: pl.id, ini: pl.inicio, fim: pl.fim, dividida: pl.tipo === 'tela_dividida_motion', fala: falaDoPlano(saida, pl.inicio, pl.fim) }))
    return { duracao: seq.duracao, lista: pedidosNoTempo(ins.pedidos, planos).filter((x) => x.midias.length), motions: comMotion, planos, saida, palavras: dados.palavras }
  }, [dados, ins, motions, seqRender])

  // a página avisa o backend que está pronta e responde a cada instante pedido depois de tudo pintado
  useEffect(() => {
    if (!pedidos || !banco || !entradas || !motions || !presets) return
    // com o rosto medido, a página só se diz pronta depois de tentar lê-lo (a geometria do ator depende dele); sem rosto
    // no vídeo ou com o arquivo faltando, segue sem ele (o enquadramento de antes)
    if (rostoEm === undefined) return
    // os cortes entre planos com a transição de cada um (a biblioteca e as escolhas do projeto, lidas na hora)
    const cortesDasTransicoes = async () => {
      const [b, escolhas] = await Promise.all([fetch('/api/transicoes').then(json<Biblioteca>), fetch(`/api/projetos/${id}/transicoes`).then(json<Escolhas>)])
      return cortesDoVideo(pedidos.planos, b, escolhas)
    }
    window.__render = {
      duracao: pedidos.duracao,
      trechos: [
        ...pedidos.lista.map((x) => {
          const divisao = divisaoDe(x, banco, presets)
          const ator = geometriaDoAtor(divisao, x.enriquecimento?.ator, rostoEm?.(x.t.inicio, x.t.fim) ?? null)
          return { ini: x.t.inicio, fim: x.t.fim, dividida: x.formato === 'dividida', divisao: divisao && { ...divisao, ator } }
        }),
        ...pedidos.motions.map((m) => {
          const divisao: Divisao | null = m.dividida ? { modo: 'metade', tipo: 'area', f: 0.5 } : null
          return { ini: m.ini, fim: m.fim, dividida: m.dividida, divisao: divisao && { ...divisao, ator: geometriaDoAtor(divisao, null, rostoEm?.(m.ini, m.fim) ?? null) } }
        }),
      ],
      sons: async () => {
        const cat = await carregarCatalogoSons()
        const dosInserts = pedidos.lista.flatMap((x) => {
          const r = receitaDoInsert(x, banco, presets)
          return r ? eventosDaReceita(r, x.t.fim - x.t.inicio, cat).map((e) => ({ ...e, t: e.t + x.t.inicio })) : []
        })
        // os motions: as marcas de cada página (aberta escondida) com o som escolhido de cada momento
        const presetsMotion = await listarPresetsMotion()
        const dosMotions = await Promise.all(
          pedidos.motions.map(async (m) => {
            const mp = motions[m.plano]
            if (mp.tipo !== 'preset') return []
            const marcas = await marcasDaPagina(urlPaginaMotionPlano(id, m.plano, mp, m.fim - m.ini, m.fala, true), mp.formato)
            return eventosDoMotion(marcas, escolhasDeSom(presetsMotion, mp), cat)
              .filter((e) => e.t < m.fim - m.ini)
              .map((e) => ({ ...e, t: e.t + m.ini }))
          }),
        )
        return [...dosInserts, ...dosMotions.flat(), ...sonsDasTransicoes(await cortesDasTransicoes(), cat)]
      },
      // a legenda (SPEC §8.10): os blocos visíveis, lidos na hora (a mesma conta da prévia, com a altura pelos inserts
      // desta página), para o ASS
      legenda: async () => {
        const lg = await fetch(`/api/projetos/${id}/legenda`).then(json<Legenda>)
        const zonas = zonasDaLegenda(pedidos.lista, banco, presets)
        return lg.ligada ? { blocos: paraExportar(blocosDaLegenda(pedidos.saida, pedidos.planos, lg, pedidos.palavras, zonas)) } : null
      },
      // as transições com efeito (o som delas vai em `sons`), para o ffmpeg desenhar depois da montagem (SPEC §8.8)
      transicoes: async () =>
        (await cortesDasTransicoes())
          .filter((c) => c.transicao && c.transicao.efeito.tipo !== 'seco')
          .map((c) => ({ t: c.t, ...c.transicao!.efeito })),
      ir: (t) =>
        new Promise<string | null>((ok) => {
          chegou.current = ok
          setPedido((x) => ({ t, n: x.n + 1 }))
        }),
    }
  }, [id, pedidos, banco, entradas, motions, presets, rostoEm])
  useEffect(() => {
    if (!chegou.current) return
    const ok = chegou.current
    chegou.current = null
    void pronto().then(() => ok(document.querySelector('video') ? null : chave.current))
  }, [pedido])

  const atual = pedidos?.lista.find((x) => tempo >= x.t.inicio && tempo < x.t.fim)
  const motion = pedidos?.motions.find((m) => tempo >= m.ini && tempo < m.fim)
  // parado: sem vídeo na tela (checado depois de pintar) e sem entrada nem saída andando (motion nunca é parado)
  chave.current = atual && !motion ? chaveParada(atual, tempo - atual.t.inicio, entradas, presets) : null
  if (motion && motions?.[motion.plano])
    return (
      <RelogioRender.Provider value={tempo}>
        <div className="fixed inset-0 overflow-hidden">
          <MotionNoLugar
            src={urlPaginaMotionPlano(id, motion.plano, motions[motion.plano], motion.fim - motion.ini, motion.fala, true)}
            formato={motions[motion.plano].formato}
            fundo={fundoDoMotion(motions[motion.plano])}
            rel={tempo - motion.ini}
          />
        </div>
      </RelogioRender.Provider>
    )
  if (!atual || !banco) return null
  const divisaoAtual = divisaoDe(atual, banco, presets)
  // o card desvia do ator pela geometria dele (o rosto só muda o x: a altura é a mesma da prévia)
  const c = comentarioDe(atual, lugarDoComentario(atual, divisaoAtual, geometriaDoAtor(divisaoAtual, atual.enriquecimento?.ator, null)))
  return (
    <RelogioRender.Provider value={tempo}>
      <div className="fixed inset-0 overflow-hidden">
        <InsertNoLugar pedido={atual} banco={banco} tempo={tempo} tocando={false} fundo={ins?.fundo ?? 'gradiente'} entradas={entradas} />
        {atual.tipo === 'comentario_insert_ator' && <CardComentario c={c} texto={c.texto ?? atual.texto ?? ''} />}
      </div>
    </RelogioRender.Provider>
  )
}
