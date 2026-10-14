"""Versões do projeto inteiro, marcas do que Rodrigo mudou à mão, a trava "Claude editando" e o registro de atividade
(docs/editor-claude.md, E2; Q4, Q7, Q23, Q24).

- **Versão** (v1, v2…): uma cópia do estado de todas as etapas (`CAMPOS`) em `versoes/vN.json`. Voltar a uma versão
  restaura esse estado (as versões seguintes continuam guardadas).
- **Marca de mão**: cada mudança feita pela tela (sem o cabeçalho `X-Autor: claude`) entra em `projeto.manuais`, com a
  etapa, o alvo (o plano, o insert, o corte…), a versão em que foi feita e quando. O Claude não mexe no que tem marca,
  a menos que um comentário da revisão peça.
- **Trava**: `projeto.claude = {editando, etapa, desde}`; travado, a API recusa edições que não vêm do Claude (423).
- **Atividade**: `projeto.atividade`, o que o Claude (ou Rodrigo) fez, com a etapa e os segundos.
"""
import json
import re
from datetime import datetime

from . import comum, projeto

CAMPOS = ('timeline', 'cortes', 'direcao', 'inserts', 'motions', 'transicoes', 'audio', 'legenda', 'look', 'velocidade')
MAX_ATIVIDADE = 300
MAX_MANUAIS = 2000


def _agora() -> str:
    return datetime.now().isoformat(timespec='seconds')


def _pasta(id: str):
    return projeto.pasta(id) / 'versoes'


def listar(id: str) -> list[dict]:
    """As versões do projeto, da primeira à última (sem o estado, que é grande)."""
    out = []
    for a in sorted(_pasta(id).glob('v*.json'), key=lambda a: int(re.sub(r'\D', '', a.stem) or 0)):
        v = comum.ler_json(a)
        out.append({k: v.get(k) for k in ('versao', 'criado_em', 'autor', 'resumo', 'restaurada_de', 'aprovada')})
    return out


def atual(id: str) -> int:
    """A última versão marcada (0 antes da primeira)."""
    vs = listar(id)
    return vs[-1]['versao'] if vs else 0


def marcar(id: str, autor: str = 'claude', resumo: str = '') -> dict:
    """Guarda o estado de agora como a próxima versão."""
    p = projeto.ler(id)
    n = atual(id) + 1
    v = {'versao': n, 'criado_em': _agora(), 'autor': autor, 'resumo': resumo[:2000], 'estado': {k: p.get(k) for k in CAMPOS if k in p}}
    _pasta(id).mkdir(exist_ok=True)
    comum.salvar_json(_pasta(id) / f'v{n}.json', v)
    projeto.atualizar(id, lambda x: x.update(versao=n))
    registrar_atividade(id, 'versao', f'Versão v{n} marcada' + (f': {resumo}' if resumo else ''), autor=autor)
    return {k: v[k] for k in ('versao', 'criado_em', 'autor', 'resumo')}


def aprovada(id: str) -> int | None:
    """A última versão aprovada (`aprovada` no vN.json; a aprovação entra na E9), ou None."""
    vs = [v for v in listar_completas(id) if v.get('aprovada')]
    return vs[-1]['versao'] if vs else None


def listar_completas(id: str) -> list[dict]:
    pasta = _pasta(id)
    return [comum.ler_json(a) for a in sorted(pasta.glob('v*.json'), key=lambda a: int(re.sub(r'\D', '', a.stem) or 0))] if pasta.exists() else []


def ler(id: str, n: int) -> dict:
    try:
        return comum.ler_json(_pasta(id) / f'v{int(n)}.json')
    except FileNotFoundError:
        raise LookupError(f'O projeto não tem a v{n}')


def restaurar(id: str, n: int) -> dict:
    """Volta o projeto ao estado da vN (as versões continuam todas guardadas)."""
    v = ler(id, n)

    def aplicar(p):
        for k in CAMPOS:
            if k in v['estado']:
                p[k] = v['estado'][k]
            else:
                p.pop(k, None)
        p['versao'] = n
    p = projeto.atualizar(id, aplicar)
    registrar_atividade(id, 'versao', f'Voltou à v{n}', autor='rodrigo')
    return p


