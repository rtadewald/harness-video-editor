import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { enviar, json } from '@/api'
import { criarLoja } from '@/editor/loja'
import { barramento, contexto } from '@/editor/sons'

/** O áudio do vídeo na prévia (SPEC §8.9; docs/audio.md), com os mesmos números da exportação (`audio.py`, servidos em
 *  `/api/audio`): a voz (o proxy com a voz limpa) pelo passa-altas, o timbre, o compressor e o fader do ator; os sons
 *  de cada grupo no seu fader; e a faixa de fundo nas voltas do laço com crossfade, no nível da voz menos `fundo_db`,
 *  com o ducking pelas falas e o fade no fim. O −14 LUFS é só do MP4 (a prévia toca no nível de trabalho). */
export type Trilha = 'ator' | 'presets' | 'transicoes' | 'fundo'
export type Limpeza = 'sem' | 'leve' | 'media' | 'forte' | 'isolamento'
export type Timbre = 'natural' | 'quente' | 'clara'
export type Escolhas = { voz: { limpeza: Limpeza; timbre: Timbre }; fundo: string | null; fundo_mudo: boolean; niveis: Record<Trilha, number> }
/** `versao`: a do vídeo (o Reenquadrar) com que o proxy com a voz foi feito. */
export type EstadoVoz = {
  estado: 'sem' | 'pronta' | 'fila' | 'rodando' | 'erro' | 'falta'
  limpeza: Limpeza
  progresso?: number
  erro?: string | null
  proxy?: string
  versao?: number | null
}
/** `voz_lufs`: a sonoridade da voz da escolha, quando existe; `bruto_lufs`: a da voz do bruto; `laco`: o trecho da faixa
 *  de fundo escolhida que se repete. */
export type AudioDoProjeto = {
  escolhas: Escolhas
  voz: EstadoVoz
  voz_lufs: number | null
  bruto_lufs: number | null
  trilha_lufs: number
  laco: { id: string; ini: number; fim: number } | null
}
/** A voz que a prévia toca: `proxy` com a voz limpa (null: o proxy do bruto), a `versao` do vídeo dele e a sonoridade. */
export type VozTocada = { proxy: string | null; versao: number | null; lufs: number | null }
export type Faixa = { id: string; nome: string; clima?: string; bpm?: number; duracao?: number; descricao?: string }
export type Catalogo = {
  trilhas: Faixa[]
  timbres: Record<Timbre, { f: number; g: number; q: number }[]>
  passa_altas: number
  compressor: { limiar: number; razao: number; ataque: number; soltura: number; joelho: number }
  fundo_db: number
  ducking_db: number
  subida: number
  descida: number
  junta: number
  fade_fundo: number
  cruza_fundo: number
  niveis: [number, number]
  lufs: number
}

const loja = criarLoja(() => fetch('/api/audio').then(json<Catalogo>))
export const useCatalogoAudio = loja.use
export const urlFaixa = (id: string) => `/api/audio/trilhas/${id}.m4a`
export const ganho = (db: number) => 10 ** (db / 20)

/** A voz que a prévia toca depois de uma resposta: a limpa quando pronta; sem limpeza ou se ela falhou, a do bruto (como
 *  a exportação); enquanto uma nova é feita, a que já tocava (o player não recarrega à toa). */
function vozTocada(r: AudioDoProjeto, antes: VozTocada | null): VozTocada {
  const v = r.voz
  if (v.estado === 'pronta' && v.proxy) return { proxy: v.proxy, versao: v.versao ?? null, lufs: r.voz_lufs }
  if (v.estado === 'sem' || v.estado === 'erro' || !antes) return { proxy: null, versao: null, lufs: r.voz_lufs ?? r.bruto_lufs }
  return antes
}

/** As escolhas de áudio do projeto, o estado da voz limpa (acompanha enquanto ela é feita) e a voz que a prévia toca.
 *  `chave`: muda quando o vídeo do player muda (o proxy fica pronto, um Reenquadrar termina) — relê, e a limpeza que
 *  esperava pelo proxy é pedida. */
