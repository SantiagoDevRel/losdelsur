// app/admin/fotos/fotos-admin.tsx
// Vista cliente de upload. Flow:
//   1. Admin elige partido + sección.
//   2. Drag-drop o file picker → preview thumbnails locales.
//   3. POST /api/admin/fotos/presign → recibe (id, fullUrl, thumbUrl) por foto.
//   4. Para cada foto:
//      - Genera thumb WebP cliente-side (400px, WebP q=0.7).
//      - PUT full a R2 con presigned URL.
//      - PUT thumb a R2 con presigned URL.
//      - On success, agrega a la lista "subidas".
//   5. POST /api/admin/fotos/commit con la lista de subidas.

"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Trash2, Upload, X } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface Partido {
  id: string;
  fecha: string;
  rival: string;
  ciudad: string;
  es_local: boolean;
}

type Seccion = "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";

const SECCIONES: { value: Seccion; label: string }[] = [
  { value: "SUR_A1", label: "SUR A1 — Alta 1" },
  { value: "SUR_A2", label: "SUR A2 — Alta 2" },
  { value: "SUR_B1", label: "SUR B1 — Baja 1" },
  { value: "SUR_B2", label: "SUR B2 — Baja 2" },
];

interface FileItem {
  localId: string;
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
  // Después del presign + upload exitoso:
  remoteId?: string;
  r2KeyFull?: string;
  r2KeyThumb?: string;
  width?: number;
  height?: number;
  thumbBlob?: Blob;
}

