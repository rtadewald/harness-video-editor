"""Projetos em disco: uma pasta por projeto, com projeto.json como fonte de verdade (SPEC §5)."""
import json
import re
import threading
import unicodedata
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2] / 'projetos'
SAIDA = {'largura': 1080, 'altura': 1920}
ETAPAS = ['cortes', 'direcao', 'inserts', 'motion', 'legenda']
_trava = threading.Lock()  # o pipeline roda em outra thread e também grava o projeto.json

# Motores de transcrição. `familia` agrupa os que compartilham o MESMO texto (e IDs de palavra): trocar entre eles só muda
# os tempos, e os cortes continuam valendo. Famílias diferentes têm texto próprio e cortes próprios.
MOTORES = {
    'whisper-stable': {'nome': 'Whisper + stable-ts', 'familia': 'whisper'},
    'whisper': {'nome': 'Whisper (puro)', 'familia': 'whisper'},
    'whisper-qwen': {'nome': 'Whisper + Qwen3-Aligner', 'familia': 'whisper'},
    'whisper-ctc': {'nome': 'Whisper + CTC', 'familia': 'whisper'},
    'qwen-asr': {'nome': 'Qwen3-ASR 1.7B + Aligner', 'familia': 'qwen-asr'},
    'whisper-v3': {'nome': 'Whisper large-v3 + stable-ts', 'familia': 'whisper-v3'},
    'parakeet': {'nome': 'Parakeet v3', 'familia': 'parakeet'},
    'elevenlabs': {'nome': 'ElevenLabs Scribe v2', 'familia': 'elevenlabs', 'chave': 'ELEVENLABS_API_KEY'},
}
PADRAO = 'elevenlabs'  # motor de transcrição de fábrica (escolha de Rodrigo); muda em Configurações
LEGADO = 'whisper-stable'  # projetos antigos e plano B quando o motor escolhido falha


def _arquivo_config() -> Path:
    return RAIZ / '_config.json'


def ler_config() -> dict:
    """Preferências do app (por enquanto só o motor de transcrição padrão dos projetos novos)."""
    config = {'motor_padrao': PADRAO, 'antes_do_corte_ms': 100, 'depois_do_corte_ms': 100, 'pausa_max_ms': 2000, 'respiro_ms': 800}
    try:
        config.update(json.loads(_arquivo_config().read_text(encoding='utf-8')))
    except (FileNotFoundError, ValueError):
        pass
    if config['motor_padrao'] not in MOTORES:
        config['motor_padrao'] = PADRAO
    for chave, maximo in (('antes_do_corte_ms', 1000), ('depois_do_corte_ms', 1000), ('pausa_max_ms', 30000), ('respiro_ms', 5000)):
        config[chave] = min(max(int(config[chave]), 0), maximo)
    return config


def salvar_config(config: dict) -> None:
    RAIZ.mkdir(exist_ok=True)
    _arquivo_config().write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')


def slug(nome: str) -> str:
    s = unicodedata.normalize('NFKD', nome).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or 'projeto'


def pasta(id: str) -> Path:
    p = (RAIZ / id).resolve()
    if p.parent != RAIZ.resolve() or not (p / 'projeto.json').exists():
        raise FileNotFoundError(id)
    return p


def novo_id(nome: str) -> str:
    base, n = slug(nome), 1
    id = base
    while (RAIZ / id).exists():
        n += 1
        id = f'{base}-{n}'
    return id


def criar(id: str, nome: str, fontes: list[dict], briefing: dict, motor: str | None = None) -> dict:
    motor = motor or ler_config()['motor_padrao']
    projeto = {
        'id': id,
        'nome': nome,
        'criado_em': datetime.now().isoformat(timespec='seconds'),
        'saida': SAIDA,
        'fontes': fontes,
        'briefing': briefing,
        'enquadramento': {'x': 0.5},
        'timeline': {'trilhas': {'V1': [], 'V2': [], 'V3': [], 'LEG': []}},
        'etapas': {e: 'pendente' for e in ETAPAS},
        'chats': {e: [] for e in ETAPAS},
        'historico': [],
        'versoes': [],
        'pipeline': {'passos': {}, 'erro': None},
        'transcricoes': registro_de_motores(),
        'motor_inicial': motor,  # o do momento da criação: mudar a configuração depois não altera projetos existentes
        'transcricao_ativa': motor,
    }
    salvar(projeto)
    return projeto


