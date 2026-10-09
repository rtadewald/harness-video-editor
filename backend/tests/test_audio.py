"""Áudio (SPEC §8.9; docs/audio.md): as escolhas, a voz limpa (sem rodar o DeepFilterNet nem o ElevenLabs), as falas e o
ducking, a cadeia no ffmpeg com o −14 LUFS e as rotas."""
import json
import re
import shutil
import subprocess
import types

import numpy as np
import pytest

from apoio import criar_projeto
from app import audio, exportacao, projeto, trilhas


def test_escolhas_padrao_e_validar():
    a = audio.do_projeto({})
    assert a == {'voz': {'limpeza': 'leve', 'timbre': 'natural'}, 'fundo': None, 'fundo_mudo': False,
                 'niveis': {'ator': 0.0, 'presets': 0.0, 'transicoes': 0.0, 'fundo': 0.0}}
    novo = audio.validar({'voz': {'limpeza': 'forte'}, 'niveis': {'fundo': -40, 'ator': 2.25}, 'fundo_mudo': 1}, a)
    assert novo['voz'] == {'limpeza': 'forte', 'timbre': 'natural'} and novo['niveis']['fundo'] == -12 and novo['niveis']['ator'] == 2.2
    assert novo['fundo_mudo'] is True and a['voz']['limpeza'] == 'leve'  # não mexe no original
    for ruim in ({'voz': {'limpeza': 'total'}}, {'voz': {'timbre': 'grave'}}, {'niveis': {'voz': 1}}, {'fundo': 'nao-existe'}):
        with pytest.raises(ValueError):
            audio.validar(ruim, a)


def test_falas_juntam_pausas_curtas():
    ws = [{'saida_ini': a, 'saida_fim': b} for a, b in ((0, 1), (1.3, 2), (3.0, 3.5), (3.6, 4))]
    assert audio.falas(ws) == [(0, 2), (3.0, 4)]


def _avaliar(expr: str, t: float) -> float:
    return eval(expr, {'clip': lambda x, a, b: min(max(x, a), b), 'min': min, 't': t})  # noqa: S307 — só a expressão gerada aqui


def test_ducking_igual_na_expressao_do_ffmpeg_e_em_python():
    trechos = [(1.0, 2.0), (4.0, 4.5)]
    assert audio.expressao_ducking([], 3) == '1' and audio.expressao_ducking(trechos, 0) == '1'
    e = audio.expressao_ducking(trechos, 3)
    for t in (0, 0.9, 1.0, 1.5, 2.2, 2.5, 3.0, 4.2, 5):
        assert _avaliar(e, t) == pytest.approx(audio.ganho_ducking(trechos, t, 3), abs=1e-3)
    assert audio.ganho_ducking(trechos, 1.5, 3) == pytest.approx(audio.db(-3), abs=1e-4)  # na fala: 3 dB abaixo
    assert audio.ganho_ducking(trechos, 3.0, 3) == 1  # longe das falas: o nível cheio


def test_cadeia_da_voz():
    assert audio.cadeia_voz('natural', 0).startswith('highpass=f=80,acompressor=')
    q = audio.cadeia_voz('quente', -3)
    assert q.count('equalizer=') == 2 and 'f=180' in q and q.endswith('volume=-3.0dB')


@pytest.fixture
def faixa():
    """Uma faixa de fundo de teste na biblioteca (ruído rosa estéreo, um ruído em cada canal, em `trilhas.LUFS`)."""
    trilhas.RAIZ.mkdir(parents=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=c=pink:d=4:a=0.1:seed=1', '-f', 'lavfi', '-i', 'anoisesrc=c=pink:d=4:a=0.1:seed=2',
                    '-filter_complex', f'amerge=inputs=2,loudnorm=I={trilhas.LUFS}', '-ar', '48000', '-c:a', 'aac', str(trilhas.RAIZ / 'ruido.m4a')], check=True)
    (trilhas.RAIZ / 'catalogo.json').write_text(json.dumps({'faixas': [{'id': 'ruido', 'nome': 'Ruído'}]}))
    return trilhas.RAIZ / 'ruido.m4a'


def _lufs(arq):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(arq), '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True)
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1])


