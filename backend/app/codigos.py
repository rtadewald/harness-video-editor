"""Um código curto e estável para cada coisa da biblioteca e cada projeto, para citar na revisão e no chat
(docs/editor-claude.md, Q18; trazido do 19-agent-video-editor, `ferramentas/codigo.py`).

Prefixos: PRE presets · MOT motions · TRA transições · TRI trilhas · BAN mídias do banco (o trecho: BAN-012.2) ·
REF referências da Calibragem (um plano: REF-03·p7) · SOM sons · PRJ projetos (um plano: PRJ-02·p5) · CTA.
O registro é `biblioteca/codigos.json` ({código: {tipo, id[, pai]}}): um código é dado uma vez, na ordem de criação, e
nunca muda nem é reaproveitado (o item apagado ou recusado leva o dele; os 34 do 19 que apontam para mídias apagadas
ficam reservados). `atribuir()` dá o próximo número aos itens novos, sob uma trava de arquivo.
"""
import fcntl
import json
import os
import re
from datetime import datetime
from pathlib import Path

from . import comum

REGISTRO = comum.BIBLIOTECA / 'codigos.json'
PREFIXO = {'preset': 'PRE', 'motion': 'MOT', 'transicao': 'TRA', 'trilha': 'TRI', 'midia': 'BAN', 'referencia': 'REF',
           'som': 'SOM', 'projeto': 'PRJ', 'cta': 'CTA'}
TIPO = {v: k for k, v in PREFIXO.items()}
NOME_TIPO = {'preset': 'preset', 'motion': 'motion', 'transicao': 'transição', 'trilha': 'trilha', 'midia': 'mídia do banco',
             'trecho': 'trecho de mídia do banco', 'referencia': 'referência da Calibragem', 'som': 'som', 'projeto': 'projeto', 'cta': 'CTA'}
CODIGO = re.compile(r'(PRE|MOT|TRA|TRI|BAN|REF|SOM|PRJ|CTA)-?(\d+)(?:\.(\d+))?(?:\s*[·.:/ ]\s*([pv])(\d+))?', re.I)
_JSON_DO_MOTION = re.compile(r'<script type="application/json" id="preset">(.*?)</script>', re.DOTALL)


def _motions() -> Path:
    from . import motions
    return motions.PRESETS


def _pastas() -> dict[str, Path]:
    """As pastas de cada tipo, pelas RAIZ dos módulos (os testes trocam cada uma pela sua temporária)."""
    from . import banco, presets, projeto, referencias, sons, transicoes, trilhas
    return {'presets': presets.RAIZ, 'transicoes': transicoes.RAIZ, 'trilhas': trilhas.RAIZ, 'sons': sons.RAIZ, 'banco': banco.RAIZ,
            'referencias': referencias.RAIZ, 'projetos': projeto.RAIZ, 'ctas': comum.BIBLIOTECA / 'ctas'}


def codigo(prefixo: str, n: int, sub: int | None = None) -> str:
    return f'{prefixo}-{n:0{3 if prefixo == "BAN" else 2}d}' + (f'.{sub}' if sub else '')


