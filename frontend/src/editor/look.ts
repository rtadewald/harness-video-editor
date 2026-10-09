import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { enviar, json } from '@/api'
import { criarLoja } from './loja'

/** O look do ator (docs/preprocessamento.md, "Look"): um LUT 3D com intensidade e a vinheta. A tabela (o `.cube`) e a
 *  fórmula da vinheta são as mesmas do backend (`look.py`), então a prévia (WebGL, `CanvasLook`) sai igual ao MP4. */
export type Look = { lut: string | null; intensidade: number; vinheta: 'sem' | 'leve' | 'normal' | 'forte' }
export type CatalogoLook = {
  luts: { id: string; nome: string }[]
  vinhetas: Record<Look['vinheta'], number>
  forma: { cy: number; rx: number; ry: number; ini: number; fim: number }
  padrao: Look
}

const loja = criarLoja(() => fetch('/api/look').then(json<CatalogoLook>))
export const useCatalogoLook = loja.use

/** O look que vale no editor aberto (o player e as cópias do ator o usam; null: fora do editor, o vídeo puro). */
export const LookAtor = createContext<Look | null>(null)

/** Look nenhum (sem LUT, sem vinheta): no editor, o "segure para ver sem o look" usa este em vez de null, para a prévia
 *  continuar no mesmo caminho (o canvas WebGL) e a comparação mostrar só o look, não a diferença de cor do navegador. */
export const SEM_LOOK: Look = { lut: null, intensidade: 0, vinheta: 'sem' }

/** O look de um projeto, como mudá-lo (muda na tela na hora; o servidor recebe junto) e como só ver uma mudança na tela,
 *  sem gravar (o slider da intensidade durante o arraste). */
export function useLookDoProjeto(id: string): [Look | null, (c: Partial<Look>) => void, (c: Partial<Look>) => void] {
  const [look, setLook] = useState<Look | null>(null)
  useEffect(() => {
    let vivo = true
    void fetch(`/api/projetos/${id}/look`)
      .then(json<Look>)
      .then((l) => vivo && setLook(l))
      .catch(() => {})
    return () => void (vivo = false)
  }, [id])
  // a resposta do servidor só vale se nada mudou na tela depois do pedido (senão o slider voltaria para trás)
  const mudancas = useRef(0)
  const ver = useCallback((c: Partial<Look>) => {
    mudancas.current++
    setLook((l) => (l ? { ...l, ...c } : l))
  }, [])
  const mudar = useCallback(
    (c: Partial<Look>) => {
      ver(c)
      const n = mudancas.current
      void enviar<Look>('PUT', `/api/projetos/${id}/look`, { campos: c })
        .then((l) => n === mudancas.current && setLook(l))
        .catch((e) => window.alert((e as Error).message))
    },
    [id, ver],
  )
  return [look, mudar, ver]
}

/** Um `.cube` lido: o tamanho e os valores RGB (o vermelho varia mais rápido, depois o verde e o azul). */
export type TabelaLut = { n: number; dados: Float32Array }
const tabelas = new Map<string, Promise<TabelaLut | null>>()
export function tabelaLut(lut: string): Promise<TabelaLut | null> {
  if (!tabelas.has(lut))
    tabelas.set(
      lut,
      fetch(`/api/look/${lut}.cube`)
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((t) => {
          let n = 0
          const v: number[] = []
          for (const linha of t.split('\n')) {
            const l = linha.trim()
            if (l.startsWith('LUT_3D_SIZE')) n = Number(l.split(/\s+/)[1])
            else if (/^[-\d.]/.test(l)) v.push(...l.split(/\s+/).map(Number))
          }
          return n && v.length === n * n * n * 3 ? { n, dados: new Float32Array(v) } : null
        })
        .catch(() => null),
    )
  return tabelas.get(lut)!
}