def _voz_realista(arq, dur=8.0):
    """Uma "fala" de teste: sílabas de ruído filtrado com envelope e alguns golpes curtos (a distância entre o pico e a
    sonoridade de uma voz de verdade, ~20 dB; um seno puro passaria no −14 sem pôr o limitador à prova)."""
    rng = np.random.default_rng(7)
    taxa = 48000
    x = np.zeros(int(dur * taxa))
    t = 0.2
    while t < dur - 0.4:
        n = int(rng.uniform(0.08, 0.25) * taxa)
        i0 = int(t * taxa)
        env = np.sin(np.linspace(0, np.pi, n)) ** 2 * rng.uniform(0.3, 1)
        x[i0:i0 + n] += np.convolve(rng.normal(0, 1, n), np.ones(12) / 12, mode='same') * env * 0.05
        t += n / taxa + rng.uniform(0.02, 0.15)
    for k in rng.integers(0, len(x) - 200, 6):  # os golpes (plosivas)
        x[k:k + 60] += np.hanning(60) * 0.5
    sf = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(taxa), '-ac', '1', '-i', '-', str(arq)], input=sf, check=True)


def _medida(arq, af=''):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(arq), '-af', f'{af}ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)[-1]), float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)[-1])


def _nivel(arq, af):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(arq), '-af', f'{af},volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True)
    return float(re.findall(r'mean_volume:\s+(-?[\d.]+|-inf) dB', r.stderr)[-1])


def test_mistura_no_ffmpeg_em_14_lufs(tmp_path, faixa):
    """Uma voz com picos de voz de verdade, a cadeia, o fundo com ducking: −14 LUFS (±0,5) e o pico abaixo de −1 dBTP,
    e o fundo em estéreo mesmo sem nenhum som (a voz não puxa a mistura para mono)."""
    voz = tmp_path / 'voz.wav'
    _voz_realista(voz)
    i_voz, tp_voz = _medida(voz)
    assert tp_voz - i_voz > 15  # a voz de teste tem a distância de uma voz real entre pico e sonoridade
    clipes = [{'inicio': 0.5, 'fim': 4.0}, {'inicio': 4.5, 'fim': 7.5}]
    a = {'voz': voz, 'voz_lufs': audio.lufs(voz, como_voz=True), 'timbre': 'clara', 'niveis': {'ator': 0, 'presets': 0, 'transicoes': 0, 'fundo': 0},
         'fundo': faixa, 'laco': None, 'fundo_mudo': False, 'falas': [(0.2, 1.4)], 'ducking_db': 3}
    dur = 6.5
    a['medida'] = audio.medir(a, clipes, [], dur)
    entradas, f = audio.filtros(a, clipes, [], 0, 'fim', dur, a['medida'])
    assert any('alimiter' in x for x in f) and not any('loudnorm' in x for x in f)
    saida = tmp_path / 'mix.m4a'
    r = subprocess.run(['ffmpeg', '-v', 'error', *entradas, '-filter_complex', ';'.join(f), '-map', '[fim]', '-t', f'{dur}', '-c:a', 'aac', '-b:a', '320k',
                        str(saida)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-400:]
    i, tp = _medida(saida)
    assert i == pytest.approx(audio.LUFS, abs=0.5) and tp <= -1.0
    dur_saida = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(saida)], capture_output=True, text=True).stdout)
    assert dur_saida == pytest.approx(dur, abs=0.05)
    assert _nivel(saida, 'pan=mono|c0=c0-c1') > -60  # o fundo (ruído estéreo) continua estéreo