def _ler(arq: Path, padrao=None):
    try:
        return json.loads(arq.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        return padrao


def _criado(arq: Path, iso: str | None = None) -> str:
    if iso:
        return iso
    st = arq.stat()
    return datetime.fromtimestamp(getattr(st, 'st_birthtime', st.st_mtime)).isoformat(timespec='seconds')


def dados_motion(arq: Path) -> dict:
    try:
        m = _JSON_DO_MOTION.search(arq.read_text(encoding='utf-8'))
        return json.loads(m.group(1)) if m else {}
    except (FileNotFoundError, ValueError):
        return {}


def _lista_catalogo(cat) -> list:
    return cat.get('faixas', cat.get('sons', [])) if isinstance(cat, dict) else (cat or [])


def existentes() -> dict[str, list[tuple[str, str]]]:
    """Os itens que existem hoje, por tipo, como (id, criado), na ordem de criação; trechos como ('pai/id', criado)."""
    P = _pastas()
    out: dict[str, list[tuple[str, str]]] = {t: [] for t in PREFIXO}
    out['trecho'] = []
    for a in (P['presets']).glob('*.json'):
        if a.name != 'ordem.json':
            out['preset'].append((a.stem, _criado(a, (_ler(a, {}) or {}).get('criado_em'))))
    for a in _motions().glob('*.html'):
        out['motion'].append((a.stem, _criado(a, dados_motion(a).get('criado_em'))))
    for a in (P['transicoes']).glob('*.json'):
        if a.name not in ('ordem.json', 'pares.json'):
            out['transicao'].append((a.stem, _criado(a, (_ler(a, {}) or {}).get('criado_em'))))
    out['trilha'] = [(f['id'], f'{k:06d}') for k, f in enumerate(_lista_catalogo(_ler(P['trilhas'] / 'catalogo.json', {})))]
    out['som'] = [(s['id'], f'{k:06d}') for k, s in enumerate(_lista_catalogo(_ler(P['sons'] / 'catalogo.json', [])))]
    for a in (P['banco']).glob('*/item.json'):
        i = _ler(a, {}) or {}
        if i.get('pai'):
            out['trecho'].append((f'{i["pai"]}/{a.parent.name}', _criado(a, i.get('criado_em'))))
        else:
            out['midia'].append((a.parent.name, _criado(a, i.get('criado_em'))))
    for a in (P['referencias']).glob('*/referencia.json'):
        out['referencia'].append((a.parent.name, _criado(a, (_ler(a, {}) or {}).get('criado_em'))))
    for a in (P['ctas']).glob('*/cta.json'):
        out['cta'].append((a.parent.name, _criado(a, (_ler(a, {}) or {}).get('criado_em'))))
    for a in (P['projetos']).glob('*/projeto.json'):
        out['projeto'].append((a.parent.name, _criado(a, (_ler(a, {}) or {}).get('criado_em'))))
    for l in out.values():
        l.sort(key=lambda x: (x[1], x[0]))
    return out


def atribuir() -> dict:
    """O registro, com os itens novos numerados (o próximo número depois do maior já dado)."""
    REGISTRO.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(REGISTRO.parent, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        reg = _ler(REGISTRO, {}) or {}
        tem = {(v['tipo'], v['id']) for v in reg.values()}
        maior: dict[str, int] = {}
        sub: dict[str, int] = {}
        for c in reg:
            m = CODIGO.match(c)
            maior[m.group(1)] = max(maior.get(m.group(1), 0), int(m.group(2)))
            if m.group(3):
                base = codigo(m.group(1), int(m.group(2)))
                sub[base] = max(sub.get(base, 0), int(m.group(3)))
        novos = 0
        ex = existentes()
        for tipo, prefixo in PREFIXO.items():
            for id_, _ in ex[tipo]:
                if (tipo, id_) not in tem:
                    maior[prefixo] = maior.get(prefixo, 0) + 1
                    reg[codigo(prefixo, maior[prefixo])] = {'tipo': tipo, 'id': id_}
                    tem.add((tipo, id_))
                    novos += 1
        do_banco = {v['id']: c for c, v in reg.items() if v['tipo'] == 'midia'}
        for chave, _ in ex['trecho']:
            pai, id_ = chave.split('/')
            if ('trecho', id_) in tem or pai not in do_banco:
                continue
            base = do_banco[pai]
            sub[base] = sub.get(base, 0) + 1
            reg[f'{base}.{sub[base]}'] = {'tipo': 'trecho', 'id': id_, 'pai': pai}
            tem.add(('trecho', id_))
            novos += 1
        if novos:
            def ordem(c):
                m = CODIGO.match(c)
                return (list(TIPO).index(m.group(1)), int(m.group(2)), int(m.group(3) or 0))
            reg = {c: reg[c] for c in sorted(reg, key=ordem)}
            comum.salvar_json(REGISTRO, reg)
        return reg
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


def mapa() -> dict[str, dict[str, str]]:
    """{tipo: {id: código}} (os trechos junto das mídias): o que a tela usa para mostrar os códigos."""
    out: dict[str, dict[str, str]] = {t: {} for t in PREFIXO}
    for c, v in atribuir().items():
        out['midia' if v['tipo'] == 'trecho' else v['tipo']][v['id']] = c
    return out


def nome_de(tipo: str, id_: str) -> str:
    P = _pastas()
    if tipo == 'preset':
        a = P['presets'] / f'{id_}.json'
        return (_ler(a if a.is_file() else P['presets'] / '_recusados' / f'{id_}.json', {}) or {}).get('nome') or id_
    if tipo == 'motion':
        a = _motions() / f'{id_}.html'
        a = a if a.is_file() else _motions() / '_recusados' / f'{id_}.html'
        return dados_motion(a).get('nome') or id_
    if tipo == 'transicao':
        return (_ler(P['transicoes'] / f'{id_}.json', {}) or {}).get('nome') or id_
    if tipo in ('midia', 'trecho'):
        return (_ler(P['banco'] / id_ / 'item.json', {}) or {}).get('nome') or id_
    if tipo == 'referencia':
        return (_ler(P['referencias'] / id_ / 'referencia.json', {}) or {}).get('nome') or id_
    if tipo == 'projeto':
        p = _ler(P['projetos'] / id_ / 'projeto.json')
        if p:
            return p.get('nome') or id_
        ref = _referencia_do_projeto(id_)
        return (_ler(P['referencias'] / ref / 'referencia.json', {}) or {}).get('nome') or id_ if ref else id_
    if tipo == 'cta':
        return (_ler(P['ctas'] / id_ / 'cta.json', {}) or {}).get('nome') or id_
    if tipo == 'trilha':
        return next((f.get('nome') for f in _lista_catalogo(_ler(P['trilhas'] / 'catalogo.json', {})) if f['id'] == id_), id_)
    if tipo == 'som':
        return next((s.get('nome') for s in _lista_catalogo(_ler(P['sons'] / 'catalogo.json', [])) if s['id'] == id_), id_)
    return id_


def _referencia_do_projeto(slug: str) -> str | None:
    """Um projeto do 19 que só existe aqui como referência (`prj-<slug>-vN`, Q26): a de maior versão."""
    refs = sorted(_pastas()['referencias'].glob(f'prj-{slug}-v*'), key=lambda p: int(re.sub(r'\D', '', p.name.rsplit('-v', 1)[-1]) or 0))
    return refs[-1].name if refs else None


def existe(tipo: str, id_: str, pai: str | None = None) -> bool:
    P = _pastas()
    return {
        'preset': lambda: (P['presets'] / f'{id_}.json').is_file(),
        'motion': lambda: (_motions() / f'{id_}.html').is_file(),
        'transicao': lambda: (P['transicoes'] / f'{id_}.json').is_file(),
        'midia': lambda: (P['banco'] / id_ / 'item.json').is_file(),
        'trecho': lambda: (P['banco'] / id_ / 'item.json').is_file(),
        'referencia': lambda: (P['referencias'] / id_ / 'referencia.json').is_file(),
        'projeto': lambda: (P['projetos'] / id_ / 'projeto.json').is_file() or bool(_referencia_do_projeto(id_)),
        'cta': lambda: (P['ctas'] / id_ / 'cta.json').is_file(),
    }.get(tipo, lambda: True)()


def resolver(texto: str) -> dict:
    """O que um código cita: {codigo, tipo, id, nome, existe, [pai], [plano|versao], [referencia]}. ValueError se o
    texto não é um código ou o código não foi dado."""
    m = CODIGO.match((texto or '').strip().replace(' · ', '·'))
    if not m:
        raise ValueError(f'{texto}: não é um código (ex.: PRE-07, BAN-012.2, REF-03·p7, PRJ-02·v3)')
    prefixo, n, trecho, letra, k = m.group(1).upper(), int(m.group(2)), m.group(3), (m.group(4) or '').lower(), m.group(5)
    cod = codigo(prefixo, n, int(trecho) if trecho else None)
    item = atribuir().get(cod)
    if not item:
        raise ValueError(f'{cod}: não existe')
    tipo, id_ = item['tipo'], item['id']
    out = {'codigo': cod, 'tipo': tipo, 'nome_tipo': NOME_TIPO[tipo], 'id': id_, 'nome': nome_de(tipo, id_), 'existe': existe(tipo, id_)}
    if item.get('pai'):
        out['pai'] = item['pai']
    if letra == 'p':
        out['plano'] = f'p{int(k)}'
    elif letra == 'v':
        out['versao'] = int(k)
    if tipo == 'projeto' and not (_pastas()['projetos'] / id_ / 'projeto.json').is_file():
        out['referencia'] = _referencia_do_projeto(id_)
    return out
