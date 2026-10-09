/** Texto para comparar numa busca: minúsculas e sem acentos ("codigo" acha "código"). */
export function paraBusca(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
