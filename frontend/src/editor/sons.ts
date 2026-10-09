import { createContext, useContext, useEffect, useRef } from 'react'
import { json } from '@/api'
import { criarLoja } from './loja'
import { bezier } from './curvas'
import type { Curva } from './enriquecimento'
import { janela, noTempo, type Receita } from './presets'

/** Sons de apoio (SPEC §8.6): a biblioteca do time (cliques, pops, whooshes, risers, digitação), cortada e no mesmo
 *  volume, servida pelo backend. Um preset tem **momentos de som** (`receita.sons`): em cada um, qual som e com que
 *  intensidade. Daqui saem os eventos (o instante de cada som no insert) que a prévia toca e a exportação mistura. */
export type Momento = 'entrada' | 'troca' | 'saida' | 'mergulho' | 'zoom'
export type Intensidade = 'baixo' | 'medio'
/** `atraso`: onde o golpe do som cai em relação ao momento (s; negativo: antes). */
export type SomMomento = { momento: Momento; som: string | null; intensidade: Intensidade; atraso: number }
export type SomCatalogo = { id: string; nome: string; familia: string; duracao: number; ataque: number }
export type Catalogo = { sons: SomCatalogo[]; intensidades: Record<Intensidade, number> }
/** Um som no tempo: começa em `t` (s, no relógio de quem toca), tocando o arquivo a partir de `desde` (s do arquivo), com
 *  `ganho`; opcional, por no máximo `dur` s (com um fade curto) e na velocidade `vel` (o som esticado ou encolhido para
 *  abranger um movimento; como numa fita, o tom acompanha). */
export type EventoSom = { t: number; som: string; ganho: number; desde: number; dur?: number; vel?: number; grupo?: 'transicoes' }

export const NOME_MOMENTO: Record<Momento, string> = {
  entrada: 'Entrada de cada card',
  troca: 'Troca (cada mídia nova)',
  saida: 'Saída',
  mergulho: 'Mergulho (acompanha o zoom do começo ao fim)',
  zoom: 'Zoom na mídia (acompanha o zoom)',
}
export const NOME_INTENSIDADE: Record<Intensidade, string> = { baixo: 'Baixo', medio: 'Médio' }

const loja = criarLoja(() => fetch('/api/sons').then(json<Catalogo>))
export const useCatalogoSons = loja.use
export const carregarCatalogoSons = () => loja.get() ?? loja.recarregar()

const escala = (r: Receita) => r.cards.some((c) => c.saida && c.saida.para.escala > 1.05)
/** Os momentos que existem numa receita (só esses aparecem para escolher som). */
export function momentosDaReceita(r: Receita): Momento[] {
  const cs = r.cards
  return [
    'entrada',
    (cs.length > 1 || r.repete) && 'troca',
    cs.some((c) => c.saida && c.saida.para.escala <= 1.05) && 'saida',
    escala(r) && 'mergulho',
    cs.some((c) => c.zoom) && 'zoom',
  ].filter(Boolean) as Momento[]
}

/** O som de um momento já no relógio: começa de modo que o golpe (`ataque`) caia em `quando + atraso`; se isso ficaria
 *  antes do zero, toca o arquivo já adiantado. Com `dur` (um som que acompanha algo, como a digitação), começa no
 *  momento e dura isso. */
