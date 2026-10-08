# Motions (SPEC §8.5)

A especificação dos motions mora aqui, fora da SPEC, para quem trabalha neles editar só este arquivo (a SPEC tem só o
resumo e o link). Mesmas regras da SPEC: atualizar junto com o código, decisões de Rodrigo com data.

## Onde fica o código

| Parte | Arquivo |
|---|---|
| Presets, página do motion, uso no plano | `backend/app/motions.py` |
| Rotas | `backend/app/rotas_motions.py` |
| Testes | `backend/tests/test_motions.py` |
| Os presets (um arquivo cada) | `frontend/public/motion/presets/*.html` |
| Runtime, GSAP e fontes | `frontend/public/motion/` |
| API no front | `frontend/src/motions/api.ts` |
| Card do plano na etapa Inserts (abas Preset e Vídeo) | `frontend/src/motions/PainelMotion.tsx`, `frontend/src/motions/PresetMotion.tsx`, `frontend/src/motions/useMotionsDoProjeto.ts` |
| Motion tocando no lugar (prévia, miniaturas e exportação) | `frontend/src/motions/MotionNoLugar.tsx` |
| Página Motions (galeria dos presets, `/motions`) | `frontend/src/motions/PaginaMotions.tsx` |

Pontos de ligação com o resto (mexer só no necessário e avisar no commit): `editor/EtapaInserts.tsx` (o card e a prévia
no plano), `editor/LinhaInserts.tsx` (a trilha Mídias), `paginas/Render.tsx` (a exportação) e `main.py` (o router).

## Especificação

✅ **Presets e vídeo (decisão de Rodrigo, out/2026):** o fluxo de gerar motions por IA ficava complexo demais para o app.
No app ficam só coisas simples, de poucos elementos e poucos segundos; o que for mais elaborado é feito fora e entra como
vídeo. Num plano de motion (`motion_tela_cheia`, `tela_dividida_motion`) há dois caminhos:
- **Preset:** uma animação pronta em HTML + CSS + GSAP, **escrita à mão** a partir de uma referência, em que o criador
  troca só os campos (textos, imagem do banco) e escolhe o **fundo** (um dos 5 dos inserts: verde claro, papel, névoa azul,
  chuva, gradiente escuro; cada preset sugere um). Presets novos entram como arquivos novos.
- **Vídeo:** um vídeo do banco (subido ali ou escolhido; um trecho vale) que ocupa o palco e **entra e sai seco**, como um insert.

**Formato da página** (o mesmo da 1ª versão, que vinha do HyperFrames: cena = página web): o fragmento é posto num palco de
1080×1920 (tela cheia) ou 1080×960 (tela dividida: a metade de cima, com o ator descendo embaixo), com fundo transparente
— o fundo escolhido é desenhado atrás pelo app (`MotionNoLugar` usa o `Fundo` dos inserts, chuva em vídeo inclusive).
O preset monta uma timeline do GSAP pausada com `MOTION.duracao` (a do plano) e a entrega com `motion.pronto(tl)`; quem
manda no tempo é o app (`window.__ir(t)` no runtime: posiciona a timeline, os vídeos com `data-inicio` e o que foi
registrado em `motion.aCada`, espera fontes e vídeos e responde depois de pintar; 8 s de limite se o preset quebrar).
Cada preset declara `<script type="application/json" id="preset">` (nome, descrição, fundo sugerido, duração de
referência) e `id="campos"` (tipos `texto`, `cor`, `imagem`; o de imagem guarda o id do banco e chega à página como URL).
Os dados chegam em `MOTION.campos`, `MOTION.fala`, `MOTION.largura/altura/duracao`.

**Digitação** (`motion.digitar(texto, ini, fim)` no runtime; decisão de Rodrigo: "só se for a mesma palavra"): se as
palavras do texto são ditas em sequência na fala do plano (sem diferença de maiúsculas, acentos e pontuação), cada uma é
digitada enquanto é falada; senão, ritmo constante entre `ini` e `fim`. A fala do plano vai na URL da página (`fala`).

**Fontes:** Inter e Instrument Serif locais (OFL). As da Apple (SF Pro, SF Pro Rounded e SF Mono), as mais parecidas com
as das referências (pedido de Rodrigo), são lidas do próprio Mac pelo backend (`/api/motions/fonte/{pro|rounded|mono}`,
de `/System/Library/Fonts`): o Chromium não as acha pelo nome e elas não podem ir para o git.

**Curvas (medidas, out/2026):** Rodrigo achou a 1ª versão dura. Medindo as referências quadro a quadro (posição, escala,
opacidade e nitidez) e ajustando uma cubic-bezier a cada movimento, todas caem na mesma família: **entrada curta e suave
e chegada bem longa**, perto de `(0.25, 0.1, 0.1, 1)` em 0,8 a 1 s — nada de expo.out curto. O runtime tem
`motion.curva(x1, y1, x2, y2)` (cubic-bezier como ease do GSAP).

**A cena nunca para (Rodrigo, out/2026: "suave e contínua, leve e elegante"):** nas referências, depois da entrada,
alguma coisa segue andando devagar até o corte — o afastamento do prompt termina **ainda andando** (curva com velocidade
final ≠ 0) e o Claude Code desliza acelerando. Ficar parado depois de uma freada é o que dava a sensação de "travar".
A digitação (`motion.digitar(texto, ini, fim, ritmo)`) vem em rajadas: um ritmo por letra, pausas depois de vírgula e
ponto seguidos de espaço (dentro de um link, não) e, sempre depois das mesmas palavras, pausas curtas (a exportação sai igual à prévia).