# ---------------------------------------------------------------- trava e atividade

def trava(id: str) -> dict | None:
    c = projeto.ler(id).get('claude') or {}
    return c if c.get('editando') else None


def travar(id: str, editando: bool, etapa: str | None = None) -> dict:
    def aplicar(p):
        if editando:
            atual_ = p.get('claude') or {}
            p['claude'] = {'editando': True, 'etapa': etapa or atual_.get('etapa'), 'desde': atual_.get('desde') if atual_.get('editando') else _agora()}
        else:
            p['claude'] = {'editando': False}
    return projeto.atualizar(id, aplicar)['claude']


def registrar_atividade(id: str, etapa: str, texto: str, segundos: float | None = None, autor: str = 'claude') -> dict:
    e: dict = {'em': _agora(), 'autor': autor, 'etapa': str(etapa)[:40], 'texto': str(texto)[:500]}
    if segundos is not None:
        e['segundos'] = round(float(segundos), 1)

    def aplicar(p):
        p['atividade'] = ((p.get('atividade') or []) + [e])[-MAX_ATIVIDADE:]
    projeto.atualizar(id, aplicar)
    return e


# ---------------------------------------------------------------- marcas de mão

# rota (sem /api/projetos/{id}) → (etapa, alvo): os grupos da regex dão o alvo; o resto da rota não marca nada
_ROTAS = [
    (r'clipes/([^/]+)/(?:ajustar|restaurar)', 'cortes', 1),
    (r'cortes/(faixa|recalcular|refazer)', 'cortes', 1),
    (r'direcao(?:/.*)?', 'direcao', None),
    (r'inserts/presets/recomendados', 'inserts', None),
    (r'transicoes/variar', 'transicoes', None),
    (r'inserts/ator/([^/]+)', 'presets_ator', 1),
    (r'inserts/(fundo|transicao)', 'inserts', 1),
    (r'inserts/([^/]+)/(?:midias|enriquecimento(?:/tipo)?|comentario|captura)', 'inserts', 1),
    (r'motions/([^/]+)', 'motions', 1),
    (r'transicoes', 'transicoes', 'campos'),
    (r'audio', 'audio', 'campos'),
    (r'legenda', 'legenda', 'ajustes'),
    (r'(look|velocidade|enquadramento)', 'preprocessamento', 1),
]
_PROJETO = re.compile(r'^/api/projetos/([^/]+)/(.+)$')


def alvos_da_rota(caminho: str, corpo: bytes) -> tuple[str, str, list[str]] | None:
    """(id do projeto, etapa, alvos) de uma edição; None se a rota não edita uma etapa (exportar, reprocessar…)."""
    m = _PROJETO.match(caminho)
    if not m:
        return None
    pid, resto = m.groups()
    for padrao, etapa, alvo in _ROTAS:
        r = re.fullmatch(padrao, resto)
        if not r:
            continue
        if isinstance(alvo, int):
            return pid, etapa, [r.group(alvo)]
        if alvo is None:
            return pid, etapa, ['*']
        try:
            d = json.loads(corpo or b'{}')
        except ValueError:
            d = {}
        chaves = d.get('campos', d) if isinstance(d, dict) else {}
        if alvo == 'ajustes':
            chaves = (chaves.get('ajustes') if isinstance(chaves, dict) else None) or chaves
        return pid, etapa, sorted(chaves)[:50] if isinstance(chaves, dict) and chaves else ['*']
    return None


def marcar_manual(id: str, etapa: str, alvos: list[str], rota: str) -> None:
    v = atual(id)
    em = _agora()

    def aplicar(p):
        lista = [x for x in (p.get('manuais') or []) if not (x['etapa'] == etapa and x['alvo'] in alvos)]
        lista += [{'etapa': etapa, 'alvo': a, 'versao': v, 'em': em, 'rota': rota} for a in alvos]
        p['manuais'] = lista[-MAX_MANUAIS:]
    projeto.atualizar(id, aplicar)


def manuais(id: str) -> list[dict]:
    return projeto.ler(id).get('manuais') or []
