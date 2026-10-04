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

export type Etapa = 'cortes' | 'direcao' | 'inserts' | 'motion' | 'legenda'

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
/** Item (mock) da Direção visual: um plano-base ou um elemento sobreposto, preso às palavras. */
export type ItemDirecao = Item & { camada: 'plano' | 'elemento'; descricao?: string }
export type Timeline = { V1: Clipe[]; V2: Item[]; V3: Item[]; LEG: Legenda[]; DIR: ItemDirecao[] }

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
  /** Direção visual: modelo multimodal (OpenRouter) que analisa as referências e quadros por segundo de cada trecho. */
  modelo_direcao: string
  quadros_por_segundo: number
  /** Como a IA vê cada trecho: o vídeo com áudio (padrão) ou mosaicos de quadros com o tempo escrito. */
  formato_analise: 'video' | 'mosaico'
  grade_mosaico: '3x2' | '3x1'
  motores: Record<string, { nome: string; familia: string; chave: boolean | null }> }
export const lerConfig = () => fetch('/api/config').then(json<Config>)
export const salvarConfig = (mudancas: Partial<Omit<Config, 'motores'>>) =>
  fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mudancas) }).then(json<Config>)
/** Corta o intervalo (mesmo no meio de um trecho mantido) ou, com manter=true, devolve-o ao vídeo. */
export const cortarFaixa = (id: string, inicio: number, fim: number, manter: boolean) =>
  fetch(`/api/projetos/${id}/cortes/faixa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inicio, fim, manter }),
  }).then(json<{ ok: boolean }>)
export const recalcularCortes = (id: string) => post<Projeto>(`/api/projetos/${id}/cortes/recalcular`)

/** Vídeo já editado de Rodrigo, usado para treinar a Direção visual (SPEC §8.2.1). */
export type StatusReferencia = 'na_fila' | 'analisando' | 'a_revisar' | 'revisado' | 'erro'
export type Referencia = {
  id: string
  nome: string
  criado_em: string
  formato: 'vertical' | 'horizontal' | 'quadrado'
  video: { arquivo: string; nome_original: string; duracao: number; largura: number; altura: number }
  status: StatusReferencia
  erro: string | null
  analise?: { passos: Partial<Record<PassoReferencia, PassoAnalise>> }
}
export type PassoReferencia = 'proxy' | 'transcricao' | 'cenas' | 'analise' | 'montagem'
export type PassoAnalise = { status: 'pendente' | 'rodando' | 'pronto' | 'erro'; segundos?: number; progresso?: number; feitos?: number; total?: number; motor?: string; tokens?: number }

/** Item da direção de uma referência: plano-base (contíguos, cobrem o vídeo) ou elemento sobreposto. */
export type ItemRef = {
  id: string
  camada: 'plano' | 'elemento'
  tipo: string
  conteudo: 'insert' | 'motion' | null
  inicio: number
  fim: number
  descricao: string
  texto: string | null
  miniatura?: string
  miniatura_t?: number
  palavra_ini?: string | null
  palavra_fim?: string | null
}
export type Categorias = { planos: Record<string, string>; elementos: Record<string, string> }
export type Revisao = { referencia: Referencia; palavras: Palavra[]; itens: ItemRef[]; cortes: number[]; categorias: Categorias }
export const abrirRevisao = (id: string) => fetch(`/api/referencias/${id}/revisao`).then(json<Revisao>)
export const salvarDirecao = (id: string, itens: ItemRef[]) =>
  fetch(`/api/referencias/${id}/direcao`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens }) }).then(json<{ itens: ItemRef[] }>)
export const marcarRevisada = (id: string, revisado: boolean) =>
  fetch(`/api/referencias/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisado }) }).then(json<Referencia>)
export const reanalisarReferencia = (id: string, refazer = false) => post<Referencia>(`/api/referencias/${id}/analisar${refazer ? '?refazer=true' : ''}`)

export const listarReferencias = () => fetch('/api/referencias').then(json<Referencia[]>)
export const subirReferencias = (videos: File[]) => {
  const corpo = new FormData()
  videos.forEach((v) => corpo.append('videos', v))
  return fetch('/api/referencias', { method: 'POST', body: corpo }).then(json<{ criadas: Referencia[]; recusadas: { nome: string; motivo: string }[] }>)
}
export const apagarReferencia = (id: string) => fetch(`/api/referencias/${id}`, { method: 'DELETE' }).then(json<{ ok: boolean }>)
export const urlArquivoReferencia = (id: string, caminho: string) => `/api/referencias/${id}/arquivos/${caminho}`

/** Um plano-base de uma referência analisada, para a galeria de Referências. */
export type ClipeReferencia = {
  ref: string
  ref_nome: string
  revisado: boolean
  id: string
  tipo: string
  conteudo: 'insert' | 'motion' | null
  inicio: number
  fim: number
  descricao: string
  texto: string | null
  miniatura?: string
  fala: string
  /** Posição do plano no vídeo de origem: número (1…total) e fração do tempo onde começa. */
  numero: number
  total: number
  posicao: number
  palavras: number
  por_minuto: number | null
  /** Como o plano entra na fala (null no primeiro plano do vídeo). */
  entrada: { onde: string; frase: 'inicio' | 'meio' | null; palavra: string | null; ms: number | null } | null
  anterior: { tipo: string; duracao: number } | null
  seguinte: { tipo: string; duracao: number } | null
  elementos: { tipo: string; texto: string | null; inicio: number; fim: number }[]
  /** Marcado como preferência (guiará as IAs depois). */
  favorito: boolean
}
export const marcarFavorito = (ref: string, inicio: number, fim: number, favorito: boolean) =>
  fetch(`/api/referencias/${ref}/favorito`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inicio, fim, favorito }) }).then(
    json<{ favorito: boolean }>,
  )
/** Resumo do vídeo de origem de um clipe: todos os planos (para a faixa) e quanto do tempo cada categoria ocupa. */
export type OrigemClipe = { nome: string; duracao: number; revisado: boolean; planos: { id: string; tipo: string; inicio: number; fim: number }[]; proporcao: Record<string, number> }
export const listarClipes = () =>
  fetch('/api/referencias/clipes').then(
    json<{ clipes: ClipeReferencia[]; origens: Record<string, OrigemClipe>; categorias: Record<string, string>; elementos: Record<string, string> }>,
  )

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