**Presets (out/2026), medidos quadro a quadro nas referências:**
- `claude-code` (52_processo_ds, 2,6 s): a janela do terminal (título, mascote em pixel art, "Claude Code / Opus…",
  linha do prompt, "auto mode on") entra com 922×782 e cresce ×1,63 em ~1,05 s, curva `(0.25, 0, 0.15, 1)`, com a origem
  perto da borda esquerda, na altura do meio da tela, até passar da borda direita. A digitação começa em ~0,2 s, a ~14
  letras por segundo. Durante ela a cena **desliza** para a esquerda acompanhando o cursor (não há zoom na digitação: a
  altura da janela fica fixa): até ~48% da largura o cursor anda sozinho; dali a cena desliza acelerando e o cursor vai
  encostando em ~88%, sem parar de vez. Depois de ~0,65 s a cena desliza para a esquerda com velocidade crescente
  (aceleração medida de ~164 px/s², o deslocamento cresce como ~82·(t − 0,65)² px) até acompanhar a digitação; quando a
  digitação acaba, a velocidade cai devagar para um deslize lento que segue até o corte (o cursor nunca passa de 90%).
  Na tela dividida, a mesma composição (mesma largura e zoom, passando da borda direita), com a janela mais baixa
  (500 px naturais; o prompt e o rodapé presos embaixo) — antes ela cabia inteira, estreita, e Rodrigo achou errado.
  Campo: o que é digitado.
- `prompt` (52_processo_ds, 2,5 s): caixa de prompt branca (920 px, cantos de 44, texto SF Pro de 45 px, ícones,
  "Import" e "Send" laranja) com a base parada a ~60% da altura; as linhas novas crescem para cima, de uma vez. A cena
  começa a 1,25× (o card passa das bordas) e **se afasta o plano inteiro** com a curva `(0.2, 0.05, 0.1, 0.45)`: arranca
  devagar, acelera até ~0,5 s e segue lenta e constante até o corte, sem frear. A digitação (~0,018 s por letra, em
  rajadas) começou antes do corte. Campo: o que é digitado.
- `lettering` (48_image_to_html, 1 s): a frase no centro, uma palavra por vez (~0,22 s entre elas), já no lugar final:
  cada uma sobe 0,5 em (~45 px) em ~0,7 s, curva `(0.05, 0.2, 0.15, 1)`; opacidade em ~0,35 s; desfoque de 10 px some em
  ~0,35 s (na de destaque, 0,45 s); sem escala. A última, de destaque, em SF Pro Rounded, um pouco maior e mais clara.
  Frases longas diminuem até caber em 2 linhas. Campos: texto e palavra de destaque.
- `site`, "Barra de busca" (cursor_free_v2): uma lupa quadrada surge suave (cresce de 86%, aparece e desfoca para nítido,
  ~0,6 s, sem passar do ponto); em 0,3 s a barra se abre devagar até a largura final (~1,1 s) enquanto o link é digitado
  dentro, em rajadas. A cena inteira se aproxima de 1 a 1,08× o plano todo e termina ainda andando. Rodrigo (out/2026):
  não precisa abrir o site depois — saíram o card e a página. Campo: o link.

**Na etapa Inserts:** num plano de motion, o card da esquerda tem as abas **Preset** e **Vídeo** (um ponto marca a que
está em uso). Preset: a grade dos presets fica sempre à vista (miniatura parada perto do fim; com o mouse em cima, toca
em loop; a em uso fica marcada) — clicar põe no plano ou troca; "Tirar". Os **campos e o fundo** ficam num card recolhível
**na coluna ao lado do vídeo**, como o do comentário (pedido de Rodrigo): a prévia muda na hora e grava 0,35 s depois. Vídeo: "Subir vídeo"
(ou arrastar), "Escolher do banco". O plano guarda `projeto.motions[plano]`: `{tipo: 'preset', preset, valores, fundo}`
ou `{tipo: 'video', banco}`, com `nome`, `formato` e `usado_em`. O preset é **referenciado**, não copiado: melhorar um
preset muda os vídeos que o usam. A trilha Mídias mostra "✦ nome" ou "+ motion"; a prévia toca o motion no lugar do
plano (tela dividida: o ator desce).

**Página Motions** (`/motions`, link na barra de cima, com ícone como os outros): a galeria dos presets, em tela cheia
ou dividida, tocando com o mouse em cima, com nome, descrição, campos e duração. A miniatura parada usa o instante que o
preset pede (`"miniatura"` no `id="preset"`, fração da duração; padrão 0,8).

**Exportação:** a página de render põe o mesmo `MotionNoLugar` (com o fundo e a fala) nos planos com motion; os vídeos do
banco em qualidade de exportação; a foto espera o motion pintar o instante. Motion nunca é tratado como quadro parado.

**Rotas:** `GET /api/motions/presets`, `GET /api/motions/presets/{id}/pagina?formato=&duracao=&valores=&fala=`,
`GET /api/motions/fonte/{nome}`; `GET /api/projetos/{id}/motions`, `PUT …/motions/{plano} {tipo, formato, preset|banco,
valores, fundo}`, `PATCH …/motions/{plano} {valores, fundo}`, `DELETE …/motions/{plano}`,
`GET …/motions/{plano}/pagina?duracao=&fala=&exportacao=`.

💡 **Histórico:** a 1ª versão (out/2026) tinha a IA escrevendo cada motion (Opus via OpenRouter, ficha de identidade,
referências da Calibragem, conferência por quadros, biblioteca com versões em `motions/`). Saiu com a decisão acima; a
pasta `motions/` ficou no disco, sem uso.

⏳ Em aberto: o card de Enriquecimento à direita ainda mostra, num motion, as grades "só para ver" (o motion entra e sai
seco); fundos novos próprios dos motions (ex.: o céu da referência do Claude Code); mais presets conforme Rodrigo pedir;
motions sobre inserts (caixas sobre elementos de um site capturado).
