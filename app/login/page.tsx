// app/login/page.tsx
// Pantalla de login al estilo "rudo" del cancionero.
// Dos métodos: (1) Google OAuth (requiere setup del provider en Supabase
// Dashboard; si no está activado, el botón tira error al tocar) y
// (2) magic link por email (100% funcional out-of-the-box).

import { Suspense } from "react";
import { LoginView } from "./login-view";

export const metadata = { title: "Entrar — La Banda Los Del Sur" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
