import { useEffect, useState } from 'react'

/** Projetos abertos como abas (na barra de cima de todas as telas), guardados neste navegador. */
export type AbaProjeto = { id: string; nome: string }
const CHAVE = 'abas.projetos'
const EVENTO = 'abas-projetos'

function ler(): AbaProjeto[] {
  try {
    const l = JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
    return Array.isArray(l) ? l.filter((a) => a && typeof a.id === 'string') : []
  } catch {
    return []
  }
}

function gravar(l: AbaProjeto[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(l))
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  window.dispatchEvent(new Event(EVENTO))
}

/** Abre (ou atualiza o nome de) uma aba de projeto. */
export function abrirAba(a: AbaProjeto) {
  const l = ler()
  const k = l.findIndex((x) => x.id === a.id)
  if (k >= 0 && l[k].nome === a.nome) return
  gravar(k >= 0 ? l.map((x) => (x.id === a.id ? a : x)) : [...l, a])
}

export function fecharAba(id: string) {
  gravar(ler().filter((x) => x.id !== id))
}

export function useAbasProjetos(): AbaProjeto[] {
  const [abas, setAbas] = useState(ler)
  useEffect(() => {
    const atualizar = () => setAbas(ler())
    window.addEventListener(EVENTO, atualizar)
    window.addEventListener('storage', atualizar)
    return () => {
      window.removeEventListener(EVENTO, atualizar)
      window.removeEventListener('storage', atualizar)
    }
  }, [])
  return abas
}
