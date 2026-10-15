"""Os tipos de vídeo (Reels, Ad, VSL, YouTube, Aula…): cada projeto e cada referência da Calibragem tem um, e cada tipo
tem a sua Heurística; a direção de um projeto aprende só com as referências do tipo dele. Ficam nas Configurações
(`tipos` em `biblioteca/config.json`): o criador cria, renomeia e apaga. O id fica no projeto e na referência (no
projeto, o campo `formato`, que já existia)."""
import re

PADRAO = 'reels'  # o tipo dos projetos e das referências de antes dos tipos, e o das novas sem tipo
TIPOS_PADRAO = [
    {'id': 'reels', 'nome': 'Reels', 'emoji': '📱'},
    {'id': 'ad', 'nome': 'Ad', 'emoji': '💰'},
    {'id': 'vsl', 'nome': 'VSL', 'emoji': '📺'},
    {'id': 'youtube', 'nome': 'YouTube', 'emoji': '🎥'},
    {'id': 'aula', 'nome': 'Aula', 'emoji': '📚'},
]
ANTIGOS = {'anuncio': 'ad'}  # os formatos de antes dos tipos


def validar(lista) -> list[dict]:
    """A lista das Configurações, limpa: ids em minúsculas e hífens, sem repetir; o Reels sempre existe."""
    if not isinstance(lista, list):
        return [dict(t) for t in TIPOS_PADRAO]
    out, ids = [], set()
    for t in lista:
        if not isinstance(t, dict):
            continue
        nome = str(t.get('nome') or '').strip()[:40]
        id = re.sub(r'[^a-z0-9-]+', '-', str(t.get('id') or nome).lower()).strip('-')[:30]
        if not id or not nome or id in ids:
            continue
        ids.add(id)
        out.append({'id': id, 'nome': nome, 'emoji': str(t.get('emoji') or '').strip()[:8]})
    if PADRAO not in ids:
        out.insert(0, dict(TIPOS_PADRAO[0]))
    return out


def listar() -> list[dict]:
    from . import projeto
    return projeto.ler_config()['tipos']


def do_item(x: dict, campo: str = 'tipo') -> str:
    """O tipo de um projeto (`formato`) ou de uma referência (`tipo`): o gravado, o antigo convertido, ou o padrão."""
    t = x.get(campo) or PADRAO
    return ANTIGOS.get(t, t)


def checar(id: str) -> str:
    if id not in {t['id'] for t in listar()}:
        raise ValueError('Tipo desconhecido: crie-o nas Configurações')
    return id