def test_voz_entra_em_estereo_com_ganho_1(tmp_path):
    """A voz mono vai igual aos dois canais (como o navegador toca), e a sonoridade dela é medida assim: um mono e o
    mesmo som em dois canais iguais (o bruto) medem igual, e o bruto entra na mistura no nível de cada canal."""
    mono, duplo = tmp_path / 'm.wav', tmp_path / 'd.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=300:d=3', '-af', 'volume=0.1', '-ac', '1', str(mono)], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(mono), '-af', 'pan=stereo|c0=c0|c1=c0', str(duplo)], check=True)
    assert audio.lufs(mono, como_voz=True) == pytest.approx(audio.lufs(duplo, como_voz=True), abs=0.1)
    assert audio.lufs(mono, como_voz=True) == pytest.approx(audio.lufs(mono) + 3.0, abs=0.15)
    clipes = [{'inicio': 0.0, 'fim': 3.0}]
    a = {'voz': mono, 'voz_lufs': -20.0, 'timbre': 'natural', 'niveis': dict.fromkeys(audio.TRILHAS, 0.0), 'fundo': None, 'fundo_mudo': False,
         'falas': [], 'ducking_db': 3}
    entradas, f = audio.filtros(a, clipes, [], 0, 'fim', 3.0, {'ganho': 0.0})
    saida = tmp_path / 'v.wav'
    subprocess.run(['ffmpeg', '-v', 'error', *entradas, '-filter_complex', ';'.join(f), '-map', '[fim]', str(saida)], check=True)
    # cada canal no nível do mono (o compressor quase não age a −23 dBFS), com a voz mono e com a do bruto (dual-mono)
    assert _nivel(saida, 'pan=mono|c0=c0') == pytest.approx(_nivel(mono, 'anull'), abs=0.5)
    entradas, f = audio.filtros({**a, 'voz': duplo}, clipes, [], 0, 'fim', 3.0, {'ganho': 0.0})
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *entradas, '-filter_complex', ';'.join(f), '-map', '[fim]', str(saida)], check=True)
    assert _nivel(saida, 'pan=mono|c0=c1') == pytest.approx(_nivel(mono, 'anull'), abs=0.5)