export function FotosAdmin() {
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [partidoId, setPartidoId] = useState<string>("");
  const [seccion, setSeccion] = useState<Seccion>("SUR_A1");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [globalErr, setGlobalErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/admin/partidos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { partidos?: Partido[] }) => {
        const ps = d.partidos ?? [];
        setPartidos(ps);
        // Default: primer partido pasado.
        const past = ps.find((p) => new Date(p.fecha) <= new Date());
        if (past) setPartidoId(past.id);
        else if (ps[0]) setPartidoId(ps[0].id);
      })
      .catch(() => {});
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const items: FileItem[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) continue;
      items.push({
        localId: `${f.name}-${f.size}-${f.lastModified}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: "pending",
      });
    }
    setFiles((prev) => {
      const existing = new Set(prev.map((p) => p.localId));
      return [...prev, ...items.filter((i) => !existing.has(i.localId))];
    });
  }

  function removeFile(localId: string) {
    setFiles((prev) => {
      const item = prev.find((p) => p.localId === localId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  }

  function clearAll() {
    setFiles((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl);
      return [];
    });
    setDoneCount(0);
  }

  async function uploadAll() {
    if (!partidoId) {
      setGlobalErr("Elegí un partido");
      return;
    }
    if (files.length === 0) return;
    setGlobalErr(null);
    setUploading(true);
    setDoneCount(0);

    try {
      // 1) Pedir presigned URLs.
      const presignRes = await fetch("/api/admin/fotos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partido_id: partidoId,
          seccion,
          files: files.map(() => ({
            contentType: "image/jpeg",
            thumbContentType: "image/webp",
          })),
        }),
      });
      if (!presignRes.ok) {
        const j = (await presignRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `presign ${presignRes.status}`);
      }
      const { items } = (await presignRes.json()) as {
        items: {
          id: string;
          full: { key: string; url: string };
          thumb: { key: string; url: string };
        }[];
      };
      if (items.length !== files.length) {
        throw new Error("presign mismatch");
      }

      // 2) Por cada foto: generar thumb + upload full + upload thumb.
      const next: FileItem[] = [...files];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const fileItem = next[i];
        if (!item || !fileItem) continue;
        next[i] = { ...fileItem, status: "uploading" };
        setFiles([...next]);

        try {
          const { width, height, thumbBlob } = await makeThumbnail(fileItem.file);

          await Promise.all([
            putToR2(item.full.url, fileItem.file, "image/jpeg"),
            putToR2(item.thumb.url, thumbBlob, "image/webp"),
          ]);

          next[i] = {
            ...fileItem,
            status: "done",
            remoteId: item.id,
            r2KeyFull: item.full.key,
            r2KeyThumb: item.thumb.key,
            width,
            height,
            thumbBlob,
          };
          setFiles([...next]);
          setDoneCount((c) => c + 1);
        } catch (e) {
          next[i] = {
            ...fileItem,
            status: "error",
            errorMsg: e instanceof Error ? e.message : "upload err",
          };
          setFiles([...next]);
        }
      }

      // 3) Commit: insert rows en partido_fotos para los que subieron OK.
      const commitFotos = next
        .filter(
          (f): f is FileItem & { remoteId: string; r2KeyFull: string; r2KeyThumb: string } =>
            f.status === "done" &&
            !!f.remoteId &&
            !!f.r2KeyFull &&
            !!f.r2KeyThumb,
        )
        .map((f) => ({
          id: f.remoteId,
          r2_key_full: f.r2KeyFull,
          r2_key_thumb: f.r2KeyThumb,
          width: f.width ?? null,
          height: f.height ?? null,
          size_bytes: f.file.size,
        }));

      if (commitFotos.length > 0) {
        const commitRes = await fetch("/api/admin/fotos/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partido_id: partidoId,
            seccion,
            fotos: commitFotos,
          }),
        });
        if (!commitRes.ok) {
          const j = (await commitRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `commit ${commitRes.status}`);
        }
      }
      haptic("double");
    } catch (e) {
      setGlobalErr(e instanceof Error ? e.message : "error");
      haptic("error");
    } finally {
      setUploading(false);
    }
  }

  const allDone = files.length > 0 && files.every((f) => f.status === "done");
  const partido = partidos.find((p) => p.id === partidoId);

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
          FOTOS
        </h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-white/40">
          Subí fotos de la tribuna sur por sección. Expiran en 7 días.
        </p>
      </div>

      {/* Selector de partido */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
          PARTIDO
        </label>
        <select
          value={partidoId}
          onChange={(e) => setPartidoId(e.target.value)}
          className="h-11 w-full rounded-lg border-2 border-white/20 bg-black px-3 text-[13px] font-bold uppercase tracking-[0.04em] text-white"
        >
          <option value="" disabled>
            Elegí un partido
          </option>
          {partidos.map((p) => (
            <option key={p.id} value={p.id}>
              {new Date(p.fecha).toLocaleDateString("es-CO", {
                day: "2-digit",
                month: "short",
              })}{" "}
              · {p.es_local ? "VS" : "@"} {p.rival}
            </option>
          ))}
        </select>
      </div>

      {/* Selector de sección */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-verde-neon)]">
          SECCIÓN DE TRIBUNA SUR
        </label>
        <div className="grid grid-cols-2 gap-2">
          {SECCIONES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSeccion(s.value)}
              className={`rounded-lg border-2 px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] ${
                seccion === s.value
                  ? "border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/15 text-[var(--color-verde-neon)]"
                  : "border-white/15 text-white/60"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      <DropZone
        onFiles={addFiles}
        disabled={uploading}
        onPickClick={() => inputRef.current?.click()}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => addFiles(e.target.files)}
      />

      {/* Preview grid */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/60">
              {files.length} foto{files.length === 1 ? "" : "s"}
              {uploading && ` · ${doneCount}/${files.length} subidas`}
              {allDone && " · LISTO"}
            </p>
            <button
              type="button"
              onClick={clearAll}
              disabled={uploading}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white/40 hover:text-white/70 disabled:opacity-30"
            >
              <Trash2 size={11} />
              LIMPIAR
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {files.map((f) => (
              <FilePreview key={f.localId} item={f} onRemove={() => removeFile(f.localId)} />
            ))}
          </div>
        </div>
      )}

      {globalErr && (
        <p className="text-[11px] uppercase text-red-400">{globalErr}</p>
      )}

      {/* Action button */}
      {files.length > 0 && !allDone && (
        <button
          type="button"
          onClick={uploadAll}
          disabled={uploading || !partidoId}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-verde-neon)] text-[12px] font-extrabold uppercase tracking-[0.1em] text-black disabled:opacity-50"
        >
          <Upload size={14} />
          {uploading
            ? `SUBIENDO ${doneCount}/${files.length}...`
            : `SUBIR ${files.length} FOTO${files.length === 1 ? "" : "S"}`}
        </button>
      )}
      {allDone && partido && (
        <div className="rounded-lg border-2 border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10 p-4 text-center">
          <CheckCircle2
            size={32}
            className="mx-auto"
            style={{ color: "var(--color-verde-neon)" }}
          />
          <p
            className="mt-2 uppercase text-[var(--color-verde-neon)]"
            style={{
              fontFamily: "var(--font-display), Anton, sans-serif",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ¡LISTO!
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-white/70">
            {files.length} foto{files.length === 1 ? "" : "s"} para {partido.rival}{" "}
            · {seccion.replace("SUR_", "")}
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-3 rounded-lg border-2 border-[var(--color-verde-neon)] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]"
          >
            SUBIR MÁS
          </button>
        </div>
      )}
    </div>
  );
}

