/** Quantos segundos da linha do tempo estão à vista agora (a `LinhaBase` atualiza a cada zoom ou mudança de largura):
 *  o Shift+← / Shift+→ do editor pula 5% disso, como no 19 — um salto que acompanha o zoom. */
let visivel = 20

export const definirJanelaVisivel = (s: number) => {
  if (Number.isFinite(s) && s > 0) visivel = s
}

/** O salto do Shift+setas: 5% do que está à vista, nunca menos que 0,2 s. */
export const saltoDaLinha = () => Math.max(visivel * 0.05, 0.2)
