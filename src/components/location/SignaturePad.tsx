"use client";
import { useEffect, useRef } from "react";

/** Signature dessinée (souris et doigt). Renvoie un PNG dès qu'un trait est posé. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const fit = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * ratio));
      canvas.height = Math.max(1, Math.floor(h * ratio));
      const g = canvas.getContext("2d");
      if (!g) return;
      g.scale(ratio, ratio);
      g.lineWidth = 2.2;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.strokeStyle = "#0b0d12";
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const g = e.currentTarget.getContext("2d");
    const p = point(e);
    g?.beginPath();
    g?.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const g = e.currentTarget.getContext("2d");
    const p = point(e);
    g?.lineTo(p.x, p.y);
    g?.stroke();
    dirty.current = true;
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(e.currentTarget.toDataURL("image/png"));
  }

  return (
    <canvas
      ref={ref}
      data-testid="signature-pad"
      className="h-36 w-full touch-none rounded-xl border border-line-2 bg-white"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  );
}

export function clearSignature(pad: HTMLCanvasElement | null, onChange: (v: string | null) => void) {
  if (!pad) return;
  pad.getContext("2d")?.clearRect(0, 0, pad.width, pad.height);
  onChange(null);
}
