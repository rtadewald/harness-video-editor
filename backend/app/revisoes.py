"""A revisão de Rodrigo (docs/editor-claude.md §6, E8), no molde da do 19: comentários presos a um instante (ou a um
trecho, ou gerais) da versão revisada, com prints e vídeos anexados; as dúvidas do Claude; "Enviar revisão" copia o
texto que Rodrigo cola no chat ("Revisão · PRJ-07 · v2"); o Claude responde cada comentário (aplicado, respondido, não
aplicado) e a tela mostra; "Aprovar" marca a versão aprovada (`versoes/vN.json` → `aprovada`).

- `revisoes/vN.json`: `{versao, aprovado, enviado_em, comentarios: [{id: 'c1', t, fim, palavra, palavra_fim, fala,
  plano, texto, anexos?, geral?, responde?, criado_em, status, resposta}]}`. Os tempos são do vídeo final da versão
  revisada; a âncora que vale para o Claude é a palavra (o tempo muda quando os cortes mudam).
- `revisoes/anexos/<cid>-<n>.<ext>`: os anexos (imagens e vídeos, até 500 MB).
- As dúvidas do Claude: `projeto.duvidas` enquanto ele edita; ao marcar a versão, vão para `versoes/vN.json` (`duvidas`).
"""
import re
import threading
from datetime import datetime

from . import comum, projeto, versoes

STATUS = ('pendente', 'aplicado', 'respondido', 'nao_aplicado')
TIPOS_ANEXO = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
               'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm'}
MAX_ANEXO = 500 * 1024 * 1024
RE_ANEXO = re.compile(r'revisoes/anexos/(c\d+)-\d+\.(png|jpg|webp|gif|mp4|mov|webm)')
_trava = threading.Lock()


def _agora() -> str:
    return datetime.now().isoformat(timespec='seconds')


def _arq(id: str, n: int):
    return projeto.pasta(id) / 'revisoes' / f'v{int(n)}.json'


def ler(id: str, n: int) -> dict:
    try:
        return comum.ler_json(_arq(id, n))
    except FileNotFoundError:
        return {'versao': int(n), 'aprovado': False, 'enviado_em': None, 'comentarios': []}


def duvidas(id: str, n: int) -> list[dict]:
    """As dúvidas do Claude na versão (as que ele deixou ao entregar)."""
    try:
        return versoes.ler(id, n).get('duvidas') or []
    except LookupError:
        return []


def tem_conteudo(c: dict) -> bool:
    return bool((c.get('texto') or '').strip() or c.get('anexos'))


def _limpo(c: dict) -> dict:
    """Um comentário vindo da tela, só com os campos conhecidos (a tela não muda status nem resposta)."""
    if not isinstance(c, dict) or not re.fullmatch(r'c\d+', str(c.get('id', ''))):
        raise ValueError('Comentário sem id')
    num = lambda v: round(float(v), 3) if isinstance(v, (int, float)) and not isinstance(v, bool) else None  # noqa: E731
    txt = lambda v, m: str(v)[:m] if isinstance(v, str) else None  # noqa: E731
    out = {'id': c['id'], 't': num(c.get('t')), 'fim': num(c.get('fim')), 'palavra': txt(c.get('palavra'), 40),
           'palavra_fim': txt(c.get('palavra_fim'), 40), 'fala': txt(c.get('fala'), 400) or '', 'plano': txt(c.get('plano'), 40),
           'texto': txt(c.get('texto'), 5000) or '', 'criado_em': txt(c.get('criado_em'), 40) or _agora(),
           'status': 'pendente', 'resposta': None}
    if c.get('geral'):
        out.update(geral=True, t=None, fim=None, palavra=None, palavra_fim=None, plano=None)
    if c.get('responde'):
        out['responde'] = txt(c['responde'], 40)
    anexos = [a for a in c.get('anexos') or [] if isinstance(a, str) and RE_ANEXO.fullmatch(a) and a.split('/')[-1].startswith(f"{c['id']}-")]
    if anexos:
        out['anexos'] = anexos[:20]
    return out


def salvar(id: str, n: int, comentarios: list) -> dict:
    """Grava os comentários da tela, guardando o que o Claude respondeu (status e resposta nunca vêm da tela)."""
    with _trava:
        rev = ler(id, n)
        antes = {c['id']: c for c in rev['comentarios']}
        novos = []
        for c in comentarios[:500]:
            x = _limpo(c)
            if (a := antes.get(x['id'])):
                x.update(status=a.get('status') or 'pendente', resposta=a.get('resposta'))
            novos.append(x)
        rev['comentarios'] = novos
        comum.salvar_json(_arq(id, n), rev)
    return rev


def responder(id: str, n: int, cid: str, status: str, resposta: str) -> dict:
    status = status.replace('não ', 'nao_').replace('nao ', 'nao_')
    if status not in STATUS[1:]:
        raise ValueError(f'Status inválido: use {", ".join(STATUS[1:])}')
    with _trava:
        rev = ler(id, n)
        c = next((x for x in rev['comentarios'] if x['id'] == cid), None)
        if c is None:
            raise LookupError(f'O comentário {cid} não existe na v{n}')
        c.update(status=status, resposta=resposta.strip()[:3000] or None)
        comum.salvar_json(_arq(id, n), rev)
    return c