export function eventoNoTempo(s: { som: string | null; intensidade: Intensidade; atraso: number }, quando: number, cat: Catalogo, dur?: number, abrange?: number): EventoSom | null {
  const info = s.som ? cat.sons.find((x) => x.id === s.som) : null
  if (!info) return null
  const ganho = cat.intensidades[s.intensidade] ?? 0.3
  if (abrange && abrange > 0.05) {
    // o som abrange um movimento (o mergulho): o golpe cai no fim (`quando`) e o começo do som, no começo do movimento —
    // o som acelera ou desacelera (0,65× a 1,6×) para caber; se o movimento é curto demais, começa já adiantado no arquivo
    const golpe = quando + s.atraso
    const vel = Math.min(Math.max(info.ataque / abrange, VEL[0]), VEL[1])
    let t = golpe - Math.min(info.ataque / vel, abrange)
    let desde = Math.max(info.ataque - abrange * vel, 0)
    if (t < 0) {
      desde -= t * vel
      t = 0
    }
    // depois do golpe, o rabo do som some com o movimento: um rabo longo é cortado em `RABO` s (com o fade do fim); um
    // curto termina sozinho (cortá-lo poria o fade em cima do golpe)
    const rabo = (info.duracao - info.ataque) / vel
    const corte = rabo > RABO ? { dur: +(golpe - t + RABO).toFixed(4) } : {}
    return { t, som: info.id, ganho, desde, ...corte, ...(Math.abs(vel - 1) > 0.01 ? { vel: +vel.toFixed(4) } : {}) }
  }
  const t = quando + s.atraso - (dur ? 0 : info.ataque)
  return { t: Math.max(t, 0), som: info.id, ganho, desde: Math.max(-t, 0), ...(dur ? { dur } : {}) }
}
/** Quanto do som toca depois do golpe, num som que abrange um movimento (s): o movimento acabou, o som acaba junto. */
const RABO = 0.15
/** Quanto um som pode desacelerar ou acelerar para abranger um movimento (além disso, o tom mudaria demais). */
const VEL: [number, number] = [0.65, 1.6]

/** Quando (fração da duração) um movimento com a curva `curva` parece parado: chegou a 95% do caminho. Uma curva que
 *  freia no fim leva o último pedaço quase sem se mexer (no Mergulho, 22% do tempo para os últimos 5%), e o golpe do
 *  som que acompanha o movimento tem de cair quando ele para aos olhos — senão o som segue crescendo com o zoom parado. */
export function paradoAos(curva: Curva | undefined, alvo = 0.95): number {
  if (!curva) return 1
  const f = bezier(...curva)
  for (let k = 1; k <= 100; k++) if (f(k / 100) >= alvo) return k / 100
  return 1
}

/** Os sons de uma receita num insert de `dur` s (a receita já com as mídias, o formato e os ajustes): o instante de cada
 *  momento, card a card. Sons iguais no mesmo instante (cards que entram juntos) tocam uma vez só. */
export function eventosDaReceita(receita: Receita, dur: number, cat: Catalogo | null): EventoSom[] {
  if (!cat || !receita.sons?.length) return []
  const r = noTempo(receita, dur)
  const cards = r.cards.map((c) => ({ c, ...janela(c, dur) })).sort((a, b) => a.ini - b.ini)
  // o instante de cada momento e, nos que acompanham um movimento (o mergulho, o zoom na mídia), a duração dele
  const quando: Record<Momento, [number, number?][]> = { entrada: [], troca: [], saida: [], mergulho: [], zoom: [] }
  // uma saída que só desliza e, na tela toda, amplia junto para não descobrir o fundo (`divisao.saidaCobrindo`) continua
  // com o som de saída: o preset não tem o momento do mergulho
  const temMergulho = (r.sons ?? []).some((s) => s.momento === 'mergulho')
  cards.forEach(({ c, ini, fim }, k) => {
    quando.entrada.push([ini + (c.entrada?.atraso?.pos ?? 0)])
    if (k > 0 && ini > cards[0].ini + 0.02) quando.troca.push([ini])
    // a saída: quando começa; o mergulho (zoom de saída): o som abrange o zoom de verdade — a janela da escala dentro da
    // saída (`atraso.escala` e `dur.escala`; o resto da saída o card fica parado) —, com o golpe no fim do zoom
    if (c.saida) {
      if (c.saida.para.escala > 1.05 && temMergulho) {
        const atraso = c.saida.atraso?.escala ?? 0
        const d = c.saida.dur?.escala ?? c.saida.duracao - atraso
        // o golpe quando o zoom para aos olhos (a curva freia no fim), não no fim da conta
        const visto = d * paradoAos(c.saida.curvas.escala ?? c.saida.curvas.pos)
        quando.mergulho.push([fim - c.saida.duracao + atraso + visto, visto])
      } else quando.saida.push([fim - c.saida.duracao])
    }
    if (c.zoom) {
      const visto = c.zoom.duracao * paradoAos(c.zoom.curva)
      quando.zoom.push([ini + c.zoom.inicio + visto, visto])
    }
  })
  const out: EventoSom[] = []
  for (const s of r.sons ?? [])
    for (const [q, abrange] of quando[s.momento] ?? []) {
      const e = eventoNoTempo(s, q, cat, undefined, abrange)
      if (e && e.t < dur && !out.some((o) => o.som === e.som && Math.abs(o.t - e.t) < 0.04)) out.push(e)
    }
  return out.sort((a, b) => a.t - b.t)
}

