/* Runtime dos motions (SPEC §8.5). O motion (escrito pela IA) monta uma timeline do GSAP pausada e a entrega com
 * `motion.pronto(tl)`. Quem manda no tempo é o app: `window.__ir(t)` leva a cena ao instante t (s) — a timeline, e os
 * vídeos com `data-inicio` (o instante da cena em que começam) — e resolve quando tudo está pintado. A duração do plano
 * pode mudar depois: a timeline é esticada ou encolhida na proporção. */
(function () {
  var M = window.MOTION || {}
  var tl = null
  var esperando = []
  window.motion = {
    pronto: function (t) {
      tl = t
      tl.pause(0)
      esperando.splice(0).forEach(function (f) { f() })
    },
  }
  function quadro() {
    return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r) }) })
  }
  function videosProntos(t) {
    var vs = Array.prototype.slice.call(document.querySelectorAll('video'))
    return Promise.all(vs.map(function (v) {
      var ini = parseFloat(v.getAttribute('data-inicio') || '0')
      var base = parseFloat(v.getAttribute('data-desde') || '0') // trechos: o início do trecho no arquivo
      v.muted = true
      v.pause()
      var alvo = Math.max(0, t - ini) + base
      if (v.duration) alvo = Math.min(alvo, v.duration - 0.01)
      return new Promise(function (r) {
        var ok = function () { r() }
        if (Math.abs(v.currentTime - alvo) > 0.001) {
          v.addEventListener('seeked', ok, { once: true })
          v.addEventListener('error', ok, { once: true })
          v.currentTime = alvo
          setTimeout(ok, 3000)
        } else if (v.readyState >= 2) r()
        else {
          v.addEventListener('loadeddata', ok, { once: true })
          v.addEventListener('error', ok, { once: true })
          setTimeout(ok, 3000)
        }
      })
    }))
  }
  window.__ir = function (t) {
    var feito = function () {
      if (!tl) return Promise.resolve()
      var dur = tl.duration() || 1
      var escala = M.duracao ? dur / M.duracao : 1 // a duração do plano manda
      tl.time(Math.max(0, Math.min(t * escala, dur)), false)
      return Promise.all([document.fonts.ready, videosProntos(t)]).then(quadro)
    }
    // um motion que nunca chama motion.pronto (erro no código) não pode travar a prévia nem a exportação
    var limite = new Promise(function (r) { setTimeout(r, 8000) })
    return Promise.race([tl ? feito() : new Promise(function (r) { esperando.push(function () { feito().then(r) }) }), limite])
  }
})()