def test_fundo_volta_no_laco_com_crossfade(tmp_path):
    """Uma faixa com introdução e fim em silêncio, num vídeo 2,5× mais longo: o laço fica no trecho com som e a música
    não some em nenhuma emenda das voltas."""
    trilhas.RAIZ.mkdir(parents=True)
    arq = trilhas.RAIZ / 'tom.m4a'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=c=pink:d=10:a=0.2:r=48000', '-af', "volume='between(t,1,9)':eval=frame,"
                    'pan=stereo|c0=c0|c1=c0', '-c:a', 'aac', str(arq)], check=True)
    (trilhas.RAIZ / 'catalogo.json').write_text(json.dumps({'faixas': [{'id': 'tom', 'nome': 'Tom'}]}))
    ini, fim = trilhas.laco('tom')
    assert 0.5 <= ini <= 1.6 and 8.4 <= fim <= 9.5
    assert audio.voltas_do_fundo((ini, fim), 5) == [(0.0, fim)]
    voltas = audio.voltas_do_fundo((ini, fim), 25)
    assert voltas[0] == (0.0, fim) and all(v == (ini, fim) for v in voltas[1:])
    assert fim + (len(voltas) - 1) * (fim - ini - audio.CRUZA_FUNDO) >= 25
    voz = tmp_path / 'mudo.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '25', str(voz)], check=True)
    a = {'voz': voz, 'voz_lufs': -20.0, 'timbre': 'natural', 'niveis': dict.fromkeys(audio.TRILHAS, 0.0), 'fundo': arq, 'laco': (ini, fim),
         'fundo_mudo': False, 'falas': [], 'ducking_db': 3}
    entradas, f = audio.filtros(a, [{'inicio': 0.0, 'fim': 25.0}], [], 0, 'fim', 25.0, {'ganho': 0.0})
    assert entradas.count(str(arq)) == len(voltas) and sum('acrossfade' in x for x in f) == len(voltas) - 1
    r = subprocess.run(['ffmpeg', '-v', 'error', *entradas, '-filter_complex', ';'.join(f), '-map', '[fim]', '-t', '25', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'],
                       capture_output=True)
    assert r.returncode == 0, r.stderr[-400:]
    x = np.frombuffer(r.stdout, np.float32)
    rms = np.sqrt((x[: len(x) // 2000 * 2000].reshape(-1, 2000) ** 2).mean(axis=1))  # janelas de 0,25 s
    trecho = 20 * np.log10(rms[int(1.2 * 4): int(23 * 4)] + 1e-9)  # da entrada da música até antes do fade do fim
    assert trecho.min() > np.median(trecho) - 4  # sem buraco nas emendas


def test_exportacao_com_audio_descarta_a_voz_do_bruto(tmp_path, faixa):
    """No comando final, a voz vem da entrada própria e a do bruto vai para um anullsink; sem `audio`, como antes."""
    video = tmp_path / 'v.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:r=24:d=3', '-f', 'lavfi', '-i', 'sine=d=3',
                    '-shortest', '-pix_fmt', 'yuv420p', str(video)], check=True)
    clipes = [{'inicio': 0.0, 'fim': 3.0}]
    a = {'voz': video, 'voz_lufs': -20.0, 'timbre': 'natural', 'niveis': dict.fromkeys(audio.TRILHAS, 0.0), 'fundo': faixa, 'fundo_mudo': False,
         'falas': [], 'ducking_db': 3}
    args = (video, clipes, False, 0.5, 180, 320, 24, [], [], 'h264', 3.0, tmp_path / 'o.mp4')
    cmd = exportacao.comando_final(*args, audio=a)
    fc = cmd[cmd.index('-filter_complex') + 1]
    assert '[ac]anullsink' in fc and 'loudnorm' in fc
    r = subprocess.run(cmd, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-400:]
    sem = exportacao.comando_final(*args)
    assert 'loudnorm' not in sem[sem.index('-filter_complex') + 1] and '[ac]anullsink' not in sem[sem.index('-filter_complex') + 1]


def _com_proxy(pid, video):
    """O proxy do bruto pronto (o pipeline é falso nos testes)."""
    p = projeto.ler(pid)
    bid = audio._bruto(p)['id']
    proxy = projeto.pasta(pid) / 'midia' / 'proxy' / f'{bid}.mp4'
    proxy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(video, proxy)
    projeto.atualizar(pid, lambda q: audio._bruto(q).__setitem__('proxy', f'midia/proxy/{bid}.mp4'))
    return proxy


@pytest.fixture
def fila(monkeypatch):
    """As limpezas postas na fila (sem rodar)."""
    pedidas = []
    monkeypatch.setattr(audio, '_fila', types.SimpleNamespace(submit=lambda f, *a: pedidas.append(a)))
    return pedidas


def test_voz_limpa_e_rotas(cliente, video, monkeypatch, faixa, fila):
    pid = criar_projeto(cliente, video)['id']
    r = cliente.get(f'/api/projetos/{pid}/audio').json()
    # sem o proxy do vídeo ainda (o pipeline roda): a limpeza espera, nada na fila
    assert r['escolhas']['voz']['limpeza'] == 'leve' and r['voz']['estado'] == 'falta' and not fila
    assert r['bruto_lufs'] is not None and r['voz_lufs'] is None  # a prévia toca a voz do bruto enquanto isso
    _com_proxy(pid, video)
    r = cliente.get(f'/api/projetos/{pid}/audio').json()
    assert r['voz']['estado'] == 'fila' and fila == [(pid, 'leve')]
    assert cliente.get(f'/api/projetos/{pid}/audio').json()['voz']['estado'] == 'fila' and len(fila) == 1  # não pede duas vezes
    assert cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'xx'}}}).status_code == 422
    r = cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'sem'}, 'fundo': 'ruido', 'niveis': {'fundo': -3}}}).json()
    assert r['voz']['estado'] == 'sem' and r['escolhas']['fundo'] == 'ruido' and r['escolhas']['niveis']['fundo'] == -3
    assert r['voz_lufs'] is not None and r['voz_lufs'] == r['bruto_lufs']  # a voz do bruto, medida e guardada
    assert r['laco']['id'] == 'ruido' and r['laco']['fim'] > r['laco']['ini']
    cat = cliente.get('/api/audio').json()
    assert [t['id'] for t in cat['trilhas']] == ['ruido'] and cat['lufs'] == -14 and 'quente' in cat['timbres'] and cat['cruza_fundo'] > 0
    assert cliente.get('/api/audio/trilhas/ruido.m4a').status_code == 200
    assert cliente.get('/api/audio/trilhas/nada.m4a').status_code == 404
    # a limpeza: o DeepFilterNet trocado por uma cópia; gera o wav, o proxy com a voz e marca pronta
    monkeypatch.setattr(audio, '_deepfilter', lambda e, s, lim: shutil.copy(e, s))
    monkeypatch.setattr(audio, 'APAGAR_DEPOIS', 0)  # os proxies das outras limpezas somem na hora (no app, 10 s depois)
    cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'media'}}})
    audio._limpar(pid, 'media')
    r = cliente.get(f'/api/projetos/{pid}/audio').json()
    assert r['voz']['estado'] == 'pronta' and r['voz']['proxy'].endswith('_voz_media.mp4') and r['voz']['versao'] is None
    assert (projeto.pasta(pid) / r['voz']['proxy']).exists() and r['voz_lufs'] is not None
    assert 'lufs' not in projeto.ler(pid)['audio'] and projeto.ler(pid)['audio']['voz_lufs']
    # a exportação usa a voz limpa
    clipes = projeto.ler(pid)['timeline']['V1']
    ex = audio.da_exportacao(pid, projeto.ler(pid), clipes)
    assert ex['voz'].name.endswith('_media.wav') and ex['fundo'].name == 'ruido.m4a' and ex['laco'] and ex['aviso'] is None
    # outra limpeza pronta apaga o proxy com a voz da anterior (o wav fica)
    cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'forte'}}})
    audio._limpar(pid, 'forte')
    proxies = sorted(x.name for x in (projeto.pasta(pid) / 'midia' / 'proxy').glob('*_voz_*.mp4'))
    assert proxies == [f"{audio._bruto(projeto.ler(pid))['id']}_voz_forte.mp4"]
    assert audio.arquivo_voz(pid, audio._bruto(projeto.ler(pid))['id'], 'media').exists()
    # trocar para outra e voltar antes de ela terminar: quando ela termina, não apaga o proxy da escolhida (só o dela,
    # que ninguém toca; refeito em segundos se ela voltar a ser a escolha)
    bid = audio._bruto(projeto.ler(pid))['id']
    cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'leve'}}})
    assert cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'forte'}}}).json()['voz']['estado'] == 'pronta'
    audio._limpar(pid, 'leve')
    pasta = projeto.pasta(pid) / 'midia' / 'proxy'
    assert (pasta / f'{bid}_voz_forte.mp4').exists() and not (pasta / f'{bid}_voz_leve.mp4').exists()
    assert cliente.get(f'/api/projetos/{pid}/audio').json()['voz']['estado'] == 'pronta'
    # voltar para uma limpeza que já está pronta (sem job novo) também apaga os proxies das outras
    cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'media'}}})
    audio._limpar(pid, 'media')
    assert sorted(x.name for x in pasta.glob('*_voz_*.mp4')) == [f'{bid}_voz_media.mp4']
    shutil.copy(pasta / f'{bid}_voz_media.mp4', pasta / f'{bid}_voz_forte.mp4')  # como se a Forte ainda estivesse pronta
    assert cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'forte'}}}).json()['voz']['estado'] == 'pronta'
    assert sorted(x.name for x in pasta.glob('*_voz_*.mp4')) == [f'{bid}_voz_forte.mp4']
    # sem limpeza, a prévia toca o proxy do bruto: nenhum proxy com voz fica
    assert cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'sem'}}}).json()['voz']['estado'] == 'sem'
    assert not list(pasta.glob('*_voz_*.mp4'))