// ---------------------------------------------------------------- tocar (Web Audio)

let ctx: AudioContext | null = null
const tocando = new Set<AudioBufferSourceNode>() // os sons soando agora (para poder parar todos)
const buffers = new Map<string, Promise<AudioBuffer | null>>()
/** O contexto de áudio da prévia (um só: os sons, a voz e o fundo passam pelo mesmo mixer). */
export const contexto = () => (ctx ??= new AudioContext())
/** Os faders dos sons na prévia (docs/audio.md): os de apoio dos presets e os das transições, cada grupo no seu ganho. */
const barramentos = new Map<'presets' | 'transicoes', GainNode>()
export function barramento(grupo: 'presets' | 'transicoes') {
  let g = barramentos.get(grupo)
  if (!g) {
    g = contexto().createGain()
    g.connect(contexto().destination)
    barramentos.set(grupo, g)
  }
  return g
}
function buffer(id: string) {
  if (!buffers.has(id))
    buffers.set(
      id,
      fetch(`/api/sons/${id}.m4a`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((b) => decodificador().decodeAudioData(b))
        .catch(() => null),
    )
  return buffers.get(id)!
}
let offline: OfflineAudioContext | null = null
/** Quem decodifica: o contexto da prévia, se já existe; senão um offline (baixar de antemão, antes de qualquer clique,
 *  não cria o da prévia: criado sem um gesto ele nasce suspenso e o navegador reclama). O som decodificado toca em
 *  qualquer contexto. */
const decodificador = (): BaseAudioContext => ctx ?? (offline ??= new OfflineAudioContext(1, 1, 48000))
/** Acorda o áudio de antemão, já no 1º gesto na página (um clique, uma tecla): o dispositivo leva ~0,1–0,2 s para ligar
 *  e, ligado só no 1º som, o pop do começo (0,1 s) já tinha passado quando o áudio acordava. Sem gesto ainda, espera o
 *  primeiro (criado antes, o navegador o deixaria suspenso e reclamaria). */
function aquecerAudio() {
  const ja = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive
  const acordar = () => {
    const c = contexto()
    if (c.state === 'suspended') void c.resume().catch(() => {})
  }
  if (ja) return acordar()
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, acordar, { once: true, capture: true })
}
/** Baixa e decodifica os sons de antemão (o primeiro toque sai na hora, inteiro). */
export const precarregarSons = (ids: Iterable<string>) => {
  let algum = false
  for (const id of ids) {
    algum = true
    void buffer(id)
  }
  if (algum) aquecerAudio()
}

/** Toca um evento agora, adiantado `atrasado` s (quem toca chegou depois do instante dele). `noRelogio`: o som segue um
 *  relógio que anda (a prévia); ouvir um som solto (a escolha do som) toca do começo. */
