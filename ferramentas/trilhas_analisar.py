"""Ferramenta do Claude: a música de fundo das referências (docs/audio.md), para gerar as faixas e acertar os níveis.

Para cada referência (os primeiros 90 s), o Demucs (htdemucs, num ambiente à parte com torch 2.3, como o DeepFilterNet) separa a voz do
resto; no resto ("no_vocals": a música e os efeitos) mede-se, em janelas de 0,4 s:
- se há música (o nível mediano do resto acima de −50 dBFS);
- o nível da música em relação à voz (mediana do resto − mediana da voz, nas janelas com fala);
- o ducking (o resto nas janelas sem fala − nas janelas com fala: positivo = a música sobe quando a voz para);
- o andamento (BPM, librosa).
A mediana deixa de fora os golpes curtos dos efeitos (whoosh, clique). Grava `trilhas/analise.json` e os trechos da
música sozinha em `trilhas/analise/<ref>.mp3` (20 s do meio, para ouvir e para descrever com `--descrever`, que manda
alguns trechos a um modelo multimodal pela OpenRouter e guarda a descrição de estilo, instrumentos e clima).

    uv run --project backend python ferramentas/trilhas_analisar.py [--descrever]
"""
import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
REFS = RAIZ / 'dados' / 'referencias'
SAIDA = RAIZ / 'dados' / 'trilhas'
CACHE = SAIDA / 'analise'
DUPLICADAS = {'52-processo-ds-1'}
TAXA = 22050
JANELA = 0.4
DEMUCS = ['uv', 'run', '--no-project', '--python', '3.11', '--with', 'demucs==4.0.1', '--with', 'torch==2.3.1', '--with', 'torchaudio==2.3.1',
          '--with', 'numpy<2', '--with', 'soundfile', 'python', '-m', 'demucs', '--two-stems', 'vocals', '-n', 'htdemucs']


def ler(arq: Path) -> np.ndarray:
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(arq), '-ac', '1', '-ar', str(TAXA), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).astype(np.float64)


def niveis(x: np.ndarray) -> np.ndarray:
    w = int(TAXA * JANELA)
    n = len(x) // w
    return 20 * np.log10(np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(1)) + 1e-9)


def separar(ref: str) -> tuple[Path, Path]:
    pasta = CACHE / 'htdemucs' / ref
    voz, resto = pasta / 'vocals.wav', pasta / 'no_vocals.wav'
    if not resto.exists():
        tmp = CACHE / f'{ref}.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-t', '90', '-i', str(REFS / ref / 'audio.wav'), str(tmp)], check=True)  # 90 s bastam
        subprocess.run([*DEMUCS, '-o', str(CACHE), str(tmp)], check=True, capture_output=True)
        tmp.unlink()
    return voz, resto


def medir(ref: str) -> dict:
    import librosa

    voz, resto = separar(ref)
    v, r = niveis(ler(voz)), niveis(ler(resto))
    n = min(len(v), len(r))
    v, r = v[:n], r[:n]
    fala = v > -38
    out = {'ref': ref, 'duracao': round(n * JANELA, 1), 'voz_db': round(float(np.median(v[fala])), 1) if fala.any() else None,
           'resto_db': round(float(np.median(r)), 1)}
    out['tem_musica'] = out['resto_db'] > -50
    if fala.any():
        out['musica_menos_voz_db'] = round(float(np.median(r[fala]) - np.median(v[fala])), 1)
    if fala.any() and (~fala).sum() > 5:  # o ducking só com pausas suficientes para medir
        out['ducking_db'] = round(float(np.median(r[~fala]) - np.median(r[fala])), 1)
        out['pausas'] = int((~fala).sum())
    y = ler(resto)
    tempo, _ = librosa.beat.beat_track(y=y.astype(np.float32), sr=TAXA)
    out['bpm'] = round(float(np.atleast_1d(tempo)[0]), 1)
    # 20 s do meio da música sozinha, para ouvir e descrever
    meio = max(out['duracao'] / 2 - 10, 0)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{meio:.1f}', '-t', '20', '-i', str(resto), '-ac', '1', '-b:a', '96k', str(CACHE / f'{ref}.mp3')], check=True)
    return out


def descrever(refs: list[str]) -> str:
    """Um modelo multimodal ouve os trechos de música e descreve o estilo em comum (para os prompts do Lyria)."""
    import httpx

    sys.path.insert(0, str(RAIZ / 'backend'))
    from app import comum  # noqa: E402

    comum.carregar_env()
    partes = [{'type': 'text', 'text': (
        'Estes são trechos da música de fundo (já sem a voz) de vídeos curtos (Reels) de um professor de IA e programação. '
        'Descreva, em inglês, para servir de base a prompts de um gerador de música: o gênero e subgênero, o andamento, '
        'os instrumentos e timbres, a energia, o clima, a mixagem (quanto espaço deixa para a voz) e o que se repete entre '
        'os trechos. Depois, para cada trecho, uma linha curta com o que o diferencia. Seja concreto (sem adjetivos vagos).')}]
    for ref in refs:
        dados = base64.b64encode((CACHE / f'{ref}.mp3').read_bytes()).decode()
        partes += [{'type': 'text', 'text': f'Trecho: {ref}'}, {'type': 'input_audio', 'input_audio': {'data': dados, 'format': 'mp3'}}]
    r = httpx.post('https://openrouter.ai/api/v1/chat/completions', timeout=300,
                   headers={'Authorization': f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
                   json={'model': 'google/gemini-2.5-flash', 'messages': [{'role': 'user', 'content': partes}]})
    r.raise_for_status()
    return r.json()['choices'][0]['message']['content']


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    arq = SAIDA / 'analise.json'
    anterior = json.loads(arq.read_text()) if arq.exists() else {}
    refs = sorted(p.parent.name for p in REFS.glob('*/audio.wav') if p.parent.name not in DUPLICADAS)
    medidas = []
    for ref in refs:
        m = medir(ref)
        medidas.append(m)
        print(json.dumps(m, ensure_ascii=False), file=sys.stderr)
    com = [m for m in medidas if m['tem_musica'] and 'musica_menos_voz_db' in m]
    resumo = {
        'com_musica': f'{len(com)}/{len(medidas)}',
        'musica_menos_voz_db': round(float(np.median([m['musica_menos_voz_db'] for m in com])), 1) if com else None,
        'ducking_db': round(float(np.median([m['ducking_db'] for m in com if 'ducking_db' in m])), 1) if any('ducking_db' in m for m in com) else None,
        'bpm': sorted(m['bpm'] for m in com),
    }
    saida = {'referencias': medidas, 'resumo': resumo, 'descricao': anterior.get('descricao')}
    if '--descrever' in sys.argv:
        saida['descricao'] = descrever([m['ref'] for m in com])
    arq.write_text(json.dumps(saida, ensure_ascii=False, indent=1))
    print(json.dumps(resumo, ensure_ascii=False))
    if saida['descricao']:
        print(saida['descricao'])


if __name__ == '__main__':
    main()
