# Motions (SPEC §8.5)

A especificação dos motions mora aqui, fora da SPEC, para quem trabalha neles editar só este arquivo (a SPEC tem só o
resumo e o link). Mesmas regras da SPEC: atualizar junto com o código, decisões de Rodrigo com data.

## Onde fica o código

| Parte | Arquivo |
|---|---|
| Geração, biblioteca, uso no plano | `backend/app/motions.py` |
| Rotas | `backend/app/rotas_motions.py` |
| Testes | `backend/tests/test_motions.py` |
| API no front | `frontend/src/motions/api.ts` |
| Modal (biblioteca, pedido, versões, campos) | `frontend/src/motions/ModalMotions.tsx` |
| Motion tocando no lugar (prévia e exportação) | `frontend/src/motions/MotionNoLugar.tsx` |
| Card do plano na etapa Inserts | `frontend/src/motions/PainelMotion.tsx`, `frontend/src/motions/useMotionsDoProjeto.ts` |
| Runtime, GSAP e fontes | `frontend/public/motion/` |

Pontos de ligação com o resto (mexer só no necessário e avisar no commit): `editor/EtapaInserts.tsx` (o card, o modal e
a prévia no plano), `editor/LinhaInserts.tsx` (a trilha Mídias), `paginas/Render.tsx` (a exportação),
`paginas/Configuracoes.tsx` (aba Motions), `projeto.py` (o modelo padrão) e `main.py` (Config e a retomada).

## Especificação

✅ **Primeira versão (out/2026; decisões de Rodrigo na rodada sobre motions):** motions são animações **escritas por IA em HTML + CSS + GSAP** (o formato do HyperFrames: cena = página web; sem React nem render próprio), tocadas **ao vivo** na prévia e fotografadas quadro a quadro na exportação, como os inserts (`motions.py`, `public/motion/`, `frontend/src/motions/`).
- **Contrato:** a IA devolve um fragmento (estilo + marcação + script) posto num palco de 1080×1920 (tela cheia) ou 1080×960 (tela dividida: a metade de cima, com o ator descendo embaixo). Monta uma timeline do GSAP pausada e a entrega com `motion.pronto(tl)`; quem manda no tempo é o app (`window.__ir(t)` no runtime: posiciona a timeline e os vídeos com `data-inicio`, espera fontes e vídeos e responde depois de pintar; um motion que nunca chama `pronto` não trava nada — 8 s de limite). Se a direção mudar a duração do plano, a timeline estica ou encolhe na proporção. Fontes locais: Inter e Instrument Serif (`public/motion/fonts`, OFL); GSAP 3 local.
- **Campos (templates):** o próprio motion declara os campos editáveis (`<script type="application/json" id="campos">`: textos e cores, com rótulo e padrão) e lê os valores de `MOTION.campos`. Reaproveitar = trocar os campos, sem IA; a prévia muda na hora.
- **Biblioteca** global (`motions/<id>/`, fora do git): `motion.json` (nome, formato, duração, favorito, o pedido, as versões, a ativa, os valores, o status) e `v{n}.html` + `v{n}.jpg` (miniatura). Versões como na Direção: v1, depois "Gerar a próxima versão" com um comentário, a partir da aberta. Favoritos sobem na lista e viram **exemplos em código** para os próximos pedidos (até 2).
- **Geração** (segundo plano, ~90 s medido): o modelo de motion (`modelo_motion`, padrão `anthropic/claude-opus-5.5` no OpenRouter; uma versão custa por volta de US$ 0,20–0,40) recebe o contrato, a **ficha de identidade** (`identidade_motion`, nas Configurações; a 1ª versão — extremamente minimalista, base Asimov, os dois climas das referências favoritas: claro de "arquivo de sistema" com traço preto sobre creme, e escuro de lettering Inter + Instrument Serif — foi escrita a partir das referências favoritas, para Rodrigo revisar), o pedido, **6 quadros de cada referência** escolhida (com a descrição da Calibragem), as **mídias do banco** (miniatura e dados; no motion, `MOTION.midias`), a duração e o formato. Depois **confere**: o app fotografa 4 instantes e a IA corrige o que estiver cortado, sobreposto ou fora do palco, ou responde OK. Status: escrevendo → conferindo → finalizando (ou erro, com a mensagem).
- **Na etapa Inserts:** num plano de motion, o card da esquerda mostra o motion do plano (miniatura, versão, campos) ou "Criar ou escolher um motion", que abre o **modal**: à esquerda a biblioteca do formato do plano (e "Neste plano"), no centro a prévia em loop (play, cursor), à direita o pedido (nome, o que se quer — já com o que a direção pediu e a fala —, referências escolhidas no "Buscar por referências" com "+ Usar como referência", mídias do banco) ou o motion (nome, favorito, versões, campos, comentário para a próxima versão, "Usar neste plano"). **Usar copia** a versão e os valores para o projeto (`projeto.motions[plano]`, `projetos/<id>/motions/<plano>.html`): mudar o original depois não muda o vídeo; os campos da cópia se editam no "Neste plano". A trilha Mídias mostra "✦ nome" ou "+ motion"; a prévia toca o motion no lugar do plano (tela dividida: o ator desce).
- **Configurações → Motions:** o modelo e a ficha de identidade (editáveis).
- **Exportação** (testada: 720p com um motion num plano, quadros certos): a página de render inclui os planos com motion (iframe do tamanho do palco; os vídeos do banco em resolução original); a foto espera o motion pintar o instante. Motion nunca é tratado como quadro parado.
- Rotas: `GET/POST /api/motions`, `GET/PATCH/DELETE /api/motions/{id}`, `POST …/versoes {de, comentario}`, `GET …/pagina?n=`, `GET …/miniatura`; `GET /api/projetos/{id}/motions`, `PUT/PATCH/DELETE …/motions/{plano}`, `GET …/motions/{plano}/pagina?duracao=&exportacao=`, `GET …/miniatura`.
- ⏳ **Fase 2:** as capturas de site guardam a posição dos elementos visíveis, para motions sobre inserts (caixas que surgem sobre cada elemento do site e se projetam).