// --- subcomponentes ---

function DropZone({
  onFiles,
  disabled,
  onPickClick,
}: {
  onFiles: (l: FileList | null) => void;
  disabled: boolean;
  onPickClick: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <button
      type="button"
      onClick={() => !disabled && onPickClick()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        onFiles(e.dataTransfer.files);
      }}
      disabled={disabled}
      className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors ${
        isDragging
          ? "border-[var(--color-verde-neon)] bg-[var(--color-verde-neon)]/10"
          : "border-white/20 bg-[#0a0a0a]"
      } disabled:opacity-50`}
    >
      <Camera size={32} style={{ color: "var(--color-verde-neon)" }} />
      <p className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-white">
        ARRASTRÁ FOTOS O TOCÁ ACÁ
      </p>
      <p className="text-[10px] uppercase tracking-[0.08em] text-white/40">
        JPG / PNG / HEIC · múltiples
      </p>
    </button>
  );
}

function FilePreview({
  item,
  onRemove,
}: {
  item: FileItem;
  onRemove: () => void;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.previewUrl}
        alt=""
        className="size-full object-cover"
      />

      {/* Status overlay */}
      {item.status === "uploading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="size-6 animate-spin rounded-full border-2 border-[var(--color-verde-neon)] border-t-transparent" />
        </div>
      )}
      {item.status === "done" && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-verde-neon)]/20">
          <CheckCircle2 size={28} style={{ color: "var(--color-verde-neon)" }} />
        </div>
      )}
      {item.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 p-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.05em] text-red-200">
            {item.errorMsg ?? "ERROR"}
          </p>
        </div>
      )}

      {item.status !== "uploading" && item.status !== "done" && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Quitar"
          className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/70 text-white"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// --- helpers ---

async function putToR2(url: string, body: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!res.ok) {
    throw new Error(`R2 PUT ${res.status}`);
  }
}

// Genera un thumb WebP de 400px de lado largo, calidad 0.7. Retorna
// también las dimensiones originales para guardarlas en metadata.
async function makeThumbnail(
  file: File,
  maxSide = 400,
  quality = 0.7,
): Promise<{ width: number; height: number; thumbBlob: Blob }> {
  const bitmap = await createImageBitmap(file);
  const { width: w0, height: h0 } = bitmap;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const tw = Math.round(w0 * scale);
  const th = Math.round(h0 * scale);
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(tw, th)
      : Object.assign(document.createElement("canvas"), { width: tw, height: th });
  const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  (ctx as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).drawImage(
    bitmap,
    0,
    0,
    tw,
    th,
  );
  bitmap.close?.();

  let blob: Blob;
  if (canvas instanceof OffscreenCanvas) {
    blob = await canvas.convertToBlob({ type: "image/webp", quality });
  } else {
    blob = await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
        "image/webp",
        quality,
      );
    });
  }
  return { width: w0, height: h0, thumbBlob: blob };
}
