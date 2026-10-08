import { useEffect, useState } from 'react'

/** Um dado global que vem do servidor uma vez e é compartilhado entre telas (a configuração das transições, os
 *  presets): `use()` assina e recebe as mudanças; `definir` troca para todos (ao salvar, ou na prévia de um slider). */
export function criarLoja<T>(carregar: () => Promise<T>) {
  let valor: T | null = null
  let pedido: Promise<T> | null = null
  const ouvintes = new Set<(v: T) => void>()
  const definir = (v: T) => {
    valor = v
    ouvintes.forEach((f) => f(v))
    return v
  }
  const recarregar = () => (pedido = carregar().then(definir))
  function use(): T | null {
    const [v, setV] = useState(valor)
    useEffect(() => {
      ouvintes.add(setV)
      if (valor == null) void (pedido ?? recarregar())
      else setV(valor)
      return () => void ouvintes.delete(setV)
    }, [])
    return v
  }
  return { use, get: () => valor, definir, recarregar }
}
