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

export type Etapa = 'cortes' | 'direcao' | 'inserts' | 'enriquecimento' | 'motion' | 'audio' | 'legenda'

export type Mensagem = {
  autor: 'criador' | 'agente'
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
  direcao?: DirecaoProjeto
}

/** Item da direção visual de um projeto: preso a palavras (+ deslocamento em s); os tempos no vídeo final são calculados. */
export type ItemDirecaoProjeto = {
  id: string
  camada: 'plano' | 'elemento'
  tipo: string
  conteudo: 'insert' | 'motion' | null
  palavra_ini: string
  palavra_fim: string
  off_ini: number
  off_fim: number
  texto: string | null
  descricao: string
}
/** Comentário do criador sobre a direção, num ponto do vídeo (preso a uma palavra + deslocamento em s). */
export type ComentarioDirecao = { id: string; palavra: string; off: number; texto: string; criado_em: string }
/** Uma versão da direção: v1 = diretora + formatadora; v2, v3… = corretora sobre `origem` + os comentários dela. */
export type VersaoDirecao = {
  n: number
  origem: number | null
  gerado_em?: string
  itens?: ItemDirecaoProjeto[]
  comentarios?: ComentarioDirecao[]
  /** Comentário geral usado ao gerar a versão seguinte a partir desta. */
  geral?: string | null
}
/** A direção do projeto: as versões e, no topo, os campos da versão aberta (`ativa`). */
export type DirecaoProjeto = {
  status: 'rodando' | 'pronto' | 'erro'
  erro?: string | null
  pedido?: { tipo: 'gerar' | 'corrigir'; de?: number } | null
  versoes?: VersaoDirecao[]
  ativa?: number
  n?: number
  origem?: number | null
  comentarios?: ComentarioDirecao[]
  geral?: string | null
  itens?: ItemDirecaoProjeto[]
  itens_ia?: ItemDirecaoProjeto[]
  modelo?: string
  exemplos?: number
  segundos?: number
  gerado_em?: string
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
/** `auto` existe só se o criador mexeu numa borda: guarda o que a IA tinha decidido. */
export type Clipe = Ancora & { id: string; fonte: string; inicio: number; fim: number; auto?: { inicio: number; fim: number } }
export type Item = Ancora & { id: string; rotulo: string }
export type Legenda = Ancora & { id: string; texto: string }
/** Item (mock) da Direção visual: um plano-base ou um elemento sobreposto, preso às palavras. */
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
export const gerarDirecao = (id: string) => post<Projeto>(`/api/projetos/${id}/direcao/gerar`)
/** O que foi enviado ao diretor e o que ele devolveu, na última geração (histórico em projetos/<id>/direcao_log/). */
export type RegistroDirecao = { gerado_em: string; etapa?: 'diretora' | 'corretora'; versao?: number; de?: number; modelo: string; raciocinio?: string; modelo_formatadora?: string; tokens: number | null; sistema: string; usuario: string; roteiro?: string; resposta: unknown; arquivo: string; total: number }
export const lerRegistroDirecao = (id: string, versao?: number) =>
  fetch(`/api/projetos/${id}/direcao/registro${versao != null ? `?versao=${versao}` : ''}`).then(json<RegistroDirecao>)
const enviar = <T,>(metodo: string, url: string, corpo?: unknown) =>
  fetch(url, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }).then(json<T>)
export const corrigirDirecao = (id: string, geral: string | null) => enviar<Projeto>('POST', `/api/projetos/${id}/direcao/corrigir`, { geral })
export const abrirVersaoDirecao = (id: string, n: number) => enviar<DirecaoProjeto>('PUT', `/api/projetos/${id}/direcao/versao`, { n })
export const comentarDirecao = (id: string, c: { palavra: string; off: number; texto: string }) => enviar<DirecaoProjeto>('POST', `/api/projetos/${id}/direcao/comentarios`, c)
export const editarComentarioDirecao = (id: string, cid: string, texto: string) => enviar<DirecaoProjeto>('PUT', `/api/projetos/${id}/direcao/comentarios/${cid}`, { texto })
export const excluirComentarioDirecao = (id: string, cid: string) => enviar<DirecaoProjeto>('DELETE', `/api/projetos/${id}/direcao/comentarios/${cid}`)
export const salvarDirecaoProjeto = (id: string, itens: ItemDirecaoProjeto[]) =>
  fetch(`/api/projetos/${id}/direcao`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itens }) }).then(json<DirecaoProjeto>)
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
  /** Quem é o criador e do que fala o canal: contexto para as IAs (opcional). */
  perfil_criador: string
  /** Modelo de texto que propõe a direção visual dos projetos. */
  modelo_direcao_projeto: string
  /** Quem escreve o roteiro dirigido dos projetos, e com quanto raciocínio. */
  modelo_diretora: string
  raciocinio_diretora: 'low' | 'medium' | 'high'
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

