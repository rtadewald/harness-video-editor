import { useState } from 'react'

/** Um booleano lembrado neste navegador. */
export function useLembrado(chave: string, padrao: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const x = localStorage.getItem(chave)
      return x == null ? padrao : x === '1'
    } catch {
      return padrao
    }
  })
  const mudar = (novo: boolean) => {
    setV(novo)
    try {
      localStorage.setItem(chave, novo ? '1' : '0')
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
  return [v, mudar]
}
