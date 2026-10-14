/** A revisão de Rodrigo e as respostas do Claude (docs/editor-claude.md §6, E8). */
import { enviar, json } from '@/api'

export type StatusComentario = 'pendente' | 'aplicado' | 'respondido' | 'nao_aplicado'
/** Um comentário da revisão: num instante (`t`), num trecho (`t`–`fim`) ou geral (sem tempo); preso às palavras (a âncora
 *  que vale para o Claude) e ao plano. `responde`: a resposta a uma dúvida do Claude. */
export type Comentario = {
  id: string
  t: number | null
  fim: number | null
  palavra: string | null
  palavra_fim?: string | null
  fala: string
  plano?: string | null
  texto: string
  anexos?: string[]
  geral?: boolean
  responde?: string
  criado_em: string
  status: StatusComentario
  resposta: string | null
}
export type Revisao = { versao: number; aprovado: boolean; aprovado_em?: string; enviado_em: string | null; comentarios: Comentario[] }
/** Uma dúvida que o Claude deixou na versão, presa às palavras. */
export type Duvida = { id: string; palavra: string; palavra_fim: string; texto: string; fala: string }

export const lerRevisao = (id: string, versao?: number) =>
  fetch(`/api/projetos/${id}/revisao${versao ? `?versao=${versao}` : ''}`).then(json<{ versao: number; revisao: Revisao; duvidas: Duvida[]; texto: string }>)
export const salvarRevisao = (id: string, n: number, comentarios: Comentario[]) => enviar<Revisao>('PUT', `/api/projetos/${id}/revisao/${n}`, { comentarios })
export const enviarRevisao = (id: string, n: number) => enviar<{ texto: string; revisao: Revisao }>('POST', `/api/projetos/${id}/revisao/${n}/enviar`)
export const aprovarVersao = (id: string, n: number) => enviar<{ texto: string; revisao: Revisao }>('POST', `/api/projetos/${id}/revisao/${n}/aprovar`)
/** Um print ou vídeo (o arquivo cru no corpo); devolve o caminho dentro do projeto. */
export const anexarRevisao = (id: string, n: number, comentario: string, arquivo: File) =>
  fetch(`/api/projetos/${id}/revisao/${n}/anexo?comentario=${comentario}`, { method: 'POST', headers: { 'Content-Type': arquivo.type }, body: arquivo }).then(
    json<{ caminho: string }>,
  )
export const apagarAnexoRevisao = (id: string, n: number, caminho: string) =>
  void fetch(`/api/projetos/${id}/revisao/${n}/anexo?caminho=${encodeURIComponent(caminho)}`, { method: 'DELETE' }).catch(() => undefined)
