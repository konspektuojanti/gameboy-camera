import React, { useEffect, useRef, useState } from "react";

const WIDTH = 128;
const HEIGHT = 112;

const PRESETS = {
  "Game Boy": { r: 0.299, g: 0.587, b: 0.114, k: 1.6 },
  "Red Filter": { r: 1.0, g: 0.1, b: 0.1, k: 1.8 },
  "Green Filter": { r: 0.1, g: 1.0, b: 0.1, k: 1.6 },
  "Blue Filter": { r: 0.1, g: 0.2, b: 1.0, k: 1.4 },
  "Flat / Lomo": { r: 0.4, g: 0.4, b: 0.4, k: 0.9 },
  "High Contrast": { r: 0.299, g: 0.587, b: 0.114, k: 2.5 },
  "E's Preset": { r: 0.30, g: 0.22, b: 0.11, k: 2.50 },
};

function quantize(v) {
  const palette = [0, 85, 170, 255];
  return palette.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

function applyDither(ctx) {
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
        const nx = x + dx, ny = y + dy;
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

function applyColorDither(ctx) {
  const img = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const data = img.data;
  const palette = [0, 85, 170, 255];
  const quantCh = (v) => palette.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c++) {
        const old = data[i + c];
        const nv = quantCh(old);
        const err = old - nv;
        data[i + c] = nv;
        const spread = (dx, dy, factor) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) return;
          const ni = (ny * WIDTH + nx) * 4;
          data[ni + c] = Math.max(0, Math.min(255, data[ni + c] + err * factor));
        };
        spread(1, 0, 7 / 16);
        spread(-1, 1, 3 / 16);
        spread(0, 1, 5 / 16);
        spread(1, 1, 1 / 16);
      }
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
  const [colorMode, setColorMode] = useState(false);
  const [channels, setChannels] = useState({ r: 0.299, g: 0.587, b: 0.114, k: 1.6 });
  const [activePreset, setActivePreset] = useState("Game Boy");
  const channelsRef = useRef(channels);
  const colorModeRef = useRef(colorMode);

  useEffect(() => { channelsRef.current = channels; }, [channels]);
  useEffect(() => { colorModeRef.current = colorMode; }, [colorMode]);

  useEffect(() => {
    let active = true;
    async function startCamera() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      if (!active) return;
      setStream(media);
      if (videoRef.current) videoRef.current.srcObject = media;
    }
    startCamera();
    return () => { active = false; };
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
      const { r, g, b, k } = channelsRef.current;
      const isColor = colorModeRef.current;
      const hiddenCtx = hiddenCanvas.getContext("2d", { willReadFrequently: true });

      if (isColor) {
        hiddenCtx.filter = `contrast(${k * 100}%)`;
        hiddenCtx.drawImage(video, 0, 0, WIDTH, HEIGHT);
        const img = hiddenCtx.getImageData(0, 0, WIDTH, HEIGHT);
        const data = img.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i]     = Math.min(255, data[i] * r * 3);
          data[i + 1] = Math.min(255, data[i + 1] * g * 3);
          data[i + 2] = Math.min(255, data[i + 2] * b * 3);
        }
        hiddenCtx.putImageData(img, 0, 0);
        applyColorDither(hiddenCtx);
      } else {
        hiddenCtx.filter = "none";
        hiddenCtx.drawImage(video, 0, 0, WIDTH, HEIGHT);
        const img = hiddenCtx.getImageData(0, 0, WIDTH, HEIGHT);
        const data = img.data;
        const total = r + g + b || 1;
        for (let i = 0; i < data.length; i += 4) {
          const lum = (data[i] * r + data[i + 1] * g + data[i + 2] * b) / total;
          const contrasted = Math.min(255, Math.max(0, (lum - 128) * k + 128));
          data[i] = data[i + 1] = data[i + 2] = contrasted;
        }
        hiddenCtx.putImageData(img, 0, 0);
        applyDither(hiddenCtx);
      }

      const displayCtx = displayCanvas.getContext("2d");
      displayCtx.imageSmoothingEnabled = false;
      displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
      displayCtx.drawImage(hiddenCanvas, 0, 0, displayCanvas.width, displayCanvas.height);
      frame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(frame);
  }, []);

  const applyPreset = (name) => {
    setActivePreset(name);
    setChannels(PRESETS[name]);
  };

  const handleSlider = (ch, val) => {
    setActivePreset(null);
    setChannels((prev) => ({ ...prev, [ch]: parseFloat(val) }));
  };

  const switchCamera = () => setFacingMode((prev) => (prev === "user" ? "environment" : "user"));

  const savePhoto = () => {
    const url = displayCanvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `gameboy-photo-${Date.now()}.png`;
    a.click();
  };

  const s = {
    wrap: { minHeight: "100vh", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "monospace" },
    card: { background: "#16213e", borderRadius: "16px", padding: "20px", width: "100%", maxWidth: "420px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" },
    title: { color: "#a8ff78", fontSize: "1.2rem", fontWeight: "bold", textAlign: "center", marginBottom: "12px", letterSpacing: "2px" },
    canvas: { border: "3px solid #0f3460", borderRadius: "8px", width: "100%", imageRendering: "pixelated" },
    section: { marginTop: "16px" },
    label: { color: "#a8ff78", fontSize: "0.7rem", letterSpacing: "1px", marginBottom: "6px", display: "block" },
    presetRow: { display: "flex", flexWrap: "wrap", gap: "6px" },
    presetBtn: (active) => ({ padding: "4px 10px", borderRadius: "6px", border: "1px solid #a8ff78", cursor: "pointer", fontSize: "0.7rem", background: active ? "#a8ff78" : "transparent", color: active ? "#1a1a2e" : "#a8ff78" }),
    sliderRow: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" },
    sliderLabel: (color) => ({ color, width: "12px", fontSize: "0.8rem", fontWeight: "bold" }),
    sliderVal: { color: "#fff", fontSize: "0.7rem", width: "32px", textAlign: "right" },
    btnRow: { display: "flex", gap: "8px", marginTop: "16px" },
    btn: { flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid #a8ff78", background: "transparent", color: "#a8ff78", cursor: "pointer", fontSize: "0.75rem", letterSpacing: "1px" },
    toggleBtn: (active) => ({ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid #a8ff78", cursor: "pointer", fontSize: "0.75rem", letterSpacing: "1px", background: active ? "#a8ff78" : "transparent", color: active ? "#1a1a2e" : "#a8ff78" }),
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.title}>GAME BOY CAMERA</div>

        <video ref={videoRef} autoPlay playsInline style={{ display: "none" }} />
        <canvas ref={hiddenCanvasRef} width={WIDTH} height={HEIGHT} style={{ display: "none" }} />
        <canvas ref={displayCanvasRef} width={384} height={336} style={s.canvas} />

        <div style={s.section}>
          <span style={s.label}>OUTPUT MODE</span>
          <div style={s.btnRow}>
            <button style={s.toggleBtn(!colorMode)} onClick={() => setColorMode(false)}>GRAYSCALE</button>
            <button style={s.toggleBtn(colorMode)} onClick={() => setColorMode(true)}>COLOR</button>
          </div>
        </div>

        <div style={s.section}>
          <span style={s.label}>FILM PRESETS</span>
          <div style={s.presetRow}>
            {Object.keys(PRESETS).map((name) => (
              <button key={name} style={s.presetBtn(activePreset === name)} onClick={() => applyPreset(name)}>{name}</button>
            ))}
          </div>
        </div>

        <div style={s.section}>
          <span style={s.label}>CHANNEL MIX</span>
          {[
            { ch: "r", color: "#ff6b6b", label: "R", min: 0, max: 1, step: 0.01 },
            { ch: "g", color: "#6bff8a", label: "G", min: 0, max: 1, step: 0.01 },
            { ch: "b", color: "#6bb5ff", label: "B", min: 0, max: 1, step: 0.01 },
            { ch: "k", color: "#ffffff", label: "K", min: 0.5, max: 3, step: 0.05 },
          ].map(({ ch, color, label, min, max, step }) => (
            <div key={ch} style={s.sliderRow}>
              <span style={s.sliderLabel(color)}>{label}</span>
              <input type="range" min={min} max={max} step={step} value={channels[ch]}
                onChange={(e) => handleSlider(ch, e.target.value)}
                style={{ flex: 1, accentColor: color }} />
              <span style={s.sliderVal}>{parseFloat(channels[ch]).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div style={s.btnRow}>
          <button style={s.btn} onClick={switchCamera}>SWITCH CAM</button>
          <button style={s.btn} onClick={savePhoto}>TAKE & SAVE</button>
        </div>
      </div>
    </div>
  );
}
