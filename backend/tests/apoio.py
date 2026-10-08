"""Ajudantes dos testes."""


def criar_projeto(cliente, video, nome='E'):
    with video.open('rb') as b:
        return cliente.post('/api/projetos', data={'nome': nome}, files={'bruto': ('x.mp4', b, 'video/mp4')}).json()
