import { useEffect, useState } from "react";
import { motionsDoProjeto, type MotionPlano } from "./api";

/** O motion de cada plano do projeto (a cópia guardada nele), com um jeito de recarregar depois de mudar. */
export function useMotionsDoProjeto(projetoId: string) {
  const [motions, setMotions] = useState<Record<string, MotionPlano>>({});
  const recarregar = () =>
    void motionsDoProjeto(projetoId)
      .then(setMotions)
      .catch(() => {});
  useEffect(recarregar, [projetoId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { motions, recarregar };
}
