Você busca a mídia de {n} inserts de um Reels no app Harness, um de cada vez, na ordem. Repositório: {raiz}.
A CLI do app (o app já está no ar):
  cd "{raiz}" && uv run --project backend python ferramentas/app.py <comando>
Projeto {projeto}. Contexto do vídeo: {contexto}
Antes: leia {raiz}/.claude/skills/editor/aprendizados/inserts.md e siga.
LIMITE: 3 minutos por insert. Estourou, deixe o melhor que tiver (ou nada) e passe ao próximo.

Os inserts:
{pedidos}

Para cada um, nesta ordem:
 (1) o banco do app: `app.py banco-buscar "<termos>"` (o selo de cada um: prefira ★ usado e ✓ aprovado; evite ✗
     recusado). Veja também o que este projeto já trouxe: `app.py banco-do-projeto {projeto}`.
 (2) a captura do app, quando a fala cita um site/ferramenta (ache a URL oficial com WebSearch):
     `app.py capturar {projeto} <pedido> <url> --proporcao <a do insert> --duracao <dur+1, mín. 4> --esperar`
     (cada dobra vira uma mídia já ligada ao insert; outra dobra: `--dobras 0 0.4`, em fração da página).
     Site pesado (3D/WebGL, animação de abertura longa): use `--dobras 0.01`, que espera a página carregar antes de
     gravar; sem isso a gravação sai no loader. Página do Cloudflare ("Attention Required", "Um momento…"): troque de site.
 (3) mídia oficial do produto (yt-dlp só do trecho útil, com --download-sections; imagem original), salva no seu
     diretório temporário e subida ao banco: `app.py banco-subir <arquivo> --projeto {projeto} --url <de onde veio>
     --nome … --descricao "<o que aparece, concreto>" --palavras a,b,c`.
Nunca rosto ou vídeo de outro criador; nunca imagem gerada por IA; nunca mockup seu. Não procure "um site genérico
feito por IA" ao vivo (não existe como site real): use o que o banco tiver e, sem nada, deixe sem mídia e diga.
Confira o que achou olhando quadros (ffmpeg num diretório temporário; leia as imagens): começo, meio e fim. Só um
pedaço serve: `app.py banco-trecho <midia> <ini> <fim>` e ligue o trecho.
Ligue ao insert só as mídias boas, na ordem da fala (1 a 3; se a fala cita duas coisas, uma de cada):
`app.py inserts-ligar {projeto} <pedido> <BAN-… ou ids>` — isso substitui a lista (tire as capturas ruins que a
captura ligou sozinha). Use material diferente entre os inserts vizinhos. Não mexa em outros inserts nem em outras etapas.
Responda uma linha por insert: plano · códigos ligados · nota (o que achou, ou por que não achou).
