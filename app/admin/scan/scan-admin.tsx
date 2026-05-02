// app/admin/scan/scan-admin.tsx
// Flujo:
//  1. Admin tap "INICIAR" → pide permiso de cámara, abre stream.
//  2. Loop con BarcodeDetector lee frames cada ~250ms.
//  3. Cuando matchea `lds:v1:<uuid>`, parsea, fetch user via
//     /api/admin/lookup-user, muestra panel con info + form.
//  4. Admin elige actividad + puntos override + (si aplica) partido.
//  5. POST /api/admin/grant-points → muestra success + nuevo balance.
//
// Fallback: input manual de user_id para devices sin BarcodeDetector
// (iOS < 17, browsers viejos). En el futuro podemos meter `qr-scanner`
// pero por ahora la API nativa cubre Chrome Android + Safari 17+.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  Trophy,
  User as UserIcon,
} from "lucide-react";
import { haptic } from "@/lib/haptic";

interface UserInfo {
  id: string;
  apodo: string | null;
  nombre: string | null;
  ciudad: string | null;
  combo: string | null;
  puntos_balance: number;
  partidos_asistidos: number;
  ciudades_visitadas: number;
}

interface Partido {
  id: string;
  fecha: string;
  rival: string;
  ciudad: string;
  es_local: boolean;
}

const ACTIVIDADES: {
  slug: string;
  nombre: string;
  puntos: number;
  needsPartido?: boolean;
}[] = [
  { slug: "partido_local", nombre: "Partido Atanasio", puntos: 10, needsPartido: true },
  { slug: "partido_visita", nombre: "Partido visitante", puntos: 25, needsPartido: true },
  { slug: "reunion_combo", nombre: "Reunión de combo", puntos: 5 },
  { slug: "actividad_barra", nombre: "Actividad de la barra", puntos: 15 },
  { slug: "viaje_libertadores", nombre: "Viaje internacional", puntos: 50 },
];

type Phase = "idle" | "scanning" | "matched" | "saving" | "done" | "error";

