export type Fonte = {
  id: string
  papel: 'bruto' | 'apoio'
  arquivo: string
  nome_original: string
  duracao: number
  largura?: number
  altura?: number
  tem_audio: boolean
}

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
}

export type Palavra = { id: string; texto: string; inicio: number; fim: number }

/** Itens das trilhas ficam presos a palavras (SPEC §9); o tempo na saída é sempre calculado. */
export type Ancora = { palavra_ini: string; palavra_fim: string }
export type Clipe = Ancora & { id: string; fonte: string; inicio: number; fim: number }
export type Item = Ancora & { id: string; rotulo: string }
export type Legenda = Ancora & { id: string; texto: string }
export type Timeline = { V1: Clipe[]; V2: Item[]; V3: Item[]; LEG: Legenda[] }

export type DadosEditor = { projeto: Projeto; palavras: Palavra[]; timeline: Timeline; mock: boolean }

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

/** 0:12.4 — para a timeline e o player. */
export function formatarTempo(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
