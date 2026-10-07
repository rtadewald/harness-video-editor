import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { abrirEditor, lerInserts, listarBanco, type DadosEditor, type InsertsProjeto, type ItemBanco } from '@/api'
import { CardComentario, comentarioDe } from '@/editor/ComentarioIG'
import { paraTempo, palavrasNaSaida } from '@/editor/direcaoProjeto'
import { ChuvaAoVivo, RelogioRender } from '@/editor/Fundo'
import InsertNoLugar, { pedidosNoTempo } from '@/editor/InsertNoLugar'
import { duracaoDe, enriquecimentoDe } from '@/editor/enriquecimento'
import { montarSequencia } from '@/editor/sequencia'

/** Páginas abertas pelo navegador escondido do backend (nunca pelo criador). */

/** `/render/chuva`: a cena ao vivo da chuva, para gravar o `chuva.mp4`. */
export function RenderChuva() {
  return (
    <div className="fixed inset-0">
      <ChuvaAoVivo fps={240} />
    </div>
  )
}

type Trecho = { ini: number; fim: number; dividida: boolean }
declare global {
  interface Window {
    /** `ir(t)` responde com a chave do quadro quando ele fica igual aos seguintes (insert parado: o backend reaproveita a foto). */
    __render?: { duracao: number; trechos: Trecho[]; ir: (t: number) => Promise<string | null> }
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
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

/** `/render/p/:id`: só a camada dos inserts (layout, entrada, fundo e card de comentário), em fundo transparente, parada
 *  no instante que o backend pede (`window.__render.ir(t)`). O ator e o áudio saem do bruto, pelo ffmpeg (SPEC §13). */
export function RenderProjeto() {
  const { id = '' } = useParams()
  const [dados, setDados] = useState<DadosEditor | null>(null)
  const [ins, setIns] = useState<InsertsProjeto | null>(null)
  const [banco, setBanco] = useState<Map<string, ItemBanco> | null>(null)
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
    void listarBanco().then((l) => setBanco(new Map(l.flatMap((i) => [i, ...(i.trechos ?? [])]).map((i) => [i.id, i]))))
  }, [id])

  const pedidos = useMemo(() => {
    if (!dados || !ins) return null
    const seq = montarSequencia(dados.timeline, dados.palavras)
    const saida = palavrasNaSaida(dados.palavras, seq)
    const planos = paraTempo(dados.projeto.direcao?.itens ?? [], dados.palavras, saida, seq.duracao).visiveis.filter((i) => i.camada === 'plano')
    return { duracao: seq.duracao, lista: pedidosNoTempo(ins.pedidos, planos).filter((x) => x.midias.length) }
  }, [dados, ins])

  // a página avisa o backend que está pronta e responde a cada instante pedido depois de tudo pintado
  useEffect(() => {
    if (!pedidos || !banco) return
    window.__render = {
      duracao: pedidos.duracao,
      trechos: pedidos.lista.map((x) => ({ ini: x.t.inicio, fim: x.t.fim, dividida: x.formato === 'dividida' })),
      ir: (t) =>
        new Promise<string | null>((ok) => {
          chegou.current = ok
          setPedido((x) => ({ t, n: x.n + 1 }))
        }),
    }
  }, [pedidos, banco])
  useEffect(() => {
    if (!chegou.current) return
    const ok = chegou.current
    chegou.current = null
    void pronto().then(() => ok(document.querySelector('video') ? null : chave.current))
  }, [pedido])

  const atual = pedidos?.lista.find((x) => tempo >= x.t.inicio && tempo < x.t.fim)
  // parado: sem vídeo na tela (checado depois de pintar) e com a entrada já terminada
  const e = atual && enriquecimentoDe(atual)
  chave.current = atual && e && tempo - atual.t.inicio >= (e.entrada === 'sem' ? 0 : duracaoDe(e, ins?.curva_padrao)) ? atual.id : null
  if (!atual || !banco) return null
  const c = comentarioDe(atual)
  return (
    <RelogioRender.Provider value={tempo}>
      <div className="fixed inset-0 overflow-hidden">
        <InsertNoLugar pedido={atual} banco={banco} tempo={tempo} tocando={false} fundo={ins?.fundo ?? 'gradiente'} padrao={ins?.curva_padrao} />
        {atual.tipo === 'comentario_insert_ator' && <CardComentario c={c} texto={c.texto ?? atual.texto ?? ''} />}
      </div>
    </RelogioRender.Provider>
  )
}
