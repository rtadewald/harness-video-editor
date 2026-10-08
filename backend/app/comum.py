"""Peças comuns do backend: o `.env`, os modelos de linguagem (OpenRouter), a mídia que vai para eles, o normalizador de
texto e a gravação atômica de JSON."""
import base64
import json
import os
import re
import tempfile
from pathlib import Path

from dotenv import load_dotenv

ENV = Path(__file__).resolve().parents[1] / '.env'
# o front (Vite), que serve as páginas de render da exportação e dos motions
FRONT = os.environ.get('HARNESS_FRONT', 'http://localhost:5173')
FIM_DE_FRASE = ('.', '?', '!', '…')


def carregar_env() -> None:
    """Relê o `.env` (pega uma chave de API posta lá sem reiniciar o servidor)."""
    load_dotenv(ENV, override=True)


def chat(modelo: str, *, temperatura: float = 0, timeout_s: int = 180, max_tokens: int | None = None, raciocinio: str | None = None):
    """Um modelo do OpenRouter (LangChain). O timeout vai em ms: uma chamada travada não prende a fila; `max_tokens`
    limita a saída (o OpenRouter reserva crédito pelo máximo)."""
    from langchain_openrouter import ChatOpenRouter

    kw: dict = {'model': modelo, 'temperature': temperatura, 'timeout': timeout_s * 1000, 'max_retries': 1}
    if max_tokens:
        kw['max_tokens'] = max_tokens
    if raciocinio:
        kw['reasoning'] = {'effort': raciocinio}
    return ChatOpenRouter(**kw)


def imagem(arq: Path) -> dict:
    """Um JPEG como bloco de imagem da mensagem."""
    return {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(Path(arq).read_bytes()).decode()}}


def video(arq: Path) -> dict:
    """Um MP4 como bloco de vídeo da mensagem (o `langchain-openrouter` converte para `video_url` com data URL)."""
    return {'type': 'video', 'base64': base64.b64encode(Path(arq).read_bytes()).decode(), 'mime_type': 'video/mp4'}


def norm(t: str) -> str:
    """Uma palavra só com letras e números, em minúsculas: para casar textos que diferem em pontuação e caixa."""
    return re.sub(r'[^\wÀ-ÿ]', '', t.lower())


def salvar_json(arq: Path, dados, indent: int | None = 1) -> None:
    """Grava em um temporário ao lado e troca de uma vez: uma leitura no meio nunca pega o arquivo pela metade."""
    arq = Path(arq)
    arq.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=arq.parent, prefix=f'.{arq.name}.', suffix='.tmp')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=indent)
    os.replace(tmp, arq)


def ler_json(arq: Path):
    return json.loads(Path(arq).read_text(encoding='utf-8'))


def numero(v, lo: float, hi: float, casas: int = 4) -> float:
    """Um número (não booleano) preso entre `lo` e `hi`; levanta ValueError se não for número."""
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        raise ValueError('Valor numérico esperado')
    return round(max(lo, min(hi, float(v))), casas)


def curva(v, casas: int = 4) -> list[float]:
    """Uma cubic-bezier válida: 4 números, x (tempo) entre 0 e 1 e y entre -1 e 2 (passar do ponto e voltar)."""
    if not isinstance(v, list) or len(v) != 4:
        raise ValueError('A curva são 4 números (cubic-bezier)')
    return [numero(v[0], 0, 1, casas), numero(v[1], -1, 2, casas), numero(v[2], 0, 1, casas), numero(v[3], -1, 2, casas)]
