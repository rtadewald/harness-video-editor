"""Os códigos copiáveis (docs/editor-claude.md, Q18): dados uma vez, na ordem de criação, nunca reaproveitados."""
import json

import pytest

from app import banco, codigos, comum, presets


def _item(bid, criado, pai=None, nome=None):
    d = banco.RAIZ / bid
    d.mkdir(parents=True)
    i = {'id': bid, 'nome': nome or bid, 'criado_em': criado}
    if pai:
        i.update(pai=pai, inicio=0, fim=1)
    (d / 'item.json').write_text(json.dumps(i))


def test_atribuir_na_ordem_e_sem_reaproveitar(monkeypatch, tmp_path):
    monkeypatch.setattr(presets, 'RAIZ', tmp_path / 'presets')
    _item('bbbbbbbbbb', '2026-10-02T00:00:00', nome='Segundo')
    _item('aaaaaaaaaa', '2026-10-01T00:00:00', nome='Primeiro')
    _item('cccccccccc', '2026-10-03T00:00:00', pai='aaaaaaaaaa')
    reg = codigos.atribuir()
    assert reg['BAN-001'] == {'tipo': 'midia', 'id': 'aaaaaaaaaa'} and reg['BAN-002']['id'] == 'bbbbbbbbbb'
    assert reg['BAN-001.1'] == {'tipo': 'trecho', 'id': 'cccccccccc', 'pai': 'aaaaaaaaaa'}
    # apagar não libera o número: o próximo item ganha o seguinte, e o código antigo resolve como removido
    (banco.RAIZ / 'bbbbbbbbbb' / 'item.json').unlink()
    _item('dddddddddd', '2026-10-04T00:00:00')
    reg = codigos.atribuir()
    assert reg['BAN-003']['id'] == 'dddddddddd' and reg['BAN-002']['id'] == 'bbbbbbbbbb'
    assert codigos.resolver('BAN-002')['existe'] is False
    r = codigos.resolver('ban-1 · Primeiro')
    assert (r['codigo'], r['nome'], r['existe']) == ('BAN-001', 'Primeiro', True)
    assert codigos.resolver('BAN-001.1')['pai'] == 'aaaaaaaaaa'
    for ruim in ('nada', 'BAN-999'):
        with pytest.raises(ValueError):
            codigos.resolver(ruim)


def test_registro_do_19_e_projeto_que_virou_referencia(tmp_path):
    """Os números que vieram do 19 continuam; um projeto do 19 que aqui só existe como referência resolve para ela."""
    codigos.REGISTRO.write_text(json.dumps({'PRJ-07': {'tipo': 'projeto', 'id': 'mvi-0718'}, 'BAN-074': {'tipo': 'midia', 'id': 'zzzzzzzzzz'}}))
    ref = comum.DADOS / 'referencias' / 'prj-mvi-0718-v3'
    ref.mkdir(parents=True)
    (ref / 'referencia.json').write_text(json.dumps({'id': 'prj-mvi-0718-v3', 'nome': 'IA que conversa'}))
    r = codigos.resolver('PRJ-07·p3')
    assert (r['referencia'], r['plano'], r['nome'], r['existe']) == ('prj-mvi-0718-v3', 'p3', 'IA que conversa', True)
    assert codigos.mapa()['referencia']['prj-mvi-0718-v3'] == 'REF-01'  # a referência ganha o próprio código
    assert codigos.resolver('BAN-074')['existe'] is False


def test_rotas(cliente):
    _item('aaaaaaaaaa', '2026-10-01T00:00:00', nome='Primeiro')
    assert cliente.get('/api/codigos').json()['midia'] == {'aaaaaaaaaa': 'BAN-001'}
    assert cliente.get('/api/codigos/BAN-001').json()['nome'] == 'Primeiro'
    assert cliente.get('/api/codigos/BAN-009').status_code == 404
