# 11 · Aplicar uma revisão

Rodrigo assiste a versão na etapa **Revisão** do app (a prévia ao vivo), comenta o que é estrutural (trocar um insert,
um motion, um plano; o ajuste fino ele faz à mão nas etapas) e cola aqui o texto do botão "Enviar revisão":

```text
Revisão · PRJ-07 · v2
[Geral] A trilha está alta demais
[0:05,2] "pessoas ainda não" — Troque este insert por um print do site
  ↳ print: projetos/<id>/revisoes/anexos/c1-1.png
[0:20,0–0:23,5] "Gemini, Midjourney…" — Esses letterings passam rápido demais
(projetos/<id>/revisoes/v2.json)
```

## Rodar

```bash
A codigo PRJ-07                    # o id do projeto
A travar <id> revisao
A revisao-ler <id>                 # cada comentário: id, palavra(s), plano, status, anexos
```

## Aplicar

0. **Abra os anexos**: cada `anexo:` do `revisao-ler` é uma imagem (abra com o Read) ou um vídeo (tire alguns quadros
   com o ffmpeg num /tmp e leia-os), antes de aplicar.
1. **Classifique** cada comentário pela etapa que ele toca e leia o `.md` dela; aplique **pela ferramenta da etapa**:
   - fala (corta ou volta palavra, repetição) → `02-cortes.md` (`A cortes-faixa`);
   - plano, tipo, o que aparece, lettering, elementos → `03-direcao.md` (a corretora: `A direcao-comentar` +
     `A direcao-corrigir`; os inserts que continuam no mesmo plano mantêm as mídias);
   - mídia errada ou faltando → `04-inserts.md` (um subagente por insert a refazer, em paralelo);
   - preset, zoom, card → `05`; motion → `06`; transição → `07`; música ou volume → `08`; legenda → `09`.
2. A âncora é a **palavra** (o id), não o segundo: o tempo muda quando os cortes mudam.
3. **O que Rodrigo mudou à mão é dele**: a CLI recusa mexer sem `--forcar`; use `--forcar` só no que o comentário pede.
4. Aplique tudo e faça a checagem leve (`A quadros <id> <s>` só nos pontos mexidos).
5. **Responda cada comentário** (a tela mostra embaixo dele):
   ```bash
   A revisao-responder <id> 2 c1 --status aplicado --resposta "Troquei pelo print do site (BAN-012)"
   ```
   `aplicado` · `respondido` (era pergunta) · `nao_aplicado` (diga por quê).
6. Marque a próxima versão e destrave: `A versao-marcar <id> --resumo "v3: …"` e `A destravar <id>`. Diga a Rodrigo,
   em 3–5 linhas, o que mudou.

## Aprendizados: só na conclusão

Não grave aprendizados no meio das revisões: eles saem todos juntos quando o vídeo é aprovado (`14-concluir.md`),
lendo as revisões de todas as versões. Aqui, responda bem cada comentário (a resposta diz o que mudou: é o registro que
a conclusão lê). Exceção: se Rodrigo disser que algo vale para sempre ("regra geral", "sempre", "nunca mais"), confirme
com ele o texto e grave já.