/** Vídeo já editado do criador, usado para calibrar a Direção visual (SPEC §8.2.1). */
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
export type PassoReferencia = 'proxy' | 'transcricao' | 'cenas' | 'analise' | 'montagem' | 'inserts'
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
export type TipoMidia = 'video' | 'imagem'
export type FormatoMidia = '16:9' | '16:10' | '4:3' | '1:1' | '4:5' | '3:4' | '9:16' | 'alto'
export const NOME_TIPO_MIDIA: Record<TipoMidia, string> = { video: 'vídeo', imagem: 'imagem' }
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

/** Roteiro dirigido de um vídeo da Calibragem: uma linha por corte de cena, com a marcação `[plano: …]` e a fala. */
export type LinhaRoteiro = { plano: string; tipo: string; inicio: number; fim: number; marcacao: string; fala: string }
export type RoteiroRef = { ref: string; nome: string; revisado: boolean; linhas: LinhaRoteiro[] }
export const lerRoteiro = (id: string) => fetch(`/api/referencias/${id}/roteiro`).then(json<{ referencia: Referencia; linhas: LinhaRoteiro[] }>)
/** Heurística da direção: as regras (Markdown editável) e os roteiros de exemplo (montados da análise). */
export type HeuristicaDirecao = { regras: string; gerado_em?: string; videos?: number; tem_anterior: boolean; roteiros: RoteiroRef[] }
export const lerHeuristica = () => fetch('/api/referencias/heuristica').then(json<HeuristicaDirecao>)
export const salvarHeuristica = (regras: string) =>
  fetch('/api/referencias/heuristica', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regras }) }).then(json<HeuristicaDirecao>)
export const sugerirRegras = () => post<HeuristicaDirecao>('/api/referencias/heuristica/sugerir')
export const voltarHeuristica = () => post<HeuristicaDirecao>('/api/referencias/heuristica/voltar')

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
/** 1:05,3 — minutos e segundos com uma casa, vírgula decimal. */
export const tempoBR = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0').replace('.', ',')}`

/** 0:12.4 — para a timeline e o player. */
export function formatarTempo(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}

// ---------------------------------------------------------------- Inserts e banco (SPEC §8.3)

