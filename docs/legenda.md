# Legenda

A etapa **Legenda** (SPEC §8.10): legendas geradas da fala já cortada, no estilo dos nossos vídeos — posição, fonte e
ritmo medidos nas referências.

Legenda de status: ✅ aprovado por Rodrigo · 💡 proposta técnica · ⏳ em aberto.

## O estilo da casa

✅ **Um estilo único, modelado das referências** (decisão de Rodrigo, out/2026). No print de referência: texto branco,
negrito, frase curta, no **centro da tela**, com uma sombra suave para ler sobre qualquer fundo.

💡 A medida (`ferramentas/legenda_analisar.py`): em quadros das referências (4 por segundo), o texto da legenda é lido
(OCR do macOS) com a posição e o tamanho; comparando com as palavras faladas (a transcrição da referência), mede-se:
- **posição** (altura na tela) por categoria de plano (Full ator, tela dividida, insert tela cheia, motion…) — numa tela
  dividida, por exemplo, ela pode ficar na costura entre o insert e o ator;
- **fonte** (família, peso), **tamanho**, cor, contorno e sombra, maiúsculas ou não, pontuação;
- **ritmo**: quantas palavras e caracteres por bloco, em quanto tempo cada bloco aparece em relação às palavras, onde
  ele quebra (pausas, vírgulas, fim de ideia) e se as palavras aparecem uma a uma dentro do bloco;
- **destaques**: se alguma palavra muda de cor ou tamanho, e quando.

Se a fonte for paga e não estiver no Mac, o Claude pede o arquivo a Rodrigo (as da Apple — SF Pro — já são lidas do
próprio Mac, como nos motions).

## No vídeo

✅ Gerada **sozinha da transcrição já cortada**, com edição na etapa Legenda: o texto de cada bloco (corrigir uma palavra,
juntar, separar) e o tempo (pela fala). A legenda **desvia sozinha** dos inserts e da caixinha de comentário.

💡 Os blocos ficam presos às palavras (SPEC §9): `projeto.legenda = { ligada, blocos: [{ palavra_ini, palavra_fim,
texto? }] }` (o `texto` só quando foi editado). Mexer nos cortes faz os blocos acompanharem.

💡 **Prévia:** uma camada HTML sobre o player (as fontes e o tamanho em unidades do quadro, como os inserts).
**Exportação:** um arquivo **ASS** gerado dos mesmos blocos e do mesmo estilo, desenhado pelo `ass` do ffmpeg (libass)
por cima de tudo, no fim da montagem (SPEC §13) — rápido e nítido em 4K, sem fotografar quadros.

⏳ Variações de estilo (por formato: anúncio, aula) quando esses formatos existirem.
