import { useContext, useEffect, useRef, type RefObject } from 'react'
import { LookAtor, tabelaLut, useCatalogoLook, type Look } from './look'

const VERTICE = `#version 300 es
in vec2 p;
out vec2 vUv;
void main() { vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`

// o mesmo que o ffmpeg faz (look.py): o LUT trilinear, misturado com o original pela intensidade, e a vinheta multiplicada
// (a mesma elipse e o mesmo smoothstep da máscara), sobre os valores RGB do vídeo
const FRAGMENTO = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
out vec4 cor;
uniform sampler2D uVideo;
uniform sampler3D uLut;
uniform float uTemLut, uK, uN, uVinheta;
uniform vec2 uEscala, uDesloca;
uniform vec4 uForma; // cy, rx, ry, ini
uniform float uFim;
void main() {
  vec4 c = texture(uVideo, vUv * uEscala + uDesloca);
  vec3 rgb = c.rgb;
  if (uTemLut > 0.5) rgb = mix(rgb, texture(uLut, rgb * ((uN - 1.0) / uN) + 0.5 / uN).rgb, uK);
  float d = length(vec2((vUv.x - 0.5) / uForma.y, (vUv.y - uForma.x) / uForma.z));
  float s = clamp((d - uForma.w) / (uFim - uForma.w), 0.0, 1.0);
  rgb *= 1.0 - uVinheta * s * s * (3.0 - 2.0 * s);
  cor = vec4(rgb, c.a);
}`

type Gl = { gl: WebGL2RenderingContext; prog: WebGLProgram; buf: WebGLBuffer | null; video: WebGLTexture; lut: WebGLTexture; uni: Record<string, WebGLUniformLocation | null> }

function montar(canvas: HTMLCanvasElement): Gl | null {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true, antialias: false })
  if (!gl || gl.isContextLost()) return null
  const sh = (tipo: number, src: string) => {
    const s = gl.createShader(tipo)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  const shaders = [sh(gl.VERTEX_SHADER, VERTICE), sh(gl.FRAGMENT_SHADER, FRAGMENTO)]
  for (const s of shaders) gl.attachShader(prog, s)
  gl.linkProgram(prog)
  for (const s of shaders) gl.deleteShader(s) // ficam com o programa enquanto ele existir
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const tex = (unidade: number) => {
    const t = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0 + unidade)
    gl.bindTexture(unidade === 0 ? gl.TEXTURE_2D : gl.TEXTURE_3D, t)
    const alvo = unidade === 0 ? gl.TEXTURE_2D : gl.TEXTURE_3D
    gl.texParameteri(alvo, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(alvo, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(alvo, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(alvo, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (unidade) gl.texParameteri(alvo, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
    return t
  }
  const video = tex(0)
  const lut = tex(1)
  const uni: Gl['uni'] = {}
  for (const n of ['uVideo', 'uLut', 'uTemLut', 'uK', 'uN', 'uVinheta', 'uEscala', 'uDesloca', 'uForma', 'uFim']) uni[n] = gl.getUniformLocation(prog, n)
  gl.uniform1i(uni.uVideo, 0)
  gl.uniform1i(uni.uLut, 1)
  return { gl, prog, buf, video, lut, uni }
}

/** O ator com o look (LUT + vinheta) desenhado por cima do próprio vídeo, num canvas WebGL do mesmo tamanho, que segue
 *  o vídeo em tudo (posição, transformação, recorte): o vídeo continua tocando e recebendo os cliques, só fica invisível.
 *  Com um look que não muda nada (Sem LUT e Sem vinheta, ou o "ver sem o look"), desenha do mesmo jeito: o <video> puro
 *  sai mais claro que o mesmo quadro passado pelo WebGL (o navegador trata a cor dele por outro caminho), e trocar de
 *  caminho faria a comparação mostrar essa diferença como se fosse do look. Sem look (fora do editor) ou sem WebGL, não
 *  desenha nada (o vídeo aparece como sempre). `posX`: o object-position horizontal (0–1). */
export default function CanvasLook(p: { video: RefObject<HTMLVideoElement | null>; posX?: number; look?: Look | null }) {
  const doEditor = useContext(LookAtor)
  const look = p.look !== undefined ? p.look : doEditor
  const cat = useCatalogoLook()
  const canvas = useRef<HTMLCanvasElement>(null)
  const ativo = !!look && !!cat
  // o que muda sem remontar o WebGL (o slider da intensidade, trocar o look): lido a cada quadro
  const atual = useRef({ look, cat, posX: p.posX })
  useEffect(() => {
    atual.current = { look, cat, posX: p.posX }
  })

  useEffect(() => {
    const c = canvas.current
    const v = p.video.current
    if (!ativo || !c || !v) return
    const g = montar(c)
    if (!g) return
    const { gl, uni } = g
    let carregado: string | null = null // o LUT que está na textura
    let pedido: string | null = null
    let parar = false
    const opacidade = v.style.opacity
    let id = 0
    const quadro = () => {
      id = requestAnimationFrame(quadro)
      const { look: lk, cat: ct, posX } = atual.current
      if (!lk || !ct) return
      // segue o vídeo: o mesmo transform, a mesma origem e o mesmo recorte (a tela dividida, a janela do ator)
      for (const k of ['transform', 'transformOrigin', 'clipPath'] as const) if (c.style[k] !== v.style[k]) c.style[k] = v.style[k]
      if (lk.lut && lk.lut !== pedido) {
        pedido = lk.lut
        const nome = lk.lut
        void tabelaLut(nome).then((t) => {
          if (parar || !t || pedido !== nome) return
          gl.activeTexture(gl.TEXTURE1)
          gl.bindTexture(gl.TEXTURE_3D, g.lut)
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, t.n, t.n, t.n, 0, gl.RGB, gl.FLOAT, t.dados)
          gl.uniform1f(uni.uN, t.n)
          carregado = nome
        })
      }
      if (v.readyState < 2 || !v.videoWidth) return
      const w = v.clientWidth
      const h = v.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      v.style.opacity = '0'
      // o recorte do object-fit: cover (com o object-position horizontal)
      const s = Math.max(w / v.videoWidth, h / v.videoHeight)
      const dw = v.videoWidth * s
      const dh = v.videoHeight * s
      const ox = (w - dw) * (posX ?? 0.5)
      const oy = (h - dh) * 0.5
      const f = ct.forma
      gl.viewport(0, 0, c.width, c.height)
      gl.uniform2f(uni.uEscala, w / dw, h / dh)
      gl.uniform2f(uni.uDesloca, -ox / dw, -oy / dh)
      gl.uniform4f(uni.uForma, f.cy, f.rx, f.ry, f.ini)
      gl.uniform1f(uni.uFim, f.fim)
      gl.uniform1f(uni.uTemLut, lk.lut && carregado === lk.lut ? 1 : 0)
      gl.uniform1f(uni.uK, lk.intensidade)
      gl.uniform1f(uni.uVinheta, ct.vinhetas[lk.vinheta] ?? 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, g.video)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    id = requestAnimationFrame(quadro)
    return () => {
      parar = true
      cancelAnimationFrame(id)
      v.style.opacity = opacidade
      // libera o que este efeito criou; o contexto fica com o canvas (no StrictMode o efeito roda de novo no mesmo
      // canvas, e um contexto perdido não volta) e só é largado quando o canvas saiu da página
      gl.deleteTexture(g.video)
      gl.deleteTexture(g.lut)
      gl.deleteBuffer(g.buf)
      gl.deleteProgram(g.prog)
      setTimeout(() => {
        if (!c.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext()
      })
    }
  }, [ativo, p.video])

  if (!ativo) return null
  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" />
}
