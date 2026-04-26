// app/perfil/sesiones/page.tsx
// Pantalla "Sesiones activas" — el user ve cada device conectado a su
// cuenta y puede cerrar las que no reconoce. Equivalente a la pantalla
// de Telegram / WhatsApp.

import { SesionesView } from "./sesiones-view";

export const metadata = { title: "Sesiones activas — La Banda Los Del Sur" };

export default function SesionesPage() {
  return <SesionesView />;
}