export async function tocarEvento(e: EventoSom, atrasado = 0, noRelogio = true) {
  // baixar, decodificar e acordar o áudio levam tempo (no 1º toque, dezenas de ms): o relógio andou junto, e o som entra
  // adiantado o mesmo tanto, para o golpe cair no lugar
  const t0 = performance.now()
  const b = await buffer(e.som)
  if (!b) return
  const c = contexto()
  if (c.state === 'suspended') await c.resume().catch(() => {})
  if (noRelogio) atrasado += (performance.now() - t0) / 1000
  // ainda não chegou a hora (atrasado negativo): entra daqui a pouco, do começo, em vez de pedir ao áudio um ponto antes
  // do início do arquivo (o navegador recusa, e a fonte nunca começada não pode ser parada depois)
  const espera = Math.max(-atrasado, 0)
  atrasado = Math.max(atrasado, 0)
  const vel = e.vel ?? 1
  const desde = e.desde + atrasado * vel // `desde` é no tempo do arquivo
  if (desde >= b.duration || (e.dur != null && atrasado >= e.dur)) return
  const fonte = c.createBufferSource()
  fonte.buffer = b
  fonte.playbackRate.value = vel
  const g = c.createGain()
  g.gain.value = e.ganho
  const quando = c.currentTime + espera
  if (e.dur != null) {
    const fim = quando + e.dur - atrasado
    g.gain.setValueAtTime(e.ganho, Math.max(fim - Math.min(0.12, e.dur / 2), quando)) // o fade: no máximo metade do som
    g.gain.linearRampToValueAtTime(0, fim)
  }
  fonte.connect(g).connect(barramento(e.grupo === 'transicoes' ? 'transicoes' : 'presets'))
  try {
    fonte.start(quando, desde, e.dur != null ? (e.dur - atrasado) * vel : undefined)
  } catch {
    fonte.disconnect()
    return
  }
  // o registro dos testes de ponta a ponta (só existe quando o teste o cria): o que de fato começou a soar
  ;(window as Window & { __sonsLog?: unknown[] }).__sonsLog?.push({ som: e.som, t: e.t, atrasado: atrasado - espera, grupo: e.grupo ?? null })
  // só a fonte que começou entra na lista do que está soando (parar uma que nunca começou é um erro)
  tocando.add(fonte)
  fonte.onended = () => tocando.delete(fonte)
}

/** Para na hora todos os sons que estão soando (a prévia parou ou saiu da tela). Um som que já tinha acabado não
 *  derruba os outros (nem a tela: quem chama costuma ser um efeito do React). */
export function pararSons() {
  for (const f of tocando) {
    try {
      f.stop()
    } catch {
      // já parado
    }
  }
  tocando.clear()
}

/** Quanto os sons sobem ou descem na prévia de um projeto: as intensidades valem para uma voz no nível das referências;
 *  o projeto mede a voz do bruto e corrige (o mesmo fator que a exportação usa). Fora de um projeto, 1. */
export const FatorSom = createContext(1)
/** Um avanço maior que isso entre dois quadros é um pulo (arrastar o cursor), não a prévia andando. */
const SALTO = 0.5
/** Até quanto tempo depois de começar um som ainda pode estar soando (os de apoio duram poucos segundos). */
const SOANDO = 6

/** Toca os `eventos` enquanto `rel` (s, no mesmo relógio) anda para a frente em passos de quadro: cada evento cujo
 *  instante foi cruzado desde o último quadro (os do zero também, quando o relógio sai do zero). Pular (arrastar o
 *  cursor, voltar) não toca nada. Ao dar play com o cursor parado no meio de um som (um riser que começa antes do corte),
 *  ele entra já adiantado, como se a prévia viesse tocando: no 1º quadro com `ativo`, `rel` tem de ser o ponto de onde o
 *  play sai (quem toca de outro ponto que o quadro parado, como o loop da página Presets, liga `ativo` já nele). */
