// app/admin/layout.tsx
// Gate global para todas las rutas /admin/*. Server component — corre
// antes de renderizar nada, redirige si el user no es admin.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { AdminNav } from "./admin-nav";

export const metadata = { title: "Admin — La Banda Los Del Sur" };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!(await isAdmin(user.id))) redirect("/");

  return (
    <div className="min-h-dvh bg-black pb-[110px] pt-14 sm:pt-20">
      <AdminNav />
      <div className="px-5">{children}</div>
    </div>
  );
}
