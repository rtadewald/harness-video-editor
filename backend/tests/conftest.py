"""Fixtures de todos os testes: pastas temporárias, nada de serviço pago, um projeto de vídeo curto."""
import subprocess
import types

import pytest
from fastapi.testclient import TestClient

from app import banco, comum, direcao, main, pipeline, projeto, recorte_ator, referencias, rosto, sons


@pytest.fixture(autouse=True)
def _nada_real(tmp_path, monkeypatch):
    """Todo teste usa pastas temporárias: nenhum teste lê ou grava projetos, referências ou configurações de verdade."""
    monkeypatch.setattr(projeto, 'RAIZ', tmp_path / 'projetos')
    monkeypatch.setattr(referencias, 'RAIZ', tmp_path / 'referencias')
    monkeypatch.setattr(banco, 'RAIZ', tmp_path / 'banco')
    monkeypatch.setattr(sons, 'RAIZ', tmp_path / 'sons')  # a biblioteca de sons de verdade fica fora dos testes
    monkeypatch.setattr(comum, 'carregar_env', lambda: None)  # nenhum teste lê o .env de verdade (chaves de API)
    # o recorte e o rosto do ator (MediaPipe) não rodam sozinhos em segundo plano nos testes, nem baixam modelos
    for modulo in (recorte_ator, rosto):
        monkeypatch.setattr(modulo, '_fila', types.SimpleNamespace(submit=lambda f, *a: None))
    monkeypatch.setattr(rosto, 'detector_mediapipe', lambda: pytest.fail('teste tentou usar o detector de rosto de verdade'))


@pytest.fixture
def enfileirados(tmp_path, monkeypatch):
    monkeypatch.setattr(projeto, 'RAIZ', tmp_path / 'projetos')
    monkeypatch.setattr(referencias, 'RAIZ', tmp_path / 'referencias')
    monkeypatch.setattr(direcao, 'enfileirar', lambda id: chamadas.append(('referencia', id)))
    # isolamento total: nenhum teste lê o .env de verdade nem chama serviço pago (ElevenLabs, OpenRouter)
    for chave in ('ELEVENLABS_API_KEY', 'OPENROUTER_API_KEY'):
        monkeypatch.delenv(chave, raising=False)
    projeto.salvar_config({'motor_padrao': 'whisper-stable'})  # o padrão de fábrica é o ElevenLabs; os testes partem do Whisper
    chamadas = []
    monkeypatch.setattr(pipeline, 'enfileirar', lambda id, passos=pipeline.PASSOS: chamadas.append((id, passos)))
    # motores extras: nos testes nunca rodam de verdade (são modelos pesados); só registramos que foram pedidos
    monkeypatch.setattr(pipeline, '_fila_motores', types.SimpleNamespace(submit=lambda f, *a: chamadas.append(('motores', *a))))
    return chamadas


@pytest.fixture
def cliente(enfileirados):
    return TestClient(main.app)


@pytest.fixture(scope='session')
def video(tmp_path_factory):
    """Vídeo vertical de 3 s: 1 s de tom, 1 s de silêncio, 1 s de tom."""
    arq = tmp_path_factory.mktemp('midia') / 'teste.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=30:duration=3',
                    '-f', 'lavfi', '-i', "aevalsrc='if(between(t,1,2),0,sin(2*PI*440*t))':d=3",
                    '-shortest', '-pix_fmt', 'yuv420p', str(arq)], check=True)
    return arq
