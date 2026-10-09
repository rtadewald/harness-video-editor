"""A limpeza da voz com o DeepFilterNet 3 (docs/audio.md). NÃO é importado pelo app: roda num ambiente Python à parte
(o DeepFilterNet 0.5.6 pede o torchaudio antigo, `audio.DEEPFILTER`), chamado por `audio._deepfilter`.

    python _voz_deepfilter.py <entrada.wav 48 kHz mono> <saida.wav> <limite em dB | 0 = sem limite>
"""
import sys

from df.enhance import enhance, init_df, load_audio, save_audio


def main() -> None:
    entrada, saida, limite = sys.argv[1], sys.argv[2], float(sys.argv[3])
    modelo, estado, _ = init_df(log_level='ERROR', log_file=None)
    audio, _ = load_audio(entrada, sr=estado.sr())
    limpo = enhance(modelo, estado, audio, atten_lim_db=limite or None)
    save_audio(saida, limpo, estado.sr())


if __name__ == '__main__':
    main()
