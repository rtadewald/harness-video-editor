# Aprendizados · Inserts (busca, captura de tela, escolha da mídia)

O que já foi aprendido nesta área, vídeo a vídeo (como gravar: `etapas/14-concluir.md`). Leia antes de trabalhar nela
e não repita estes erros. **[gosto]** = preferência confirmada pelo criador · **[defeito]** = erro técnico.

## Do criador

- **[gosto] Legível no celular, antes de tudo.** O Reels é visto num celular: se o texto da mídia não dá para ler nesse
  tamanho, ela não serve. Recorte e amplie só a parte que importa (a janela, a linha do terminal, o trecho da página). _mvi-0717 · 2026-10-12_
- **[gosto] Uma cor de fundo só.** Muitos vídeos oficiais mostram uma janela pequena sobre um fundo colorido: recorte
  só a janela. A janela pequena sobre outra cor, dentro do nosso layout, fica com cara de amador. _mvi-0717 · 2026-10-12_
- **[gosto] O produto em ação vale mais que a página.** Alguém usando o app, o terminal rodando, o resultado
  aparecendo convencem mais que documentação, landing page ou tabela. Página só quando a fala cita a própria página
  (um anúncio, uma data, um preço). _mvi-0717 · 2026-10-12_
- **[gosto] Fala + prova.** O insert mostra exatamente o que a frase diz, no melhor momento do vídeo de apoio. Se a
  fala diz "coloquei ele pra controlar a minha webcam", o trecho é o instante em que a webcam liga, não o antes nem o
  depois. Escolha o trecho olhando os quadros do vídeo, não só a descrição dele, e prefira o momento em que a ação
  acontece na tela. _mvi-0718 · 2026-10-13_
- **[gosto] Material atual.** Mostre a versão e as telas da geração atual do produto. Versão antiga (outro nome de
  modelo, interface velha) só se não houver outra, e com nota para o criador. _mvi-0717 · 2026-10-12_

## Técnicos (do editor)

- **[técnica] Conferir o trecho inteiro.** Antes de entregar, olhe começo, meio e fim do trecho usado: nada de troca
  de cena, câmera indo para outra coisa, sobreposição do vídeo original (cronômetro, marca d'água, legenda) ou borda do
  fundo aparecendo. _mvi-0717 · 2026-10-12_
- **[técnica] Resolução sobrando.** Baixe sempre a maior resolução disponível e nunca amplie além do que a fonte
  tem. Julgue a nitidez no vídeo final em 4K, em tamanho real — a prévia de 720p esconde o borrado. Se a melhor fonte
  ainda fica borrada, grave a sua própria: rode a ferramenta de verdade (ex.: uma sessão real do terminal) e
  renderize em alta resolução. _mvi-0717 · 2026-10-12_
- **[técnica] O detalhe citado aparece grande.** Se a fala cita um detalhe (uma data, um preço, um número), o insert
  termina nesse detalhe, ampliado e legível. _mvi-0717 · 2026-10-12_
- Os inserts que já estão no banco voltam em ~20 s; os que pedem busca e captura, em 3 a 11 min. _1º teste · 2026-10-10_
- openai.com, claude.com, perplexity.ai, Gamma e Canva bloqueiam a captura (Cloudflare, "Um momento…"): vá para a doc
  oficial (developers.openai.com, docs.anthropic.com), o blog ou o model card do produto. _1º teste_
- Capturas começam em branco enquanto a página carrega: corte o começo com um trecho (`banco.py trecho`). _1º teste_
- Sites com WebGL pesado (esferas 3D) podem sair pretos na captura com a máquina carregada; um vídeo do banco curto
  demais pode virar câmera lenta (`ffmpeg -vf "setpts=PTS/0.42,minterpolate=fps=30:mi_mode=blend"`). _1º teste_
- Exemplos "do que não fazer" (site genérico, site poluído) são os mais difíceis de achar prontos: descreva na marcação
  um tipo concreto e achável (ex.: "a galeria de templates do Lovable"). Nunca monte um mockup sem dizer. _1º teste_
- Apague do banco o que foi capturado e não serviu (`banco.py apagar`): os subagentes deixavam lixo. _1º teste_