export function useAudioDoProjeto(
  id: string,
  chave: string,
): [AudioDoProjeto | null, (campos: Record<string, unknown>, salvar?: boolean) => void, VozTocada | null] {
  const [s, setS] = useState<{ a: AudioDoProjeto | null; tocada: VozTocada | null }>({ a: null, tocada: null })
  const receber = useCallback((r: AudioDoProjeto) => setS((x) => ({ a: r, tocada: vozTocada(r, x.tocada) })), [])
  const ler = useCallback(
    () =>
      fetch(`/api/projetos/${id}/audio`)
        .then(json<AudioDoProjeto>)
        .then(receber)
        .catch(() => {}),
    [id, receber],
  )
  useEffect(() => void ler(), [ler, chave])
  const a = s.a
  const fazendo = a?.voz.estado === 'fila' || a?.voz.estado === 'rodando'
  useEffect(() => {
    if (!fazendo) return
    const t = setInterval(() => void ler(), 1500)
    return () => clearInterval(t)
  }, [fazendo, ler])
  const mudar = useCallback(
    (campos: Record<string, unknown>, salvar = true) => {
      // a prévia muda na hora (um fader arrastando só muda aqui); o servidor confirma
      setS((x) => (x.a ? { ...x, a: { ...x.a, escolhas: mesclar(x.a.escolhas, campos) } } : x))
      if (!salvar) return
      void enviar<AudioDoProjeto>('PUT', `/api/projetos/${id}/audio`, { campos })
        .then(receber)
        .catch((e) => window.alert((e as Error).message))
    },
    [id, receber],
  )
  return [a, mudar, s.tocada]
}
function mesclar(e: Escolhas, c: Record<string, unknown>): Escolhas {
  return {
    ...e,
    ...(c.fundo !== undefined ? { fundo: c.fundo as string | null } : {}),
    ...(c.fundo_mudo !== undefined ? { fundo_mudo: !!c.fundo_mudo } : {}),
    voz: { ...e.voz, ...((c.voz as object) ?? {}) },
    niveis: { ...e.niveis, ...((c.niveis as object) ?? {}) },
  }
}

/** Os trechos em que o ator fala (no tempo da saída): as palavras juntas quando a pausa é menor que `junta` (igual a
 *  `audio.falas`). */
export function falas(palavras: { saida_ini: number; saida_fim: number }[], junta: number): [number, number][] {
  const out: [number, number][] = []
  for (const w of [...palavras].sort((a, b) => a.saida_ini - b.saida_ini)) {
    const u = out[out.length - 1]
    if (u && w.saida_ini - u[1] < junta) u[1] = Math.max(u[1], w.saida_fim)
    else out.push([w.saida_ini, w.saida_fim])
  }
  return out
}
const suave = (u: number) => {
  const x = Math.min(Math.max(u, 0), 1)
  return x * x * (3 - 2 * x)
}
/** O ganho do ducking no instante `t` (igual a `audio.expressao_ducking`). */
export function ganhoDucking(trechos: [number, number][], t: number, c: Pick<Catalogo, 'ducking_db' | 'subida' | 'descida'>) {
  if (c.ducking_db <= 0) return 1
  let k = 0
  for (const [a, b] of trechos) k += Math.min(suave((t - (a - c.subida)) / c.subida), suave((b + c.descida - t) / c.descida))
  return 1 - (1 - ganho(-c.ducking_db)) * Math.min(k, 1)
}

// ---------------------------------------------------------------- a voz na prévia

const db = (x: number) => 20 * Math.log10(x)
/** O ganho de compensação (makeup) que o `DynamicsCompressorNode` aplica sozinho — (1 / curva(0 dBFS))^0,6, a conta do
 *  Chromium (`DynamicsCompressorKernel`), com a mesma curva do joelho —, que o `acompressor` do ffmpeg não aplica: a
 *  prévia o desfaz, para a voz soar na mesma relação com o fundo e os sons que no MP4 (−20 dB, 2,5:1, joelho 6: 2,04×,
 *  +6,2 dB). */
export function makeupDoCompressor(c: Catalogo['compressor']) {
  const lim = ganho(c.limiar)
  const joelho = (x: number, k: number) => (x < lim ? x : lim + (1 - Math.exp(-k * (x - lim))) / k)
  const inclinacao = (x: number, k: number) => {
    if (x < lim) return 1
    const x2 = x * 1.001
    return (db(joelho(x2, k)) - db(joelho(x, k))) / (db(x2) - db(x))
  }
  const fimDb = c.limiar + c.joelho
  const fimJoelho = ganho(fimDb)
  // o k da curva do joelho: a inclinação no fim dele igual a 1/razão (a mesma busca do Chromium)
  let [min, max, k] = [0.1, 10000, 5]
  for (let i = 0; i < 15; i++) {
    if (inclinacao(fimJoelho, k) < 1 / c.razao) max = k
    else min = k
    k = Math.sqrt(min * max)
  }
  const cheio = fimJoelho > 1 ? joelho(1, k) : ganho(db(joelho(fimJoelho, k)) + (0 - fimDb) / c.razao)
  return (1 / cheio) ** 0.6
}

