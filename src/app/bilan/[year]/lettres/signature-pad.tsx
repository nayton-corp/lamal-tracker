"use client";

import { Eraser, PenLine } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { saveSignatureAction } from "@/app/actions/journey";
import { Button } from "@/ui/button";
import { FormError } from "@/ui/form";
import { Sheet } from "@/ui/sheet";

const WIDTH = 600;
const HEIGHT = 220;

/** Signature au doigt (ou à la souris), enregistrée en PNG puis apposée sur les courriers PDF. */
export function SignaturePad({ personId, name, signed }: { personId: number; name: string; signed: boolean }) {
  const [open, setOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * WIDTH) / r.width, y: ((e.clientY - r.top) * HEIGHT) / r.height };
  };
  const ctx = () => {
    const c = canvas.current!.getContext("2d")!;
    c.lineWidth = 3.2;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = "#0b1f4d";
    return c;
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = point(e);
    const c = ctx();
    c.beginPath();
    c.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    c.fill();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    const p = point(e);
    const c = ctx();
    c.beginPath();
    c.moveTo(last.current.x, last.current.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  }
  const up = () => (last.current = null);

  function clear() {
    canvas.current?.getContext("2d")?.clearRect(0, 0, WIDTH, HEIGHT);
    setEmpty(true);
  }

  function save() {
    const dataUrl = canvas.current!.toDataURL("image/png");
    setError(null);
    start(async () => {
      const res = await saveSignatureAction(personId, dataUrl);
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setEmpty(true);
      }}
      title={`Signature de ${name}`}
      description="Signez dans le cadre avec le doigt ou la souris."
      trigger={
        <Button size="sm" variant={signed ? "ghost" : "secondary"}>
          <PenLine aria-hidden className="size-4" /> {signed ? "Signer à nouveau" : "Signer à l'écran"}
        </Button>
      }
    >
      <div className="space-y-3">
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          data-vaul-no-drag
          aria-label={`Zone de signature de ${name}`}
          className="w-full touch-none rounded-xl border-2 border-dashed border-border bg-white"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={clear}>
            <Eraser aria-hidden className="size-4" /> Effacer
          </Button>
          <Button type="button" block disabled={empty || pending} onClick={save}>
            {pending ? "Enregistrement…" : "Enregistrer la signature"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
