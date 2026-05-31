'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignaturePadProps {
  /** Appelé à chaque changement du pad. dataUrl est PNG base64 (avec préfixe). null = pad vide. */
  onChange: (dataUrl: string | null) => void;
  /** Hauteur du pad en pixels (défaut 180). */
  height?: number;
  disabled?: boolean;
}

/**
 * Pad de signature canvas — souris / doigt / stylet (pointer events).
 *
 * Style "lazy brush" minimal : on capture chaque pointermove et on trace un
 * segment depuis la position précédente. Le canvas est resize au mount + au
 * resize de la fenêtre pour rester net en HiDPI.
 *
 * Pas de dépendance externe (pas react-signature-canvas) — implémentation
 * directe ~100 lignes, contrôle total sur l'UX.
 */
export function SignaturePad({ onChange, height = 180, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const setupComplete = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Resize canvas to wrapper width × height, scaled for HiDPI.
  // ⚠️ Réassigner canvas.width/height EFFACE le bitmap. On capture l'image
  // existante en PNG avant le resize, puis on la redessine après — sinon le
  // moindre resize de fenêtre (ou un hot-reload) efface la signature
  // visuellement alors que l'état React la croit encore présente.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      const cssW = rect.width;
      const cssH = height;
      const targetW = Math.round(cssW * dpr);
      const targetH = Math.round(cssH * dpr);

      // ⛔ NO-OP si les dimensions sont identiques — sans ce check, le
      // ResizeObserver fire au moindre changement de style (ex: border-emerald-300
      // qui apparait quand hasInk passe à true) et déclenche un cycle
      // "snapshot → resize → restore" qui efface la signature en cours.
      if (canvas.width === targetW && canvas.height === targetH) return;

      // Snapshot du contenu courant (uniquement après la 1ère config — sinon
      // on capturerait le PNG default 300x150 du canvas vide).
      let prevDataUrl: string | null = null;
      if (setupComplete.current) {
        try {
          prevDataUrl = canvas.toDataURL('image/png');
        } catch {
          // canvas tainted — on ignore
        }
      }

      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1F2937';
      ctx.lineWidth = 2;
      setupComplete.current = true;

      // Redessine l'image précédente (signature préservée)
      if (prevDataUrl && prevDataUrl.length > 200) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, cssW, cssH);
        img.src = prevDataUrl;
      }
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPos.current = getPos(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    if (!hasInk) setHasInk(true);
  };

  const onPointerUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.scale(dpr, dpr);
    }
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className={cn(
          'rounded-xl bg-white relative overflow-hidden transition-colors shadow-sm',
          disabled
            ? 'border border-gray-200 opacity-60 cursor-not-allowed'
            : hasInk
              ? 'border border-green-300 bg-green-50/30'
              : 'border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/30',
        )}
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cn('touch-none', disabled ? 'cursor-not-allowed' : 'cursor-crosshair')}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-gray-400 italic">
              Signe ici avec ta souris, ton doigt ou ton stylet
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">
          {hasInk ? (
            <span className="inline-flex items-center gap-1.5 text-green-700 font-medium">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Signature enregistrée
            </span>
          ) : (
            <span className="text-gray-500">Trace ta signature dans la zone ci-dessus</span>
          )}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all duration-300 ease-out active:scale-[0.97]',
            hasInk && !disabled
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-gray-50 text-gray-300 cursor-not-allowed',
          )}
        >
          <Eraser className="h-3.5 w-3.5" /> Effacer
        </button>
      </div>
    </div>
  );
}
