import React, { useEffect, useRef, useState } from "react";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent } from "@/components/ui/card";

const WIDTH = 128;
const HEIGHT = 112;

function quantize(v) {
  const palette = [0, 85, 170, 255];
  return palette.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

function applyGameBoyEffect(ctx, sourceCanvas) {
  const img = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const data = img.data;

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      const gray = data[i];
      const newVal = quantize(gray);
      const err = gray - newVal;

      data[i] = data[i + 1] = data[i + 2] = newVal;

      const spread = (dx, dy, factor) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) return;
        const ni = (ny * WIDTH + nx) * 4;
        const next = Math.max(0, Math.min(255, data[ni] + err * factor));
        data[ni] = data[ni + 1] = data[ni + 2] = next;
      };

      spread(1, 0, 7 / 16);
      spread(-1, 1, 3 / 16);
      spread(0, 1, 5 / 16);
      spread(1, 1, 1 / 16);
    }
  }

  ctx.putImageData(img, 0, 0);
}

export default function GameBoyCameraApp() {
  const videoRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const [facingMode, setFacingMode] = useState("environment");
  const [stream, setStream] = useState(null);

  useEffect(() => {
    let active = true;

    async function startCamera() {
      if (stream) stream.getTracks().forEach((t) => t.stop());

      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });

      if (!active) return;

      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
      }
    }

    startCamera();

    return () => {
      active = false;
    };
  }, [facingMode]);

  useEffect(() => {
    let frame;

    const render = () => {
      const video = videoRef.current;
      const hiddenCanvas = hiddenCanvasRef.current;
      const displayCanvas = displayCanvasRef.current;
      if (!video || !hiddenCanvas || !displayCanvas || video.readyState < 2) {
        frame = requestAnimationFrame(render);
        return;
      }

      const hiddenCtx = hiddenCanvas.getContext("2d", { willReadFrequently: true });
      hiddenCtx.filter = "grayscale(100%) contrast(160%)";
      hiddenCtx.drawImage(video, 0, 0, WIDTH, HEIGHT);
      applyGameBoyEffect(hiddenCtx, hiddenCanvas);

      const displayCtx = displayCanvas.getContext("2d");
      displayCtx.imageSmoothingEnabled = false;
      displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      displayCtx.drawImage(hiddenCanvas, 0, 0, displayCanvas.width, displayCanvas.height);

      frame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(frame);
  }, []);

  const switchCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  const savePhoto = () => {
    const url = displayCanvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `gameboy-photo-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
      <div className="rounded-2xl shadow-xl p-4 w-full max-w-md">
        <div className="space-y-4 flex flex-col items-center">
          <h1 className="text-xl font-bold">Game Boy Camera</h1>

          <video ref={videoRef} autoPlay playsInline className="hidden" />
          <canvas ref={hiddenCanvasRef} width={WIDTH} height={HEIGHT} className="hidden" />

          <canvas
            ref={displayCanvasRef}
            width={384}
            height={336}
            className="border rounded-2xl"
          />

          <div className="flex gap-3">
            <button onClick={switchCamera}>Switch Camera</button> 
            <button onClick={savePhoto}>Take & Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}