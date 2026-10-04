export type Fonte = {
  id: string
  papel: 'bruto' | 'apoio'
  arquivo: string
  nome_original: string
  duracao: number
  largura?: number
  altura?: number
  tem_audio: boolean
  proxy?: string
}

/** Uma transcrição do mesmo áudio por um motor (Whisper + stable-ts, Parakeet, ElevenLabs…). */
export type Transcricao = {
  nome: string
  /** Motores da mesma família têm o mesmo texto e IDs: trocar entre eles só muda os tempos. */
  familia: string
  status: 'pendente' | 'rodando' | 'pronto' | 'erro' | 'sem_chave'
  segundos?: number
  palavras?: number
  erro?: string | null
  aviso?: string | null
}

export type Passo = { status: 'pendente' | 'rodando' | 'pronto' | 'erro'; segundos?: number; progresso?: number; aviso?: string; pulado?: boolean }
export type Pipeline = { passos: Partial<Record<'proxy' | 'transcricao' | 'alinhamento' | 'silencios' | 'cortes' | 'variantes', Passo>>; erro: string | null }

export type Etapa = 'cortes' | 'inserts' | 'motion' | 'legenda'

export type Mensagem = {
  autor: 'rodrigo' | 'agente'
  texto: string
  ferramentas: string[]
  mock: boolean
  criado_em: string
}

export type Projeto = {
  id: string
  nome: string
  criado_em: string
  fontes: Fonte[]
  briefing: { texto: string; audio: string | null }
  enquadramento: { x: number }
  etapas: Record<Etapa, string>
  chats: Record<Etapa, Mensagem[]>
  pipeline?: Pipeline
  transcricoes: Record<string, Transcricao>
  transcricao_ativa: string
}

export type Palavra = {
  id: string
  texto: string
  inicio: number
  fim: number
  /** Tempos originais do Whisper, antes do refinamento (para comparar na tela). */
  inicio_whisper?: number
  fim_whisper?: number
  mantida?: boolean
}
export type Silencio = { inicio: number; fim: number; dur: number }
export type Duvida = { ini: string; fim: string; motivo: string }

/** Itens das trilhas ficam presos a palavras (SPEC §9); o tempo na saída é sempre calculado. */
export type Ancora = { palavra_ini: string; palavra_fim: string }
/** `auto` existe só se Rodrigo mexeu numa borda: guarda o que a IA tinha decidido. */
export type Clipe = Ancora & { id: string; fonte: string; inicio: number; fim: number; auto?: { inicio: number; fim: number } }
export type Item = Ancora & { id: string; rotulo: string }
export type Legenda = Ancora & { id: string; texto: string }
export type Timeline = { V1: Clipe[]; V2: Item[]; V3: Item[]; LEG: Legenda[] }

export type DadosEditor = { projeto: Projeto; palavras: Palavra[]; silencios: Silencio[]; timeline: Timeline; duvidas: Duvida[] }
export type Picos = { por_segundo: number; picos: number[] }

export type ResumoProjeto = Pick<Projeto, 'id' | 'nome' | 'criado_em' | 'etapas'> & { duracao: number | null; apoios: number }

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.detail ?? `Erro ${r.status}`)
  return r.json()
}

export const listarProjetos = () => fetch('/api/projetos').then(json<ResumoProjeto[]>)
export const abrirProjeto = (id: string) => fetch(`/api/projetos/${id}`).then(json<Projeto>)
export const abrirEditor = (id: string) => fetch(`/api/projetos/${id}/editor`).then(json<DadosEditor>)
export const enviarMensagem = (id: string, etapa: Etapa, texto: string) =>
  fetch(`/api/projetos/${id}/chat/${etapa}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto }),
  }).then(json<Mensagem[]>)
const post = <T,>(url: string) => fetch(url, { method: 'POST' }).then(json<T>)
export const processar = (id: string) => post<Projeto>(`/api/projetos/${id}/processar`)
export const renomearProjeto = (id: string, nome: string) =>
  fetch(`/api/projetos/${id}/nome`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }) }).then(json<Projeto>)
export const refazerCortes = (id: string) => post<Projeto>(`/api/projetos/${id}/cortes/refazer`)

/** O pipeline principal terminou (ou parou em erro)? Os motores extras rodam à parte e não contam. */
export const emAndamento = (p: Projeto) =>
  !p.pipeline?.erro &&
  Object.entries(p.pipeline?.passos ?? {}).some(([nome, s]) => nome !== 'variantes' && (s.status === 'pendente' || s.status === 'rodando'))

export const abrirPicos = (id: string) => fetch(`/api/projetos/${id}/arquivos/picos.json`).then(json<Picos>)
export const ajustarClipe = (id: string, cid: string, lado: 'inicio' | 'fim', t: number) =>
  fetch(`/api/projetos/${id}/clipes/${cid}/ajustar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lado, t }),
  }).then(json<{ ok: boolean }>)