export function useSonsNoTempo(eventos: EventoSom[], rel: number, ativo: boolean, tardios = false) {
  const antes = useRef<number | null>(null)
  const fator = useContext(FatorSom)
  // parou de tocar (pause, modal fechado): o que estava soando para junto. Um insert que só sai da tela com a prévia
  // andando não corta o som (ele atravessa o corte, como na exportação)
  const tocava = useRef(ativo)
  useEffect(() => {
    if (tocava.current && !ativo) pararSons()
    tocava.current = ativo
  }, [ativo])
  const chave = eventos.map((e) => `${e.som}@${e.t.toFixed(2)}`).join()
  // os arquivos já ao montar (parado também): o 1º play não espera baixar e decodificar
  useEffect(() => precarregarSons(new Set(chave.split(',').filter(Boolean).map((x) => x.split('@')[0]))), [chave])
  // `tardios`: os eventos podem chegar depois que o relógio já andou (as marcas de um motion só vêm quando a página dele
  // carrega): quando chegam, o que ainda estaria soando entra já adiantado
  const chegaram = useRef(chave)
  useEffect(() => {
    const vazio = !chegaram.current
    chegaram.current = chave
    if (!tardios || !vazio || !chave || !ativo || antes.current == null) return
    const agora = antes.current
    for (const e of eventos) if (e.t <= agora && agora < e.t + (e.dur ?? 0.25)) void tocarEvento({ ...e, ganho: e.ganho * fator }, agora - e.t)
  }, [chave, ativo, eventos, fator, tardios])
  const ativoAntes = useRef(false)
  useEffect(() => {
    const comecou = ativo && !ativoAntes.current
    ativoAntes.current = ativo
    // quem acabou de aparecer tocando (o insert começou agora) conta desde um pouco antes do zero
    let a = antes.current ?? (ativo && rel < SALTO ? -0.001 : null)
    // tocando, o relógio da prévia às vezes volta alguns ms (o vídeo se ressincronizando): não é voltar, e não toca de
    // novo. Parado, qualquer volta conta (um clique na régua logo antes de onde se pausou é o novo ponto do play)
    if (ativo && !comecou && a != null && rel < a && a - rel < 0.05) return
    // um pulo com a prévia andando (clicar num corte, arrastar o cursor): entra como um play naquele ponto, com o que
    // estaria soando ali já adiantado (antes, um riser que começa antes do ponto nunca tocava). A volta ao começo de um
    // loop (abaixo de SALTO) segue a regra do loop
    const pulou = ativo && !comecou && a != null && a > 0 && (rel - a > SALTO || (a - rel >= 0.05 && rel >= SALTO))
    // parado no zero (o começo do insert, um R): os sons do zero ficam para quando o relógio sair dele (senão, parado
    // ali, o "antes" virava 0 e o som do instante 0 nunca era cruzado)
    if (rel <= 0) {
      antes.current = -0.001
      return
    }
    antes.current = rel
    // o play com o cursor parado no meio (o 1º quadro tocando é o ponto do play): o que começou até aqui e ainda estaria
    // soando entra adiantado, como se a prévia viesse tocando (até onde o som vai, `tocarEvento` confere pelo arquivo).
    // Quem toca passa, nesse 1º quadro, o instante de onde o play sai (não o quadro parado de antes)
    if ((comecou && a != null && a > 0) || pulou) {
      for (const e of eventos) if (e.t <= rel && rel - e.t < SOANDO && (e.dur == null || rel < e.t + e.dur)) void tocarEvento({ ...e, ganho: e.ganho * fator }, rel - e.t)
      return
    }
    if (a != null && rel < a && rel < SALTO) a = -0.001 // voltou ao começo (um loop): o que está no zero toca de novo
    if (!ativo || a == null || rel <= a || rel - a > SALTO) return
    for (const e of eventos) if (e.t > a && e.t <= rel) void tocarEvento({ ...e, ganho: e.ganho * fator }, rel - e.t)
  }, [rel, ativo, eventos, fator])
}
