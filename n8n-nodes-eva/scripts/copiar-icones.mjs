// O tsc não copia o SVG do ícone para dist; o n8n lê o ícone de lá.
import { cpSync, readdirSync } from "node:fs";
import path from "node:path";

for (const dir of ["nodes/EvaStudio", "nodes/EvaStudioTrigger", "nodes/EvaStudioPollTrigger", "credentials"]) {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".svg"))) {
    cpSync(path.join(dir, f), path.join("dist", dir, f));
  }
}
