// app/perfil/page.tsx
// Perfil del usuario: si está logueado muestra datos + settings;
// si no, muestra CTA "Entrá con Google" + el resto de la info de la app
// que antes vivía en /settings (cache manager, install card, créditos).

import { PerfilView } from "./perfil-view";

export const metadata = { title: "Perfil — La Banda Los Del Sur" };

export default function PerfilPage() {
  return <PerfilView />;
}
