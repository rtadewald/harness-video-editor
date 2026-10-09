import { useEffect, useRef } from 'react'

/** Quando os atalhos de teclado das telas devem ficar quietos (ou soltar o controle focado para agir). */

// tipos de <input> em que a tecla não escreve nada: neles, espaço e setas seguem para os atalhos da tela
const NAO_TEXTO = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'])

/** A tecla é do campo focado (digitar ou escolher numa lista): texto, número, área de texto, select ou editável. Caixas
 *  de marcar e botões não contam: depois de um clique neles, espaço e setas continuam sendo do player. Num slider, as
 *  setas são dele (o ajuste fino, passo a passo: a Posição do preset, o Look) e o espaço continua do player — passe a
 *  `tecla` para contar isso. */
export function emCampoDeTexto(alvo: EventTarget | null, tecla?: string) {
  const el = alvo as HTMLElement | null
  if (!el?.closest) return false
  if (el.closest('textarea, select, [contenteditable]:not([contenteditable="false"])')) return true
  const input = el.closest('input')
  if (input?.type === 'range' && tecla?.startsWith('Arrow')) return true
  return !!input && !NAO_TEXTO.has(input.type)
}

/** Há um modal aberto (marcado com data-modal: o Modal do app, os de etapa e o Dialog de components/ui, como o das
 *  Configurações): as teclas são dele, não da tela de trás. */
export function modalAberto() {
  return !!document.querySelector('[data-modal]')
}

/** Tira o foco do botão, caixa ou slider que recebeu a tecla, para ele não agir também (o espaço clicaria o botão e
 *  marcaria a caixa ao soltar a tecla). */
export function soltarFoco(alvo: EventTarget | null) {
  if (alvo instanceof HTMLElement && alvo !== document.body) alvo.blur()
}

/** Esc fecha o modal (o de cima, se houver um dentro do outro), a menos que um campo dentro dele já tenha usado a tecla
 *  (com preventDefault). Devolve a ref para o fundo do modal, que leva data-modal. */
export function useFecharComEsc(fechar: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const abertos = document.querySelectorAll('[data-modal]')
      if (abertos[abertos.length - 1] === ref.current) fechar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [fechar])
  return ref
}