const fontes = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
/** A fonte do Web Audio de um elemento (só pode haver uma por elemento, para sempre). */
function fonteDe(el: HTMLMediaElement) {
  let f = fontes.get(el)
  if (!f) {
    f = contexto().createMediaElementSource(el)
    fontes.set(el, f)
  }
  return f
}

/** A cadeia da voz sobre o vídeo do player: passa-altas → timbre → compressor (sem o makeup do navegador) → fader do ator
 *  (os mesmos números do `audio.cadeia_voz`), e os faders dos sons. O contexto acorda quando a prévia toca. */
export function useCadeiaNaPrevia(video: RefObject<HTMLVideoElement | null>, cat: Catalogo | null, e: Escolhas | null, tocando: boolean) {
  const cadeia = useRef<{ el: HTMLVideoElement; timbre: Timbre; fonte: MediaElementAudioSourceNode; nos: AudioNode[]; ator: GainNode } | null>(null)
  const timbre = e?.voz.timbre
  const desfazer = () => {
    const x = cadeia.current
    if (!x) return
    x.fonte.disconnect()
    x.nos.forEach((n) => n.disconnect())
    x.fonte.connect(contexto().destination) // sem a cadeia, a voz como veio
    cadeia.current = null
  }
  // a cada quadro: o elemento do player muda quando a etapa troca de prévia
  useEffect(() => {
    const el = video.current
    if (!el || !cat || !timbre) return
    if (cadeia.current?.el === el && cadeia.current.timbre === timbre) return
    desfazer()
    const c = contexto()
    const fonte = fonteDe(el)
    const pa = c.createBiquadFilter()
    pa.type = 'highpass'
    pa.frequency.value = cat.passa_altas
    pa.Q.value = db(Math.SQRT1_2) // Butterworth, como o `highpass` do ffmpeg (no passa-altas do Web Audio, o Q é em dB)
    const eqs = cat.timbres[timbre].map((x) => {
      const b = c.createBiquadFilter()
      b.type = 'peaking'
      b.frequency.value = x.f
      b.gain.value = x.g
      b.Q.value = x.q
      return b
    })
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = cat.compressor.limiar
    comp.ratio.value = cat.compressor.razao
    comp.attack.value = cat.compressor.ataque
    comp.release.value = cat.compressor.soltura
    comp.knee.value = cat.compressor.joelho
    const semMakeup = c.createGain()
    semMakeup.gain.value = 1 / makeupDoCompressor(cat.compressor)
    const ator = c.createGain()
    ator.gain.value = ganho(e?.niveis.ator ?? 0)
    const nos: AudioNode[] = [pa, ...eqs, comp, semMakeup, ator]
    fonte.disconnect()
    nos.reduce<AudioNode>((a, b) => (a.connect(b), b), fonte).connect(c.destination)
    cadeia.current = { el, timbre, fonte, nos, ator }
  })
  useEffect(() => desfazer, []) // eslint-disable-line react-hooks/exhaustive-deps
  const n = e?.niveis
  useEffect(() => {
    if (!n) return
    if (cadeia.current) cadeia.current.ator.gain.value = ganho(n.ator)
    barramento('presets').gain.value = ganho(n.presets)
    barramento('transicoes').gain.value = ganho(n.transicoes)
  }, [n])
  useEffect(() => {
    if (tocando && contexto().state === 'suspended') void contexto().resume().catch(() => {})
  }, [tocando])
}

// ---------------------------------------------------------------- o fundo na prévia

/** Onde a faixa de fundo está no instante `t` da saída (igual a `audio.voltas_do_fundo` + o `acrossfade` do MP4): a 1ª
 *  volta do 0 até o fim do laço e as outras dentro dele, cada uma entrando com um crossfade de potência constante de
 *  `cruza` s. Um ou dois pedaços (no crossfade), cada um com o elemento de áudio (as voltas alternam entre dois), a
 *  posição na faixa e o ganho. Sem laço, a faixa do começo. */
