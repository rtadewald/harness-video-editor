# 12 · Vídeo final

Rodrigo aprovou uma versão na Revisão do app e colou "Aprovado · PRJ-07 · vN" (ou aprovou por mensagem: aprove no app
igual ao botão, `A aprovar <id> vN`). A versão aprovada fica marcada (`versoes/vN.json` → `aprovada`); os selos do banco
saem dela.

```bash
A codigo PRJ-07                                  # o id
A exportar <id> --esperar                        # 4K, HEVC, 24 fps, pela exportação do app (o estado de agora)
```

- A exportação usa o **estado de agora** do projeto. Se ele mudou depois da vN aprovada, a CLI recusa e diz o que mudou:
  **pergunte a Rodrigo** (exportar assim mesmo com `--mesmo-assim`, ou ele volta à vN no seletor de versões).
- Sai em `dados/projetos/<id>/exports/<nome>.mp4`. Entregue com o caminho e `open -R "<arquivo>"` (abre o Finder nele).
- Depois, a vN vira **referência da Calibragem** (sem Gemini; refazer substitui):

  ```bash
  A referencia <id>                              # prj-<id>-vN, do MP4 exportado, com as revisões guardadas
  ```

  Diga a Rodrigo que o vídeo está na Calibragem como "a revisar": ele confere a direção e marca revisado. Só aí ele
  entra nos roteiros de exemplo e ensina a Direção visual.

Tempo esperado: ~1 min por minuto de vídeo.

Depois, **conclua o vídeo**: `14-concluir.md` (aprendizados com Rodrigo e a faxina do banco).
