import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Logo } from "@/components/Marca";
import NavHome from "@/components/NavHome";
import { cn } from "@/lib/utils";
import { MiniaturaPreset } from "./PresetMotion";
import { aprovarPreset, esquecerPresets, listarRecusados, presetsEmCache, recusarPreset, type Formato, type Preset, type PresetRecusado } from "./api";
import { ChipCodigo } from '@/components/Codigo'

/** `/motions`: a galeria dos presets de motion (SPEC §8.5; docs/motions.md), em tela cheia ou dividida. Com o mouse em
 *  cima, cada um toca em loop. Os presets são escritos no código; para usar, escolha num plano de motion na etapa Inserts.
 *  Os que o Claude escreveu entram "a revisar": Aprovar os põe na biblioteca; Recusar (com o motivo) os leva para
 *  `_recusados/`, e o Claude lê o motivo antes de escrever o próximo (docs/editor-claude.md, E7). */
export default function PaginaMotions() {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [recusados, setRecusados] = useState<PresetRecusado[]>([]);
  const [formato, setFormato] = useState<Formato>("vertical");
  const [soRevisar, setSoRevisar] = useState(false);
  const [erro, setErro] = useState("");
  const carregar = () => {
    esquecerPresets();
    void presetsEmCache().then(setPresets);
    void listarRecusados().then(setRecusados);
  };
  useEffect(carregar, []);
  const aRevisar = presets?.filter((p) => p.a_revisar).length ?? 0;
  const visiveis = presets?.filter((p) => !soRevisar || p.a_revisar);
  const agir = (f: () => Promise<unknown>) => {
    setErro("");
    void f()
      .then(carregar)
      .catch((e) => setErro((e as Error).message));
  };
  const recusar = (p: Preset) => {
    const motivo = window.prompt(`Por que recusar “${p.nome}”? O Claude lê o motivo antes de escrever o próximo motion.`)?.trim();
    if (motivo) agir(() => recusarPreset(p.id, motivo));
  };
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
        {aRevisar > 0 && (
          <button
            onClick={() => setSoRevisar(!soRevisar)}
            className={cn("rounded-full border px-3 py-1 font-semibold", soRevisar ? "border-coral bg-coral text-cream" : "border-coral/60 text-coral hover:bg-coral/10")}
          >
            A revisar · {aRevisar}
          </button>
        )}
        {erro && <span className="text-coral">{erro}</span>}
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
          {visiveis?.map((p) => (
            <li key={p.id} className="grid content-start gap-2.5">
              <MiniaturaPreset key={formato} preset={p} formato={formato} />
              <div className="grid gap-1 px-0.5">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.nome}</p>
                  {p.a_revisar && <span className="shrink-0 rounded-full bg-coral px-2 py-0.5 text-[10px] font-semibold text-cream uppercase">a revisar</span>}
                  <ChipCodigo tipo="motion" id={p.id} nome={p.nome} />
                </div>
                <p className="text-[12px] leading-[1.5] text-fog">{p.descricao}</p>
                <p className="text-[11px] text-fog/70">
                  {Object.values(p.campos).map((c) => c.rotulo).join(" · ")} · {p.duracao.toFixed(1).replace(".", ",")} s
                </p>
                {p.a_revisar && (
                  <div className="mt-1 flex gap-1.5">
                    <button
                      onClick={() => agir(() => aprovarPreset(p.id))}
                      className="flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-[11px] font-semibold text-ink hover:brightness-110"
                    >
                      <Check className="size-3.5" /> Aprovar
                    </button>
                    <button
                      onClick={() => recusar(p)}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-fog ring-1 ring-line-dark hover:text-coral hover:ring-coral"
                    >
                      <X className="size-3.5" /> Recusar…
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {recusados.length > 0 && !soRevisar && (
          <section className="mt-12 border-t border-line-dark pt-6">
            <p className="eyebrow mb-3 text-sage">Recusados · {recusados.length}</p>
            <ul className="grid gap-2 text-[12px]">
              {recusados.map((r) => (
                <li key={r.arquivo} className="grid gap-0.5">
                  <span className="font-semibold text-cream/80">{r.nome}</span>
                  <span className="text-fog">{r.motivo || "sem motivo"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