export function pedacosDoFundo(t: number, laco: { ini: number; fim: number } | null, cruza: number): { el: 0 | 1; pos: number; ganho: number }[] {
  if (!laco) return [{ el: 0, pos: t, ganho: 1 }]
  const { ini, fim } = laco
  const x = Math.min(cruza, (fim - ini) / 2)
  const passo = fim - ini - x
  if (t < fim - x || passo <= 0) return [{ el: 0, pos: t, ganho: 1 }]
  const inicio = (k: number) => fim - x + (k - 1) * passo // onde a volta k (≥ 1) começa, no tempo da saída
  const j = 1 + Math.floor((t - (fim - x)) / passo)
  const pos = (k: number) => (k === 0 ? t : ini + t - inicio(k))
  const el = (k: number) => (k % 2) as 0 | 1
  const u = (t - inicio(j)) / x
  if (u >= 1) return [{ el: el(j), pos: pos(j), ganho: 1 }]
  return [
    { el: el(j), pos: pos(j), ganho: Math.sin((u * Math.PI) / 2) },
    { el: el(j - 1), pos: pos(j - 1), ganho: Math.cos((u * Math.PI) / 2) },
  ]
}

/** A faixa de fundo tocando junto com a prévia (no tempo da saída, nas voltas do laço), no nível da voz que a prévia toca
 *  (`lufs`) menos `fundo_db` mais o fader, com o ducking pelas falas e o fade no fim do vídeo, na velocidade do player.
 *  `ativo`: só nas etapas com o vídeo montado. Parada enquanto a prévia não toca (ou o nível ainda não é conhecido). */
export function useFundoNaPrevia(p: {
  cat: Catalogo | null
  a: AudioDoProjeto | null
  lufs: number | null
  trechos: [number, number][]
  tempo: number
  duracao: number
  tocando: boolean
  velocidade: number
  ativo: boolean
}) {
  const els = useRef<{ a: HTMLAudioElement; g: GainNode }[] | null>(null)
  const g = useRef<GainNode | null>(null)
  const fundo = p.a && !p.a.escolhas.fundo_mudo && p.ativo ? p.a.escolhas.fundo : null
  useEffect(() => {
    if (!fundo) return
    const c = contexto()
    const ganhoNo = c.createGain()
    ganhoNo.gain.value = 0
    ganhoNo.connect(c.destination)
    // dois elementos: no crossfade, a volta que sai e a que entra tocam juntas
    const pares = [0, 1].map(() => {
      const a = new Audio(urlFaixa(fundo))
      a.preload = 'auto'
      const gv = c.createGain()
      gv.gain.value = 0
      fonteDe(a).connect(gv).connect(ganhoNo)
      return { a, g: gv }
    })
    els.current = pares
    g.current = ganhoNo
    return () => {
      for (const x of pares) {
        x.a.pause()
        x.g.disconnect()
        x.a.src = ''
      }
      ganhoNo.disconnect()
      els.current = null
      g.current = null
    }
  }, [fundo])
  // o nível: a voz − fundo_db (a faixa está em `trilha_lufs`), o fader, o ducking e o fade do fim
  const base = p.cat && p.a && p.lufs != null ? p.lufs + p.cat.fundo_db - p.a.trilha_lufs + (p.a.escolhas.niveis.fundo ?? 0) : null
  const laco = p.a?.laco && p.a.laco.id === fundo ? p.a.laco : null
  useEffect(() => {
    const pares = els.current
    const gn = g.current
    if (!pares || !gn || !p.cat) return
    const agora = contexto().currentTime
    if (base != null) {
      const fade = Math.min(Math.max((p.duracao - p.tempo) / p.cat.fade_fundo, 0), 1)
      gn.gain.setTargetAtTime(ganho(base) * ganhoDucking(p.trechos, p.tempo, p.cat) * fade, agora, 0.02)
    }
    const tocar = p.tocando && base != null
    const pedacos = pedacosDoFundo(p.tempo, laco, p.cat.cruza_fundo)
    pares.forEach((x, k) => {
      const pd = pedacos.find((q) => q.el === k)
      x.a.playbackRate = p.velocidade
      x.g.gain.setTargetAtTime(pd?.ganho ?? 0, agora, 0.02)
      if (!pd) {
        // fora do crossfade: parado, à espera da próxima volta (no começo do laço)
        if (!x.a.paused) x.a.pause()
        const espera = laco?.ini ?? 0
        if (Math.abs(x.a.currentTime - espera) > 0.05) x.a.currentTime = espera
        return
      }
      if (Math.abs(x.a.currentTime - pd.pos) > (tocar ? 0.25 : 0.05)) x.a.currentTime = pd.pos
      if (tocar && x.a.paused) void x.a.play().catch(() => {})
      if (!tocar && !x.a.paused) x.a.pause()
    })
  }, [p.tempo, p.tocando, p.velocidade, base, laco, p.duracao, p.trechos, p.cat])
}