export const restaurarClipe = (id: string, cid: string) => post<{ ok: boolean }>(`/api/projetos/${id}/clipes/${cid}/restaurar`)

export const ativarTranscricao = (id: string, vid: string) => post<Projeto>(`/api/projetos/${id}/transcricoes/${vid}/ativar`)
export const rodarMotor = (id: string, vid: string) => post<Projeto>(`/api/projetos/${id}/transcricoes/rodar?vid=${vid}`)
export type TranscricaoCompleta = { id: string; nome: string; familia: string; palavras: Palavra[] }
export const abrirTranscricao = (id: string, vid: string) => fetch(`/api/projetos/${id}/transcricoes/${vid}`).then(json<TranscricaoCompleta>)

/** Os motores extras ainda estão trabalhando? (não impede de editar) */
export const motoresRodando = (p: Projeto) =>
  p.pipeline?.passos?.variantes?.status === 'rodando' || Object.values(p.transcricoes ?? {}).some((t) => t.status === 'rodando')

/** Preferências do app. `chave`: se a API key do motor está no .env (null = o motor não precisa de chave). */
export type Config = {
  motor_padrao: string
  /** Ar que fica depois da última palavra de um trecho (= antes do corte) e antes da primeira do seguinte (= depois do corte). */
  antes_do_corte_ms: number
  depois_do_corte_ms: number
  /** Pausas dentro de um trecho que passam disso são encurtadas para `respiro_ms` (0 = nunca encurtar). */
  pausa_max_ms: number
  respiro_ms: number
  motores: Record<string, { nome: string; familia: string; chave: boolean | null }> }
export const lerConfig = () => fetch('/api/config').then(json<Config>)
export const salvarConfig = (mudancas: Partial<Pick<Config, 'motor_padrao' | 'antes_do_corte_ms' | 'depois_do_corte_ms' | 'pausa_max_ms' | 'respiro_ms'>>) =>
  fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mudancas) }).then(json<Config>)
/** Corta o intervalo (mesmo no meio de um trecho mantido) ou, com manter=true, devolve-o ao vídeo. */
export const cortarFaixa = (id: string, inicio: number, fim: number, manter: boolean) =>
  fetch(`/api/projetos/${id}/cortes/faixa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inicio, fim, manter }),
  }).then(json<{ ok: boolean }>)
export const recalcularCortes = (id: string) => post<Projeto>(`/api/projetos/${id}/cortes/recalcular`)

export const urlMiniatura = (id: string) => `/api/projetos/${id}/miniatura`
export const urlArquivo = (id: string, caminho: string) => `/api/projetos/${id}/arquivos/${caminho}`

/** XHR em vez de fetch para ter progresso do upload (brutos 4K são grandes). */
export function criarProjeto(dados: FormData, aoProgredir: (pct: number) => void): Promise<Projeto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/projetos')
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgredir((e.loaded / e.total) * 100)
    xhr.onload = () => {
      const corpo = JSON.parse(xhr.responseText || 'null')
      xhr.status < 300 ? resolve(corpo) : reject(new Error(corpo?.detail ?? `Erro ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Sem conexão com o backend'))
    xhr.send(dados)
  })
}

export function formatarDuracao(s: number | null | undefined) {
  if (s == null) return '—'
  const t = Math.round(s)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** 27,512 — segundos com milissegundos, no formato brasileiro. */
export const ms3 = (s: number) => s.toFixed(3).replace('.', ',')

/** 0:12.4 — para a timeline e o player. */
export function formatarTempo(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