def test_limpeza_com_erro_so_volta_quando_pedida(cliente, video, fila):
    """Uma limpeza que falhou fica em `erro` (o GET não a refaz: seria um laço, e o isolamento é pago); um PUT com a
    limpeza pede de novo. Num reinício do servidor, as locais interrompidas voltam à fila e o isolamento vira erro."""
    pid = criar_projeto(cliente, video)['id']
    _com_proxy(pid, video)
    cliente.get(f'/api/projetos/{pid}/audio')
    audio._marcar(pid, 'leve', estado='erro', erro='DeepFilterNet falhou')
    fila.clear()
    for _ in range(3):
        r = cliente.get(f'/api/projetos/{pid}/audio').json()
        assert r['voz']['estado'] == 'erro' and r['voz']['erro'] == 'DeepFilterNet falhou' and not fila
    assert r['voz_lufs'] is None and r['bruto_lufs'] is not None  # a prévia volta à voz do bruto
    r = cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'niveis': {'ator': 1}}}).json()
    assert r['voz']['estado'] == 'erro' and not fila  # mexer em outra coisa não refaz
    r = cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'leve'}}}).json()
    assert r['voz']['estado'] == 'fila' and fila == [(pid, 'leve')]
    # o reinício: a local interrompida volta à fila; o isolamento, não
    fila.clear()
    audio.retomar_interrompidos()
    assert fila == [(pid, 'leve')] and audio.estado_voz(pid)['estado'] == 'fila'
    r = cliente.put(f'/api/projetos/{pid}/audio', json={'campos': {'voz': {'limpeza': 'isolamento'}}}).json()
    assert r['voz']['estado'] == 'fila'
    fila.clear()
    audio.retomar_interrompidos()
    assert not fila and audio.estado_voz(pid)['estado'] == 'erro' and 'interrompida' in audio.estado_voz(pid)['erro']
    assert cliente.get(f'/api/projetos/{pid}/audio').json()['voz']['estado'] == 'erro' and not fila