export function ScanAdmin() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Detección sincrónica al mount — usable inmediatamente sin un setState
  // posterior que dispare cascading render.
  const [supportsBarcodes] = useState<boolean>(() =>
    typeof window !== "undefined" && "BarcodeDetector" in window,
  );
  const [manualId, setManualId] = useState("");

  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [actividadSlug, setActividadSlug] = useState<string>("partido_local");
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [partidoId, setPartidoId] = useState<string>("");
  const [puntosOverride, setPuntosOverride] = useState<string>("");

  const [doneSummary, setDoneSummary] = useState<{
    apodo: string;
    puntosOtorgados: number;
    nuevoBalance: number;
    actividad: string;
  } | null>(null);

  // Cargar partidos para el dropdown de partido (solo cuando se necesite).
  useEffect(() => {
    fetch("/api/admin/partidos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { partidos?: Partido[] }) => {
        const ps = d.partidos ?? [];
        setPartidos(ps);
        // Default: partido más reciente pasado.
        const past = ps.find((p) => new Date(p.fecha) <= new Date());
        if (past) setPartidoId(past.id);
      })
      .catch(() => {});
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      stopScan();
    };
     
  }, []);

  function stopScan() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startScan() {
    setErrorMsg(null);
    setUserInfo(null);
    setDoneSummary(null);
    if (!supportsBarcodes) {
      setErrorMsg("Tu device no soporta scanner. Usá el ID manual.");
      return;
    }
    setPhase("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (!Ctor) throw new Error("BarcodeDetector unavailable");
      detectorRef.current = new Ctor({ formats: ["qr_code"] });
      pollFrame();
    } catch (e) {
      setPhase("error");
      setErrorMsg(
        e instanceof Error ? e.message : "No se pudo abrir la cámara",
      );
      stopScan();
    }
  }

  async function pollFrame() {
    if (!videoRef.current || !detectorRef.current) return;
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      const found = codes?.find((c) => c.rawValue.startsWith("lds:v1:"));
      if (found) {
        haptic("double");
        const userId = found.rawValue.replace(/^lds:v1:/, "");
        await onUserDetected(userId);
        return;
      }
    } catch {
      /* sigue */
    }
    rafRef.current = requestAnimationFrame(() => {
      // Throttle a 4fps — suficiente y ahorra batería.
      setTimeout(pollFrame, 250);
    });
  }

  async function onUserDetected(userId: string) {
    setPhase("matched");
    stopScan();
    try {
      const res = await fetch(
        `/api/admin/lookup-user?id=${encodeURIComponent(userId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `${res.status}`);
      }
      const j = (await res.json()) as { user: UserInfo };
      setUserInfo(j.user);
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "lookup failed");
    }
  }

  async function manualLookup() {
    const id = manualId.trim();
    if (!id) return;
    await onUserDetected(id);
  }

  async function submitPoints() {
    if (!userInfo) return;
    const act = ACTIVIDADES.find((a) => a.slug === actividadSlug);
    if (!act) return;
    setPhase("saving");
    setErrorMsg(null);
    try {
      const overrideNum = puntosOverride.trim() ? Number(puntosOverride) : null;
      const res = await fetch("/api/admin/grant-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userInfo.id,
          actividad_slug: act.slug,
          partido_id: act.needsPartido ? partidoId : null,
          puntos: overrideNum,
          motivo: act.nombre,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `${res.status}`);
      }
      const j = (await res.json()) as {
        puntos_otorgados: number;
        actividad: { nombre: string };
        target: { apodo: string | null; nombre: string | null; puntos_balance: number };
      };
      haptic("double");
      setDoneSummary({
        apodo: j.target.apodo || j.target.nombre || "Sureño",
        puntosOtorgados: j.puntos_otorgados,
        nuevoBalance: j.target.puntos_balance,
        actividad: j.actividad.nombre,
      });
      setPhase("done");
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "save failed");
      haptic("error");
    }
  }

  function reset() {
    setUserInfo(null);
    setManualId("");
    setPuntosOverride("");
    setDoneSummary(null);
    setActividadSlug("partido_local");
    setPhase("idle");
    setErrorMsg(null);
  }

  const actividadActual = ACTIVIDADES.find((a) => a.slug === actividadSlug);

  return (
    <div className="space-y-5">
      <div>
        <h1
          className="uppercase text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: 36,
            lineHeight: 0.85,
          }}
        >
          SCAN
        </h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-white/40">
          Escaneá el QR del carnet del sureño y sumale puntos.
        </p>
      </div>

      {/* Idle / scanning */}
      {phase === "idle" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={startScan}
            disabled={supportsBarcodes === false}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] text-[13px] font-extrabold uppercase tracking-[0.1em] text-black disabled:opacity-40"
          >
            <QrCode size={18} />
            INICIAR ESCÁNER
          </button>
          {supportsBarcodes === false && (
            <p className="text-[10px] uppercase tracking-[0.08em] text-yellow-300/80">
              Tu navegador no soporta scanner nativo (necesitás Chrome
              Android o Safari 17+). Usá el ID manual abajo.
            </p>
          )}

          <div className="rounded-lg border-2 border-white/10 bg-[#0a0a0a] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/50">
              O PEGÁ EL ID DEL USER
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="lds:v1:<uuid>  o  uuid"
                className="h-10 flex-1 rounded-lg border-2 border-white/20 bg-black px-3 text-[12px] text-white"
              />
              <button
                type="button"
                onClick={manualLookup}
                disabled={!manualId.trim()}
                className="flex items-center gap-1 rounded-lg border-2 border-[var(--color-verde-neon)] px-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-verde-neon)] disabled:opacity-40"
              >
                <Search size={12} />
                IR
              </button>
            </div>
            <p className="mt-2 text-[9px] uppercase text-white/30">
              Acepta el formato <code>lds:v1:&lt;uuid&gt;</code> o el uuid pelado.
            </p>
          </div>
        </div>
      )}

      {phase === "scanning" && (
        <div className="space-y-3">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border-2 border-[var(--color-verde-neon)] bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full object-cover"
            />
            {/* Esquinas de marco neón */}
            <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-[var(--color-verde-neon)]/60" />
          </div>
          <button
            type="button"
            onClick={() => {
              stopScan();
              setPhase("idle");
            }}
            className="h-12 w-full rounded-lg border-2 border-white/20 text-[12px] font-extrabold uppercase tracking-[0.1em] text-white/70"
          >
            CANCELAR
          </button>
          <p className="text-center text-[11px] uppercase tracking-[0.08em] text-white/50">
            Apuntá al QR del carnet
          </p>
        </div>
      )}

      {/* Matched: form de puntos */}
      {phase === "matched" && !userInfo && (
        <p className="text-[12px] uppercase text-white/50">
          <Loader2 className="inline-block animate-spin" size={14} /> Buscando user...
        </p>
      )}

      {(phase === "matched" || phase === "saving") && userInfo && (
        <div className="space-y-4">
          <UserCard user={userInfo} />

          <div className="rounded-xl border-2 border-white/10 bg-[#0a0a0a] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
              ACTIVIDAD
            </p>
            <select
              value={actividadSlug}
              onChange={(e) => setActividadSlug(e.target.value)}
              className="mt-2 h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] font-bold uppercase tracking-[0.04em] text-white"
            >
              {ACTIVIDADES.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.nombre} (+{a.puntos})
                </option>
              ))}
            </select>

            {actividadActual?.needsPartido && (
              <>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
                  PARTIDO
                </p>
                <select
                  value={partidoId}
                  onChange={(e) => setPartidoId(e.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[12px] font-bold uppercase tracking-[0.04em] text-white"
                >
                  <option value="" disabled>
                    Elegí un partido
                  </option>
                  {partidos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {new Date(p.fecha).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                      })}
                      {" · "}
                      {p.es_local ? "VS" : "@"} {p.rival}
                    </option>
                  ))}
                </select>
              </>
            )}

            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
              PUNTOS (OPCIONAL — DEFAULT {actividadActual?.puntos})
            </p>
            <input
              type="number"
              inputMode="numeric"
              value={puntosOverride}
              onChange={(e) => setPuntosOverride(e.target.value)}
              placeholder={`${actividadActual?.puntos ?? 10}`}
              className="mt-2 h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] text-white"
            />
          </div>

          {errorMsg && (
            <p className="text-[11px] uppercase text-red-400">{errorMsg}</p>
          )}

          <button
            type="button"
            onClick={submitPoints}
            disabled={
              phase === "saving" ||
              (actividadActual?.needsPartido && !partidoId)
            }
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] text-[12px] font-extrabold uppercase tracking-[0.1em] text-black disabled:opacity-40"
          >
            {phase === "saving" ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                GUARDANDO...
              </>
            ) : (
              <>
                <Trophy size={14} />
                SUMAR PUNTOS
              </>
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            className="h-11 w-full rounded-lg border-2 border-white/20 text-[11px] font-bold uppercase tracking-[0.08em] text-white/60"
          >
            CANCELAR
          </button>
        </div>
      )}

      {/* Done */}
      {phase === "done" && doneSummary && (
        <div className="space-y-4 rounded-xl border-2 border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10 p-5 text-center">
          <CheckCircle2
            size={42}
            className="mx-auto"
            style={{ color: "var(--color-verde-neon)" }}
          />
          <p
            className="uppercase text-[var(--color-verde-neon)]"
            style={{
              fontFamily: "var(--font-display), Anton, sans-serif",
              fontSize: 28,
              lineHeight: 1,
            }}
          >
            +{doneSummary.puntosOtorgados} PUNTOS
          </p>
          <p className="text-[12px] uppercase tracking-[0.06em] text-white">
            Para <strong className="text-[var(--color-verde-neon)]">{doneSummary.apodo}</strong>
            <br />
            <span className="text-white/60">{doneSummary.actividad}</span>
          </p>
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/50">
            Nuevo balance: <strong className="text-white">{doneSummary.nuevoBalance}</strong>
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-2 inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--color-verde-neon)] px-5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-black"
          >
            <RefreshCw size={14} />
            ESCANEAR OTRO
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-3 rounded-xl border-2 border-red-500/40 bg-red-900/10 p-4">
          <div className="flex items-center gap-2 text-red-300">
            <AlertCircle size={16} />
            <p className="text-[12px] font-bold uppercase tracking-[0.06em]">
              {errorMsg || "Error"}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="h-10 w-full rounded-lg bg-[var(--color-verde-neon)] text-[11px] font-extrabold uppercase tracking-[0.1em] text-black"
          >
            REINTENTAR
          </button>
        </div>
      )}
    </div>
  );
}

function UserCard({ user }: { user: UserInfo }) {
  const display = user.apodo || user.nombre || "Sureño";
  return (
    <div className="rounded-xl border-2 border-[var(--color-verde-neon)] bg-[#0a0a0a] p-4">
      <div className="flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-full bg-[var(--color-verde-neon)]/15 text-[var(--color-verde-neon)]">
          <UserIcon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate uppercase text-white"
            style={{
              fontFamily: "var(--font-display), Anton, sans-serif",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            {display}
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-white/50">
            {user.ciudad ?? "—"}
            {user.combo && ` · ${user.combo}`}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
        <Stat label="Puntos" value={user.puntos_balance} highlight />
        <Stat label="Partidos" value={user.partidos_asistidos} />
        <Stat label="Ciudades" value={user.ciudades_visitadas} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="text-center">
      <p
        className={`uppercase tabular-nums ${
          highlight ? "text-[var(--color-verde-neon)]" : "text-white"
        }`}
        style={{
          fontFamily: "var(--font-display), Anton, sans-serif",
          fontSize: 22,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/40">
        {label}
      </p>
    </div>
  );
}

// --- Tipos para BarcodeDetector (no en lib.dom.d.ts todavía) ---

interface DetectedBarcode {
  rawValue: string;
  format: string;
}
interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;
