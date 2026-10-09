import { useRef, useState } from "react";
import { Film, Library, Sparkles, Trash2, Upload } from "lucide-react";
import { subirNoBanco, urlBancoMiniatura, type ItemBanco } from "@/api";
import SeletorBanco from "@/inserts/SeletorBanco";
import { cn } from "@/lib/utils";
import { GradePresets } from "./PresetMotion";
import { tirarMotionDoPlano, usarPreset, usarVideo, type Formato, type MotionPlano } from "./api";

const BOTAO = "flex items-center gap-1.5 rounded-full border border-line-dark px-3 py-1 text-[11px] font-semibold text-fog hover:text-cream";
const falhar = (e: unknown) => window.alert((e as Error).message);

/** O motion de um plano no painel da esquerda da etapa Inserts (SPEC §8.5): um **preset** (escolher na grade; os campos e
 *  o fundo ficam no card ao lado do vídeo, `EdicaoPreset`) ou um **vídeo** feito fora (subir ou escolher do banco; entra
 *  e sai seco, como um insert). */
export default function PainelMotion(p: {
  projetoId: string;
  plano: { id: string; tipo: string };
  motion: MotionPlano | undefined;
  mudou: () => void;
  bancoMudou: () => void;
}) {
  const formato: Formato = p.plano.tipo === "tela_dividida_motion" ? "dividida" : "vertical";
  const [aba, setAba] = useState<"preset" | "video">(p.motion?.tipo ?? "preset");
  const [escolhendo, setEscolhendo] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const feito = () => p.mudou();
  const video = (i: ItemBanco) => void usarVideo(p.projetoId, p.plano.id, formato, i.id).then(feito).catch(falhar);
  const subir = async (fs: File[]) => {
    if (!fs.length) return;
    setSubindo(true);
    try {
      const [novo] = await subirNoBanco(fs.slice(0, 1));
      p.bancoMudou();
      video(novo);
    } catch (e) {
      falhar(e);
    } finally {
      setSubindo(false);
    }
  };
  const tirar = () =>
    window.confirm("Tirar o motion deste plano?") && void tirarMotionDoPlano(p.projetoId, p.plano.id).then(feito).catch(falhar);

  const m = p.motion;
  const daAba = m?.tipo === aba ? m : undefined;
  return (
    <div className="grid gap-4">
      <div className="flex gap-1 rounded-full bg-cream/[0.04] p-1 ring-1 ring-line-dark">
        {(["preset", "video"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[11.5px] font-semibold", aba === a ? "bg-cream text-ink" : "text-fog hover:text-cream")}
          >
            {a === "preset" ? <Sparkles className="size-3.5" /> : <Film className="size-3.5" />}
            {a === "preset" ? "Preset" : "Vídeo"}
            {m?.tipo === a && <span className="size-1.5 rounded-full bg-coral" title="Em uso neste plano" />}
          </button>
        ))}
      </div>

      {daAba && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">✦ {daAba.nome}</p>
          <button onClick={tirar} className={BOTAO}>
            <Trash2 className="size-3" /> Tirar
          </button>
        </div>
      )}

      {aba === "preset" && (
        <>
          <p className="text-[11.5px] leading-[1.5] text-fog">
            {daAba ? "O texto e o fundo se editam no card ao lado do vídeo. Clicar em outro preset troca." : m?.tipo === "video" ? "Escolher um preset troca o vídeo deste plano." : "Escolha um preset; o texto e o fundo se editam no card ao lado do vídeo."}
          </p>
          <GradePresets
            formato={formato}
            atual={daAba?.tipo === "preset" ? daAba.preset : undefined}
            escolher={(pr) => void usarPreset(p.projetoId, p.plano.id, formato, pr.id).then(feito).catch(falhar)}
          />
        </>
      )}

      {aba === "video" && (
        <div
          className="grid gap-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void subir(Array.from(e.dataTransfer.files));
          }}
        >
          {daAba?.tipo === "video" && (
            <img src={urlBancoMiniatura(daAba.banco)} alt="" className={cn("w-40 rounded-[6px] object-cover ring-1 ring-line-dark", formato === "vertical" ? "aspect-[9/16]" : "aspect-[9/8]")} />
          )}
          <p className="text-[11.5px] leading-[1.5] text-fog">
            Um motion feito fora do app. Toca {formato === "vertical" ? "na tela toda" : "na metade de cima"}, entrando e saindo seco, como um insert.
            {m?.tipo === "preset" && " Escolher um vídeo troca o preset deste plano."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => arquivo.current?.click()} disabled={subindo} className={BOTAO}>
              <Upload className="size-3" /> {subindo ? "Subindo…" : daAba ? "Subir outro" : "Subir vídeo"}
            </button>
            <button onClick={() => setEscolhendo(true)} className={BOTAO}>
              <Library className="size-3" /> Escolher do banco
            </button>
          </div>
          <input ref={arquivo} type="file" accept="video/*" hidden onChange={(e) => void subir(Array.from(e.target.files ?? []))} />
        </div>
      )}
      {escolhendo && (
        <SeletorBanco
          tipo="video"
          fechar={() => setEscolhendo(false)}
          escolher={(i) => {
            setEscolhendo(false);
            video(i);
          }}
          mudou={p.bancoMudou}
        />
      )}
    </div>
  );
}