def test_limpeza_no_meio_de_um_reenquadrar(cliente, video, monkeypatch, fila):
    """Um Reenquadrar tira o proxy do bruto enquanto o refaz: a limpeza espera por ele (não monta o proxy com a voz do
    vídeo velho), e uma que termina depois da troca descarta o resultado."""
    pid = criar_projeto(cliente, video)['id']
    _com_proxy(pid, video)
    monkeypatch.setattr(audio, '_deepfilter', lambda e, s, lim: shutil.copy(e, s))
    audio._limpar(pid, 'leve')
    assert audio.estado_voz(pid)['estado'] == 'pronta'

    def trocar(q):  # o que o enquadramento.trocar faz: versão nova, o proxy retirado (o arquivo velho fica)
        audio._bruto(q).pop('proxy')
        q['enquadramento'] = {'x': 0.5, 'versao': 1}
    projeto.atualizar(pid, trocar)
    fila.clear()
    r = cliente.get(f'/api/projetos/{pid}/audio').json()
    assert r['voz']['estado'] == 'falta' and not fila  # o proxy da versão 1 ainda não existe
    audio._limpar(pid, 'leve')  # uma que já estava na fila
    assert audio.estado_voz(pid)['estado'] == 'falta' and not audio.proxy_voz(pid, projeto.ler(pid), 'leve').exists()
    # o proxy novo pronto: a limpeza é pedida e o proxy com a voz sai com a versão 1
    _com_proxy(pid, video)
    assert cliente.get(f'/api/projetos/{pid}/audio').json()['voz']['estado'] == 'fila' and fila == [(pid, 'leve')]
    # e uma que termina depois de outro Reenquadrar começar é descartada
    real = audio._proxy_com_voz

    def no_meio(*a):
        real(*a)
        projeto.atualizar(pid, lambda q: q['enquadramento'].__setitem__('versao', 2))
    monkeypatch.setattr(audio, '_proxy_com_voz', no_meio)
    audio._limpar(pid, 'leve')
    assert audio.estado_voz(pid)['estado'] == 'falta' and not list((projeto.pasta(pid) / 'midia' / 'proxy').glob('*_voz_leve_v1.mp4'))
    monkeypatch.setattr(audio, '_proxy_com_voz', real)
    audio._limpar(pid, 'leve')
    r = cliente.get(f'/api/projetos/{pid}/audio').json()
    assert r['voz']['estado'] == 'pronta' and r['voz']['proxy'].endswith('_voz_leve_v2.mp4') and r['voz']['versao'] == 2


def test_exportacao_sem_a_limpeza_usa_a_voz_do_bruto(cliente, video, monkeypatch):
    """Se a limpeza não roda (o DeepFilterNet não instala, sem rede), a exportação sai com a voz do bruto e um aviso."""
    pid = criar_projeto(cliente, video)['id']

    def quebrado(*a):
        raise RuntimeError('DeepFilterNet falhou: sem rede')
    monkeypatch.setattr(audio, '_deepfilter', quebrado)
    p = projeto.ler(pid)
    ex = audio.da_exportacao(pid, p, p['timeline']['V1'])
    assert ex['voz'] == projeto.pasta(pid) / audio._bruto(p)['arquivo'] and 'sem rede' in ex['aviso']
    assert ex['voz_lufs'] == audio.lufs_da_voz(pid, 'sem')
