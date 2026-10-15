"""Leva os dados do layout antigo (`dados/`, os motions em `frontend/public`, a Heurística e os aprendizados na skill)
para `biblioteca/` e `projetos/`. Só move (o mesmo disco: instantâneo, nada é copiado nem apagado).

    python3 ferramentas/migrar_biblioteca.py              # mostra o que faria
    python3 ferramentas/migrar_biblioteca.py --aplicar    # move e guarda o que fez em biblioteca/.migracao.json
    python3 ferramentas/migrar_biblioteca.py --desfazer   # devolve tudo para onde estava

Pare o app antes (./dev.sh) e suba de novo depois.
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DADOS, BIB, SKILL = RAIZ / 'dados', RAIZ / 'biblioteca', RAIZ / '.claude' / 'skills' / 'editor'
REGISTRO = BIB / '.migracao.json'

MOVER = [
    *((DADOS / n, BIB / n) for n in ('banco', 'referencias', 'ctas', 'presets', 'transicoes', 'trilhas', 'sons', 'modelos', 'codigos.json')),
    (DADOS / 'projetos' / '_config.json', BIB / 'config.json'),
    (DADOS / 'projetos', RAIZ / 'projetos'),
    (RAIZ / 'frontend' / 'public' / 'motion' / 'presets', BIB / 'motions'),
    (SKILL / 'aprendizados', BIB / 'aprendizados'),
    (SKILL / 'exemplos' / 'regras.md', BIB / 'heuristica.md'),
    (SKILL / 'exemplos', BIB / 'exemplos'),
]


def rel(p: Path) -> str:
    return str(p.relative_to(RAIZ))


def aplicar(fazer: bool) -> None:
    feitos = []
    for de, para in MOVER:
        if not de.exists():
            print(f'  (não existe) {rel(de)}')
            continue
        if para.exists():
            sys.exit(f'Já existe {rel(para)}: nada foi movido a partir daqui. Confira antes de rodar de novo.')
        print(f'  {rel(de)}  →  {rel(para)}')
        if fazer:
            para.parent.mkdir(parents=True, exist_ok=True)
            de.rename(para)
            feitos.append([rel(de), rel(para)])
            REGISTRO.write_text(json.dumps(feitos, indent=1, ensure_ascii=False), encoding='utf-8')
    if fazer and DADOS.exists() and not any(x.name != '.DS_Store' for x in DADOS.iterdir()):
        for x in DADOS.iterdir():
            x.unlink()
        DADOS.rmdir()
        print('  dados/ vazia: removida')
    print('pronto' if fazer else '\n(nada mudou; para mover: --aplicar)')


def desfazer() -> None:
    feitos = json.loads(REGISTRO.read_text(encoding='utf-8'))
    for de, para in reversed(feitos):
        print(f'  {para}  →  {de}')
        (RAIZ / de).parent.mkdir(parents=True, exist_ok=True)
        (RAIZ / para).rename(RAIZ / de)
    REGISTRO.unlink()
    print('desfeito')


if __name__ == '__main__':
    if '--desfazer' in sys.argv:
        desfazer()
    else:
        aplicar('--aplicar' in sys.argv)
