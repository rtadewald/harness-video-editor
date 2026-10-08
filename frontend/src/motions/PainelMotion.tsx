import { Clapperboard, Trash2, Wand2 } from "lucide-react";
import {
  tirarMotionDoPlano,
  urlMiniaturaMotionPlano,
  type MotionPlano,
} from "./api";

const BOTAO =
  "flex items-center gap-1 rounded-full border border-line-dark px-3 py-1 font-semibold text-fog hover:text-cream";
const falhar = (e: unknown) => window.alert((e as Error).message);

/** O motion de um plano no painel da esquerda da etapa Inserts: o escolhido (miniatura, versão, editar ou trocar, tirar)
 *  ou o convite para criar/escolher um (`abrir` abre o modal). */
export default function PainelMotion(p: {
  projetoId: string;
  plano: string;
  motion: MotionPlano | undefined;
  abrir: () => void;
  mudou: () => void;
}) {
  if (!p.motion)
    return (
      <button
        onClick={() => p.abrir()}
        className="grid place-items-center gap-2 rounded-[8px] border border-dashed border-yellow/40 px-4 py-10 text-center text-[12.5px] text-fog transition-colors hover:border-yellow hover:text-cream"
      >
        <Clapperboard className="size-6 text-yellow" />
        Criar ou escolher um motion
      </button>
    );
  return (
    <div className="grid gap-3 rounded-[8px] bg-cream/[0.04] p-3 ring-1 ring-line-dark">
      <div className="flex items-center gap-3">
        <img
          src={urlMiniaturaMotionPlano(p.projetoId, p.plano, p.motion)}
          alt=""
          className="h-20 w-auto rounded-[4px] object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{p.motion.nome}</p>
          <p className="text-[11.5px] text-fog">
            v{p.motion.versao} · {Object.keys(p.motion.campos).length} campos
          </p>
        </div>
      </div>
      <div className="flex gap-2 text-[11px]">
        <button onClick={() => p.abrir()} className={BOTAO}>
          <Wand2 className="size-3" /> Editar ou trocar
        </button>
        <button
          onClick={() =>
            window.confirm("Tirar o motion deste plano?") &&
            void tirarMotionDoPlano(p.projetoId, p.plano)
              .then(p.mudou)
              .catch(falhar)
          }
          className={BOTAO}
        >
          <Trash2 className="size-3" /> Tirar
        </button>
      </div>
    </div>
  );
}
