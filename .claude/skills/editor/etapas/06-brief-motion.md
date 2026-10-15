Escreva um preset de motion novo em {raiz}/frontend/public/motion/presets/{preset}.html (id: {preset}).
Leia antes: {raiz}/.claude/skills/editor/aprendizados/motions.md; a identidade
(`cd "{raiz}" && uv run --project backend python ferramentas/app.py identidade`); os recusados e o motivo de cada um
(`app.py motions-recusados`), para não repetir; e frontend/public/motion/presets/prompt.html, lettering.html,
pipeline-voz.html e frontend/public/motion/runtime.js: copie a estrutura (<script type="application/json" id="preset">
com nome, descricao, fundo, duracao, sons e "a_revisar": true; <script id="campos">; <style>; a timeline do GSAP
pausada entregue com motion.pronto(tl)).
Pedido: {pedido}
Formato: {formato} ({palco}) · duração ~{duracao} s (o runtime estica para a duração do plano) · fala: "{fala}"
{extra}
Regras: poucos elementos; quase nenhum texto além de rótulos curtos (campos editáveis com esses padrões); curva longa
e suave (perto de 0.25,0.1,0.1,1 em 0,8–1 s), nunca linear; a cena nunca para até o corte; fontes Inter, Instrument
Serif ou SF Pro; sons só do catálogo do app; cards de vidro e o fundo `chuva` (a identidade). Texto legível num
celular (não menor que ~28 px no palco de 1080). No formato vertical, deixe livre a faixa do meio da altura (~45–55%):
a legenda do app passa ali.
Teste: com o app no ar, fotografe com Playwright a página do preset
(http://localhost:5173 serve /motion/runtime.js; a página: http://localhost:8000/api/motions/presets/{preset}/pagina?formato={formato}&duracao={duracao})
em 4 instantes (o runtime expõe window.__ir(t)); olhe as imagens e corrija até ficar limpo e legível.
Não use `app.py motions-usar` (quem edita liga ao plano); não edite outros arquivos. Responda com o id, os campos e 1
linha sobre como ficou.