/** Uma mídia do banco ligada a um insert: um original ou um trecho dele. */
export type MidiaLigada = { id: string; banco: string }
/** Um plano com insert da direção, com as mídias que o criador ligou. */
export type PedidoInsert = {
  id: string
  plano: string
  tipo: string
  formato: 'vertical' | 'dividida'
  descricao: string
  texto: string | null
  fala: string
  inicio: number
  duracao: number
  midias: MidiaLigada[]
  /** As capturas de site deste insert: as em andamento (várias podem rodar ao mesmo tempo) e as que falharam (§8.3). */
  capturas?: CapturaInsert[]
}
export type CapturaInsert = {
  id: string
  status: 'fila' | 'rodando' | 'pronto' | 'erro'
  url: string
  proporcao: ProporcaoCaptura
  dobras: number[]
  feitas: number
  erro: string | null
  duracao: number
}
export type ProporcaoCaptura = '16:9' | '4:3' | '1:1' | '9:16'
export const PROPORCOES_CAPTURA: ProporcaoCaptura[] = ['16:9', '4:3', '1:1', '9:16']
/** A página inteira numa imagem, para marcar as dobras (em px de CSS da janela). */
export type PreviaSite = { id: string; url: string; proporcao: ProporcaoCaptura; titulo: string; altura_pagina: number; largura_janela: number; altura_janela: number }
export type InsertsProjeto = { versao: number | null; pedidos: PedidoInsert[] }
/** Uma mídia do banco global. */
export type ItemBanco = {
  id: string
  nome: string
  descricao: string
  palavras: string[]
  tipo: TipoMidia
  formato: FormatoMidia
  largura: number | null
  altura: number | null
  duracao: number
  criado_em?: string
  origem: { tipo: 'upload' | 'captura automática' | 'captura de site'; nome_original?: string; url?: string | null; dobra?: number }
  ia: { status: 'fila' | 'rodando' | 'pronto' | 'erro' | 'pendente'; erro: string | null }
  descricao_ia?: string
  usos?: { projeto: string; nome: string; pedido: string; fala: string }[]
  /** Trecho de um vídeo: o original (pai) e o início e fim nele; herda descrição, palavras e formato. */
  pai?: string
  inicio?: number
  fim?: number
  nome_pai?: string
  /** Num vídeo original: os trechos dele. */
  trechos?: ItemBanco[]
  /** Corte das pontas do original, em segundo plano. */
  edicao?: { status: 'rodando' | 'pronto' | 'erro'; erro: string | null }
  /** Cortes já feitos no original (cada um muda o arquivo no mesmo endereço). */
  cortes?: { inicio: number; fim: number; em: string }[]
}
/** Muda a cada corte do original: vai no endereço do arquivo para o navegador não tocar o vídeo antigo do cache. */
export const versaoBanco = (i?: ItemBanco) => (i?.cortes?.length ? `?v=${i.cortes.length}` : '')

export const lerInserts = (id: string) => fetch(`/api/projetos/${id}/inserts`).then(json<InsertsProjeto>)
export const definirMidias = (id: string, pid: string, midias: Omit<MidiaLigada, 'id'>[] | MidiaLigada[]) =>
  enviar<InsertsProjeto>('PUT', `/api/projetos/${id}/inserts/${pid}/midias`, { midias })
export const listarBanco = (busca = '', tipo?: TipoMidia) =>
  fetch(`/api/banco?busca=${encodeURIComponent(busca)}${tipo ? `&tipo=${tipo}` : ''}`).then(json<ItemBanco[]>)
export const subirNoBanco = (arquivos: File[]) => {
  const corpo = new FormData()
  arquivos.forEach((a) => corpo.append('arquivos', a))
  return fetch('/api/banco', { method: 'POST', body: corpo }).then(json<ItemBanco[]>)
}
export const lerItemBanco = (bid: string) => fetch(`/api/banco/${bid}`).then(json<ItemBanco>)
export const editarItemBanco = (bid: string, campos: { nome?: string; descricao?: string; palavras?: string[]; inicio?: number; fim?: number }) =>
  enviar<ItemBanco>('PUT', `/api/banco/${bid}`, campos)
export const criarTrecho = (bid: string, f: { inicio: number; fim: number; nome?: string }) => enviar<ItemBanco>('POST', `/api/banco/${bid}/trechos`, f)
export const cortarOriginal = (bid: string, f: { inicio: number; fim: number }) => enviar<ItemBanco>('POST', `/api/banco/${bid}/cortar`, f)
export const urlBancoTira = (bid: string) => `/api/banco/${bid}/tira`
export const apagarItemBanco = (bid: string) => enviar<{ ok: boolean }>('DELETE', `/api/banco/${bid}`)
export const descreverItemBanco = (bid: string) => enviar<ItemBanco>('POST', `/api/banco/${bid}/descrever`)
export const previaSite = (id: string, url: string, proporcao: ProporcaoCaptura) =>
  enviar<PreviaSite>('POST', `/api/projetos/${id}/inserts/captura/previa`, { url, proporcao })
export const urlPreviaSite = (id: string, cid: string) => `/api/projetos/${id}/inserts/captura/previa/${cid}`
export const capturarSite = (id: string, pid: string, c: { url: string; proporcao: ProporcaoCaptura; dobras: number[]; titulo?: string; duracao?: number }) =>
  enviar<InsertsProjeto>('POST', `/api/projetos/${id}/inserts/${pid}/captura`, c)
export const urlBancoArquivo = (bid: string) => `/api/banco/${bid}/arquivo`
export const urlBancoMiniatura = (bid: string) => `/api/banco/${bid}/miniatura`
