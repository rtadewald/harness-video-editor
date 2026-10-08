import { useState } from "react";
import { Logo } from "@/components/Marca";
import NavHome from "@/components/NavHome";
import { cn } from "@/lib/utils";
import { MiniaturaPreset, usePresets } from "./PresetMotion";
import type { Formato } from "./api";

/** `/motions`: a galeria dos presets de motion (SPEC §8.5; docs/motions.md), em tela cheia ou dividida. Com o mouse em
 *  cima, cada um toca em loop. Os presets são escritos no código; para usar, escolha num plano de motion na etapa Inserts. */
export default function PaginaMotions() {
  const presets = usePresets();
  const [formato, setFormato] = useState<Formato>("vertical");
  return (
    <div className="grid h-svh grid-rows-[56px_auto_minmax(0,1fr)] bg-deep text-cream">
      <header className="flex items-center gap-5 border-b border-line-dark bg-ink px-4">
        <Logo />
        <span className="h-5 w-px bg-line-dark" />
        <NavHome />
      </header>
      <nav className="flex items-center gap-3 border-b border-line-dark px-6 py-3 text-[12px] text-fog">
        <span>
          {presets ? `${presets.length} presets` : "Carregando…"} · passe o mouse para tocar · para usar, escolha num plano de motion na etapa Inserts
        </span>
        <div className="ml-auto flex gap-1 rounded-full p-1 ring-1 ring-line-dark">
          {(["vertical", "dividida"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormato(f)}
              className={cn("rounded-full px-3 py-1 font-semibold", formato === f ? "bg-cream text-ink" : "hover:text-cream")}
            >
              {f === "vertical" ? "Tela cheia" : "Tela dividida"}
            </button>
          ))}
        </div>
      </nav>
      <main className="overflow-y-auto px-6 py-6">
        <ul className="grid gap-x-6 gap-y-8" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${formato === "vertical" ? 220 : 300}px, 1fr))` }}>
          {presets?.map((p) => (
            <li key={p.id} className="grid content-start gap-2.5">
              <MiniaturaPreset key={formato} preset={p} formato={formato} />
              <div className="grid gap-1 px-0.5">
                <p className="text-[13px] font-semibold">{p.nome}</p>
                <p className="text-[12px] leading-[1.5] text-fog">{p.descricao}</p>
                <p className="text-[11px] text-fog/70">
                  {Object.values(p.campos).map((c) => c.rotulo).join(" · ")} · {p.duracao.toFixed(1).replace(".", ",")} s
                </p>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
