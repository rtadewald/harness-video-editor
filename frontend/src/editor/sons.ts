import { createContext, useContext, useEffect, useRef } from 'react'
import { json } from '@/api'
import { criarLoja } from './loja'
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
export type EventoSom = { t: number; som: string; ganho: number; desde: number; dur?: number; vel?: number }

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
    return { t, som: info.id, ganho, desde, ...(Math.abs(vel - 1) > 0.01 ? { vel: +vel.toFixed(4) } : {}) }
  }
  const t = quando + s.atraso - (dur ? 0 : info.ataque)
  return { t: Math.max(t, 0), som: info.id, ganho, desde: Math.max(-t, 0), ...(dur ? { dur } : {}) }
}
/** Quanto um som pode desacelerar ou acelerar para abranger um movimento (além disso, o tom mudaria demais). */
const VEL: [number, number] = [0.65, 1.6]

/** Os sons de uma receita num insert de `dur` s (a receita já com as mídias, o formato e os ajustes): o instante de cada
 *  momento, card a card. Sons iguais no mesmo instante (cards que entram juntos) tocam uma vez só. */
export function eventosDaReceita(receita: Receita, dur: number, cat: Catalogo | null): EventoSom[] {
  if (!cat || !receita.sons?.length) return []
  const r = noTempo(receita, dur)
  const cards = r.cards.map((c) => ({ c, ...janela(c, dur) })).sort((a, b) => a.ini - b.ini)
  // o instante de cada momento e, nos que acompanham um movimento (o mergulho, o zoom na mídia), a duração dele
  const quando: Record<Momento, [number, number?][]> = { entrada: [], troca: [], saida: [], mergulho: [], zoom: [] }
  cards.forEach(({ c, ini, fim }, k) => {
    quando.entrada.push([ini + (c.entrada?.atraso?.pos ?? 0)])
    if (k > 0 && ini > cards[0].ini + 0.02) quando.troca.push([ini])
    // a saída: quando começa; o mergulho (zoom de saída): o golpe no fim do zoom e o som desde o começo dele
    if (c.saida) {
      if (c.saida.para.escala > 1.05) quando.mergulho.push([fim, c.saida.duracao])
      else quando.saida.push([fim - c.saida.duracao])
    }
    if (c.zoom) quando.zoom.push([ini + c.zoom.inicio + c.zoom.duracao, c.zoom.duracao])
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
const contexto = () => (ctx ??= new AudioContext())
function buffer(id: string) {
  if (!buffers.has(id))
    buffers.set(
      id,
      fetch(`/api/sons/${id}.m4a`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((b) => contexto().decodeAudioData(b))
        .catch(() => null),
    )
  return buffers.get(id)!
}
/** Baixa e decodifica os sons de antemão (o primeiro toque sai na hora). */
const precarregar = (ids: string[]) => ids.forEach((id) => void buffer(id))

/** Toca um evento agora, adiantado `atrasado` s (quem toca chegou depois do instante dele). */
export async function tocarEvento(e: EventoSom, atrasado = 0) {
  const b = await buffer(e.som)
  if (!b) return
  const c = contexto()
  if (c.state === 'suspended') await c.resume().catch(() => {})
  const vel = e.vel ?? 1
  const desde = e.desde + atrasado * vel // `desde` é no tempo do arquivo
  if (desde >= b.duration || (e.dur != null && atrasado >= e.dur)) return
  const fonte = c.createBufferSource()
  fonte.buffer = b
  fonte.playbackRate.value = vel
  const g = c.createGain()
  g.gain.value = e.ganho
  if (e.dur != null) {
    const fim = c.currentTime + e.dur - atrasado
    g.gain.setValueAtTime(e.ganho, Math.max(fim - Math.min(0.12, e.dur / 2), c.currentTime)) // o fade: no máximo metade do som
    g.gain.linearRampToValueAtTime(0, fim)
  }
  fonte.connect(g).connect(c.destination)
  tocando.add(fonte)
  fonte.onended = () => tocando.delete(fonte)
  fonte.start(0, desde, e.dur != null ? (e.dur - atrasado) * vel : undefined)
}

/** Para na hora todos os sons que estão soando (a prévia parou ou saiu da tela). */
export function pararSons() {
  for (const f of tocando) f.stop()
  tocando.clear()
}

/** Quanto os sons sobem ou descem na prévia de um projeto: as intensidades valem para uma voz no nível das referências;
 *  o projeto mede a voz do bruto e corrige (o mesmo fator que a exportação usa). Fora de um projeto, 1. */
export const FatorSom = createContext(1)
/** Um avanço maior que isso entre dois quadros é um pulo (arrastar o cursor), não a prévia andando. */
const SALTO = 0.5

/** Toca os `eventos` enquanto `rel` (s, no mesmo relógio) anda para a frente em passos de quadro: cada evento cujo
 *  instante foi cruzado desde o último quadro (os do zero também, quando o relógio sai do zero). Pular (arrastar o
 *  cursor, voltar) não toca nada. */
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
  useEffect(() => {
    if (ativo) precarregar([...new Set(chave.split(',').filter(Boolean).map((x) => x.split('@')[0]))])
  }, [ativo, chave])
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
  useEffect(() => {
    // quem acabou de aparecer tocando (o insert começou agora) conta desde um pouco antes do zero
    let a = antes.current ?? (ativo && rel < SALTO ? -0.001 : null)
    // o relógio da prévia às vezes volta alguns ms (o vídeo se ressincronizando): não é voltar, e não toca de novo
    if (a != null && rel < a && a - rel < 0.05) return
    antes.current = rel
    if (a != null && rel < a && rel < SALTO) a = -0.001 // voltou ao começo (um loop): o que está no zero toca de novo
    if (!ativo || a == null || rel <= a || rel - a > SALTO) return
    for (const e of eventos) if (e.t > a && e.t <= rel) void tocarEvento({ ...e, ganho: e.ganho * fator }, rel - e.t)
  }, [rel, ativo, eventos, fator])
}