def _codigo(id: str) -> str:
    from . import codigos
    try:
        return codigos.mapa().get('projeto', {}).get(id) or id
    except Exception:
        return id


def tempo(t: float | None) -> str:
    """m:ss,d (0:03,2), como a tela mostra."""
    d = int(max(0.0, t or 0) * 10 + 1e-6)
    return f'{d // 600}:{(d % 600) // 10:02d},{d % 10}'


def _quando(c: dict) -> str:
    if c.get('geral'):
        return 'Geral'
    if c.get('responde'):
        return f'↳ dúvida do Claude {tempo(c["t"])}'
    return f'{tempo(c["t"])}–{tempo(c["fim"])}' if c.get('fim') is not None else tempo(c['t'])


def _ordem(c: dict) -> float:
    return -1 if c.get('geral') else (c.get('t') or 0)


def _uma_linha(s: str) -> str:
    return ' / '.join(p.strip() for p in (s or '').strip().splitlines() if p.strip())


def texto(id: str, n: int) -> str:
    """O texto do "Enviar revisão", que Rodrigo cola no chat do Claude Code."""
    rev = ler(id, n)
    base = f'dados/projetos/{id}'
    linhas = [f'Revisão · {_codigo(id)} · v{n}']
    for c in sorted((c for c in rev['comentarios'] if tem_conteudo(c)), key=_ordem):
        fala = f'"{c["fala"]}" — ' if c.get('fala') else ''
        linhas.append(f'[{_quando(c)}] {fala}{_uma_linha(c.get("texto", "")) or "(ver o print)"}')
        if c.get('anexos'):
            rotulo = 'anexo' if any(a.endswith(('.mp4', '.mov', '.webm')) for a in c['anexos']) else 'print'
            linhas.append(f'  ↳ {rotulo}: ' + ', '.join(f'{base}/{a}' for a in c['anexos']))
    linhas.append(f'({base}/revisoes/v{n}.json)')
    return '\n'.join(linhas)


def enviar(id: str, n: int) -> dict:
    with _trava:
        rev = ler(id, n)
        if not any(tem_conteudo(c) for c in rev['comentarios']):
            raise ValueError('Nada para enviar ainda: comente um instante ou, com o tempo desligado (C), o vídeo todo.')
        rev['enviado_em'] = _agora()
        comum.salvar_json(_arq(id, n), rev)
    return {'texto': texto(id, n), 'revisao': rev}


def aprovar(id: str, n: int) -> dict:
    """Aprova a versão: a revisão e a versão guardada (os selos do banco e a E9 leem `aprovada`)."""
    v = versoes.ler(id, n)  # LookupError se a versão não existe
    with _trava:
        rev = ler(id, n)
        rev.update(aprovado=True, aprovado_em=rev.get('aprovado_em') or _agora())
        comum.salvar_json(_arq(id, n), rev)
    comum.salvar_json(projeto.pasta(id) / 'versoes' / f'v{int(n)}.json', {**v, 'aprovada': True, 'aprovada_em': rev['aprovado_em']})
    versoes.registrar_atividade(id, 'revisao', f'v{n} aprovada', autor='rodrigo')
    return {'texto': f'Aprovado · {_codigo(id)} · v{n}', 'revisao': rev}


# ---------------------------------------------------------------- anexos

def reservar_anexo(id: str, cid: str, tipo: str):
    """O arquivo novo de um anexo (`revisoes/anexos/<cid>-<k>.<ext>`, o próximo k livre), já reservado."""
    if not re.fullmatch(r'c\d+', cid or ''):
        raise ValueError('Comentário inválido')
    ext = TIPOS_ANEXO.get((tipo or '').split(';')[0].strip())
    if not ext:
        raise ValueError('Só imagens e vídeos entram como anexo.')
    pasta = projeto.pasta(id) / 'revisoes' / 'anexos'
    pasta.mkdir(parents=True, exist_ok=True)
    with _trava:
        k = 1
        while any(pasta.glob(f'{cid}-{k}.*')):
            k += 1
        alvo = pasta / f'{cid}-{k}.{ext}'
        alvo.touch()
    return alvo


def apagar_anexo(id: str, caminho: str) -> None:
    if not RE_ANEXO.fullmatch(caminho or ''):
        raise ValueError('Anexo inválido')
    (projeto.pasta(id) / caminho).unlink(missing_ok=True)


# ---------------------------------------------------------------- dúvidas do Claude

def anotar_duvida(id: str, palavra: str, palavra_fim: str | None, texto_: str, fala: str = '') -> dict:
    """Uma dúvida do Claude presa às palavras, para a próxima versão (vai para ela ao marcar)."""
    if not texto_.strip():
        raise ValueError('A dúvida veio vazia')
    out = {}

    def aplicar(p):
        ds = p.get('duvidas') or []
        n = max((int(d['id'][1:]) for d in ds if re.fullmatch(r'd\d+', d.get('id', ''))), default=0) + 1
        out.update(id=f'd{n}', palavra=palavra, palavra_fim=palavra_fim or palavra, texto=texto_.strip()[:2000], fala=fala.strip()[:400])
        p['duvidas'] = [*ds, dict(out)]
    projeto.atualizar(id, aplicar)
    return out
