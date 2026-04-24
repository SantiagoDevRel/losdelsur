// app/privacy/page.tsx
// Política de privacidad para Play Store / App Store.
// Play Store exige una URL pública de privacidad para publicar la app;
// esta es la nuestra: https://losdelsur.vercel.app/privacy

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Política de privacidad — La Banda Los Del Sur",
  description: "Política de privacidad de la app La Banda Los Del Sur.",
};

// Fecha de última actualización. Si cambiás políticas, actualizá esto.
const ULTIMA_ACTUALIZACION = "23 de abril de 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh pb-[110px] pt-14 sm:pt-20">
      <div className="px-5 pb-4">
        <Link
          href="/"
          aria-label="Volver"
          className="inline-grid size-10 place-items-center bg-black/60 text-white"
        >
          <ArrowLeft size={20} />
        </Link>
      </div>

      <header className="px-5 pb-4">
        <div className="eyebrow">LEGALES</div>
        <h1
          className="mt-1.5 uppercase text-white"
          style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 40, lineHeight: 0.9 }}
        >
          POLÍTICA DE
          <br />
          PRIVACIDAD
        </h1>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-white/50">
          Última actualización: {ULTIMA_ACTUALIZACION}
        </p>
      </header>

      <article className="prose prose-invert max-w-none px-5 text-[14px] leading-relaxed text-white/85">
        <Section title="1. Quiénes somos">
          <p>
            <strong>La Banda Los Del Sur</strong> es un cancionero no oficial
            de acceso libre, hecho por y para los hinchas de la barra{" "}
            <strong>Los Del Sur</strong> de Atlético Nacional de Medellín,
            Colombia. El operador de esta app es Santiago Trujillo Zuluaga
            (<a href="mailto:santiagotrujillozuluaga@gmail.com" className="text-[var(--color-verde-neon)] underline">
              santiagotrujillozuluaga@gmail.com
            </a>).
          </p>
          <p>
            La app no está afiliada oficialmente a Los Del Sur, Atlético
            Nacional S.A., ni a Dimayor.
          </p>
        </Section>

        <Section title="2. Qué datos recolectamos">
          <p>
            Si <strong>no creás cuenta</strong>, la app guarda en tu propio
            dispositivo (localStorage, Cache API del navegador) únicamente:
          </p>
          <ul>
            <li>Canciones marcadas como favoritas.</li>
            <li>Audios descargados para uso offline.</li>
            <li>Preferencias (tamaño de letra, modos de reproducción).</li>
            <li>Contador local de reproducciones por canción.</li>
          </ul>
          <p>
            Estos datos <strong>nunca salen de tu dispositivo</strong> si no
            iniciás sesión.
          </p>
          <p>Si <strong>creás cuenta</strong>, también recolectamos:</p>
          <ul>
            <li>Tu dirección de email (para autenticarte).</li>
            <li>
              Opcionalmente: tu foto de perfil de Google (si iniciás con
              Google), ciudad y combo (los seleccionás al registrarte).
            </li>
            <li>Los mismos datos de arriba (favoritas, descargas, plays), esta vez sincronizados a nuestra base de datos en Supabase.</li>
          </ul>
          <p>
            <strong>No recolectamos</strong>: ubicación GPS, libreta de
            contactos, historial de navegación, archivos de tu dispositivo,
            grabaciones de audio o video.
          </p>
        </Section>

        <Section title="3. Para qué usamos tus datos">
          <ul>
            <li>
              <strong>Autenticación:</strong> tu email identifica tu cuenta.
            </li>
            <li>
              <strong>Sincronización entre dispositivos:</strong> si cambiás
              de celu, recuperás tus favoritas y descargas.
            </li>
            <li>
              <strong>Funcionamiento del app:</strong> las preferencias y el
              cache permiten que la app funcione offline en el estadio.
            </li>
            <li>
              <strong>Mejoras del producto:</strong> estadísticas agregadas y
              anónimas (qué cánticos se escuchan más) para decidir qué
              contenido priorizar. Nunca asociadas a tu identidad.
            </li>
          </ul>
          <p>
            <strong>No vendemos tus datos</strong> a terceros ni mostramos
            publicidad de terceros. Nunca.
          </p>
        </Section>

        <Section title="4. Terceros con los que compartimos datos">
          <p>Usamos los siguientes servicios:</p>
          <ul>
            <li>
              <strong>Supabase</strong> (supabase.com) — base de datos y
              autenticación. Nuestros datos viven en sus servidores.
            </li>
            <li>
              <strong>Vercel</strong> (vercel.com) — hosting de la web. Ve
              las requests HTTP estándar (IP, user agent) para servir la app.
            </li>
            <li>
              <strong>Google</strong> (opcional) — si iniciás sesión con
              Google, Google nos comparte tu email y foto de perfil. Podés
              usar email + link sin pasar por Google si preferís.
            </li>
          </ul>
          <p>
            No compartimos tus datos con anunciantes, data brokers, ni con
            Atlético Nacional o Los Del Sur como organizaciones.
          </p>
        </Section>

        <Section title="5. Cookies">
          <p>
            Usamos cookies estrictamente necesarias para mantener tu sesión
            iniciada (Supabase Auth). No usamos cookies de tracking, analytics
            ni publicidad.
          </p>
        </Section>

        <Section title="6. Menores">
          <p>
            La app está abierta a cualquier edad (no contiene contenido
            explícito en las letras catalogadas). Sin embargo, para{" "}
            <strong>crear una cuenta</strong> se requiere al menos 13 años
            (por regulaciones COPPA/GDPR). Si detectamos una cuenta de un
            menor de 13, la eliminamos.
          </p>
        </Section>

        <Section title="7. Tus derechos">
          <p>Tenés derecho a:</p>
          <ul>
            <li>
              <strong>Acceder</strong> a los datos que tenemos sobre vos.
            </li>
            <li>
              <strong>Corregir</strong> cualquier dato inexacto.
            </li>
            <li>
              <strong>Borrar</strong> tu cuenta y todos tus datos. Podés
              hacerlo directamente desde{" "}
              <Link href="/perfil" className="text-[var(--color-verde-neon)] underline">/perfil</Link> → Cerrar
              sesión → contactándonos para borrado completo.
            </li>
            <li>
              <strong>Exportar</strong> tus datos (enviámelo por email y te
              mando un JSON con todo).
            </li>
            <li>
              <strong>Oponerte</strong> al procesamiento (equivale a borrar
              la cuenta — no podemos autenticarte sin procesar tu email).
            </li>
          </ul>
          <p>
            Para ejercer cualquiera de estos derechos, escribí a{" "}
            <a href="mailto:santiagotrujillozuluaga@gmail.com" className="text-[var(--color-verde-neon)] underline">
              santiagotrujillozuluaga@gmail.com
            </a>
            . Respondemos dentro de los 30 días.
          </p>
        </Section>

        <Section title="8. Seguridad">
          <p>
            Todas las comunicaciones entre la app y nuestros servidores usan
            HTTPS (TLS 1.2+). Las contraseñas no existen (usamos magic links
            o OAuth, así que no hay password que filtrar). Los datos en
            Supabase están protegidos por Row Level Security — cada usuario
            solo puede leer sus propios datos.
          </p>
        </Section>

        <Section title="9. Retención">
          <p>
            Mantenemos tus datos mientras tu cuenta esté activa. Si no usás
            la app por 2 años, podemos borrarla automáticamente avisándote
            con 30 días de anticipación por email.
          </p>
        </Section>

        <Section title="10. Derechos de autor de los cánticos">
          <p>
            Los cánticos son obras folclóricas de la barra Los Del Sur,
            compuestos colectivamente por los miembros de la hinchada a lo
            largo de los años. Los audios provienen de CDs distribuidos
            públicamente por la barra. Esta app tiene fines de archivo y
            memoria, no comerciales. Si sos autor de alguna pieza y querés
            que la retiremos, contactanos y lo hacemos en 48 hs.
          </p>
        </Section>

        <Section title="11. Cambios a esta política">
          <p>
            Si hacemos cambios significativos, te avisamos en la app o por
            email. La versión actualizada siempre vive en{" "}
            <a href="https://losdelsur.vercel.app/privacy" className="text-[var(--color-verde-neon)] underline">
              losdelsur.vercel.app/privacy
            </a>
            .
          </p>
        </Section>

        <Section title="12. Jurisdicción">
          <p>
            Esta política se rige por las leyes de la República de Colombia
            (Ley 1581 de 2012, Habeas Data). Si estás en la Unión Europea,
            también aplica el GDPR.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2
        className="mb-2 uppercase text-[var(--color-verde-neon)]"
        style={{ fontFamily: "var(--font-display), Anton, sans-serif", fontSize: 20, lineHeight: 1.1 }}
      >
        {title}
      </h2>
      <div className="space-y-2 text-[13px] leading-relaxed text-white/80">
        {children}
      </div>
    </section>
  );
}