def salvar(projeto: dict) -> None:
    arquivo = RAIZ / projeto['id'] / 'projeto.json'
    tmp = arquivo.with_suffix('.tmp')
    tmp.write_text(json.dumps(projeto, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(arquivo)


def atualizar(id: str, mudar) -> dict:
    """Lê, aplica `mudar(projeto)` e salva, sem perder gravações concorrentes."""
    with _trava:
        p = ler(id)
        mudar(p)
        salvar(p)
        return p


def registro_de_motores() -> dict:
    return {vid: {'nome': m['nome'], 'familia': m['familia'], 'status': 'pendente'} for vid, m in MOTORES.items()}


def arquivo_palavras(base: Path, vid: str) -> Path:
    return base / 'transcricoes' / f'{vid}.json'


def escrever_palavras(base: Path, vid: str, palavras: list[dict]) -> None:
    arq = arquivo_palavras(base, vid)
    arq.parent.mkdir(exist_ok=True)
    arq.write_text(json.dumps({'palavras': palavras}, ensure_ascii=False, indent=1), encoding='utf-8')


def ler_palavras(id: str, vid: str | None = None) -> list[dict]:
    """Palavras de uma variante (a ativa, se `vid` não for dado)."""
    p = ler(id)
    return json.loads(arquivo_palavras(pasta(id), vid or p['transcricao_ativa']).read_text(encoding='utf-8'))['palavras']


def _migrar(p: dict) -> None:
    """Projetos da época de uma transcrição só (transcricao.json) viram o conjunto de variantes."""
    base = RAIZ / p['id']
    p['transcricoes'] = registro_de_motores()
    p['transcricao_ativa'] = p['motor_inicial'] = LEGADO
    antigo = base / 'transcricao.json'
    if antigo.exists():
        refinadas = json.loads(antigo.read_text(encoding='utf-8'))['palavras']
        puras = [{**w, 'inicio': w.get('inicio_whisper', w['inicio']), 'fim': w.get('fim_whisper', w['fim'])} for w in refinadas]
        for w in puras:
            w.pop('inicio_whisper', None)
            w.pop('fim_whisper', None)
        escrever_palavras(base, 'whisper-stable', refinadas)
        escrever_palavras(base, 'whisper', puras)
        for vid, palavras in (('whisper-stable', refinadas), ('whisper', puras)):
            p['transcricoes'][vid].update(status='pronto', palavras=len(palavras))
        antigo.rename(antigo.with_suffix('.json.antigo'))
        if 'cortes' in p:  # os motores extras ainda não rodaram: o servidor os retoma ao subir
            p['pipeline']['passos']['variantes'] = {'status': 'pendente'}
    salvar(p)


def ler(id: str) -> dict:
    p = json.loads((pasta(id) / 'projeto.json').read_text(encoding='utf-8'))
    if 'transcricoes' not in p:
        _migrar(p)
    elif any(vid not in p['transcricoes'] for vid in MOTORES):  # motor acrescentado depois que o projeto foi criado
        for vid, m in registro_de_motores().items():
            p['transcricoes'].setdefault(vid, m)
        salvar(p)
    if any(e not in p['etapas'] for e in ETAPAS):  # etapa criada depois do projeto (ex.: Direção visual)
        p['etapas'] = {e: p['etapas'].get(e, 'pendente') for e in ETAPAS}
        p['chats'] = {e: p['chats'].get(e, []) for e in ETAPAS}
        salvar(p)
    return p


def ativar_variante(p: dict, vid: str) -> bool:
    """Troca a transcrição que aparece. Dentro da mesma família (mesmo texto) os cortes continuam; ao mudar de família,
    os cortes da família atual são guardados e os da nova voltam (se já existirem). Devolve True se a nova família
    ainda precisa de cortes (o chamador os enfileira)."""
    t = p['transcricoes'].get(vid)
    if t is None or t['status'] != 'pronto':
        raise ValueError('Essa transcrição ainda não está pronta.')
    atual = p['transcricoes'][p['transcricao_ativa']]['familia']
    precisa = False
    if t['familia'] != atual:
        familias = p.setdefault('familias', {})
        familias[atual] = {'cortes': p.pop('cortes', None), 'V1': p['timeline']['V1'], 'etapa': p['etapas']['cortes']}
        guardado = familias.pop(t['familia'], None)
        if guardado and guardado['cortes']:
            p['cortes'], p['timeline']['V1'], p['etapas']['cortes'] = guardado['cortes'], guardado['V1'], guardado['etapa']
        else:
            p['timeline']['V1'], p['etapas']['cortes'], precisa = [], 'pendente', True
    p['transcricao_ativa'] = vid
    return precisa


def listar() -> list[dict]:
    if not RAIZ.exists():
        return []
    projetos = [json.loads(p.read_text(encoding='utf-8')) for p in RAIZ.glob('*/projeto.json')]
    resumo = [
        {'id': p['id'], 'nome': p['nome'], 'criado_em': p['criado_em'], 'etapas': p['etapas'],
         'apoios': sum(f['papel'] == 'apoio' for f in p['fontes']),
         'duracao': next((f['duracao'] for f in p['fontes'] if f['papel'] == 'bruto'), None)}
        for p in projetos
    ]
    return sorted(resumo, key=lambda p: p['criado_em'], reverse=True)
