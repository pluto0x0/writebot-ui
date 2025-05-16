import React, { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * JSON → G‑Code Converter (React + shadcn/ui)
 * -------------------------------------------
 * - 支持上传[[[x,y,w], ...], ...] 结构的 JSON
 * - 线性 / Catmull‑Rom 插值 + 密度控制
 * - 坐标偏移 / 缩放 / Z‑W 线性映射
 * - 实时 Canvas 预览（缩放 / 拖拽）
 * - 本地下载 .gcode 及发送到 API
 */
export default function App() {
  /* ------------------------- 状态 ------------------------- */
  const [rawStrokes, setRawStrokes] = useState([]); // 原始 JSON
  const [interpMethod, setInterpMethod] = useState("catmull");
  const [density, setDensity] = useState(2);

  const [xOff, setXOff] = useState(0);
  const [yOff, setYOff] = useState(0);
  const [scale, setScale] = useState(1);

  const [zMin, setZMin] = useState(-0.4);
  const [zMax, setZMax] = useState(0.4);
  const [wMax, setWMax] = useState(6);

  const [penDownZ, setPenDownZ] = useState(-24.4);
  const [penUpZ, setPenUpZ] = useState(-22);

  const [gStart, setGStart] = useState("G21\nG90\n");
  const [gEnd, setGEnd] = useState("G0 Z0\nG0 X0 Y0\n");

  const [gcode, setGcode] = useState("");
  const [hasPreview, setHasPreview] = useState(false);

  /* ----------------------- Canvas refs ----------------------- */
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);

  /* --------------------- 工具函数 --------------------- */
  const linearInterp = (pts, dens) => {
    if (pts.length < 2) return pts;
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, w0] = pts[i];
      const [x1, y1, w1] = pts[i + 1];
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(2, Math.floor(dist * dens));
      for (let j = 0; j < steps; j++) {
        const t = j / (steps - 1);
        out.push([
          x0 + (x1 - x0) * t,
          y0 + (y1 - y0) * t,
          w0 + (w1 - w0) * t,
        ]);
      }
    }
    return out;
  };

  const catmullRom = (pts, dens) => {
    if (pts.length < 2) return pts;
    const out = [];
    const N = pts.length;
    const get = (i) => pts[Math.max(0, Math.min(N - 1, i))];
    for (let i = 0; i < N - 1; i++) {
      const p0 = get(i - 1);
      const p1 = get(i);
      const p2 = get(i + 1);
      const p3 = get(i + 2);
      const base = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(8, Math.floor(base * dens));
      for (let j = 0; j < steps; j++) {
        const t = j / (steps - 1);
        const t2 = t * t;
        const t3 = t2 * t;
        const b0 = -0.5 * t3 + t2 - 0.5 * t;
        const b1 = 1.5 * t3 - 2.5 * t2 + 1;
        const b2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
        const b3 = 0.5 * t3 - 0.5 * t2;
        out.push([
          b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
          b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
          b0 * p0[2] + b1 * p1[2] + b2 * p2[2] + b3 * p3[2],
        ]);
      }
    }
    return out;
  };

  const interpolate = useCallback(
    (stroke) => {
      return interpMethod === "linear"
        ? linearInterp(stroke, density)
        : interpMethod === "catmull"
        ? catmullRom(stroke, density)
        : stroke;
    },
    [interpMethod, density]
  );

  const w2z = useCallback(
    (w) => zMin + ((zMax - zMin) * w) / wMax,
    [zMin, zMax, wMax]
  );

  const generateGcode = useCallback(
    (strokes) => {
      const feed = 1000;
      let gc = gStart.replace(/\r?\n/g, "\n");
      strokes.forEach((stroke) => {
        stroke.forEach(([x, y, w], idx) => {
          const X = (x * scale + xOff).toFixed(3);
          const Y = (y * scale + yOff).toFixed(3);
          const Z = (penDownZ + w2z(w)).toFixed(3);
          if (idx === 0) {
            gc += `G0 X${X} Y${Y} F${feed}\n`;
            gc += `G1 Z${Z} F${feed}\n`;
          } else {
            gc += `G01 X${X} Y${Y} Z${Z} F${feed}\n`;
          }
        });
        gc += `G0 Z${penUpZ}\n`;
      });
      gc += gEnd.replace(/\r?\n/g, "\n");
      return gc;
    },
    [gStart, gEnd, penDownZ, penUpZ, xOff, yOff, scale, w2z]
  );

  /* ------------------- Canvas 渲染 ------------------- */
  const draw = useCallback(
    (strokes) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.lineCap = "round";
      ctx.lineWidth = 1 / zoom;
      ctx.strokeStyle = "#1f2937"; // slate-800
      strokes.forEach((stroke) => {
        ctx.beginPath();
        stroke.forEach(([x, y], idx) => {
          idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      });
      ctx.restore();
    },
    [zoom, pan]
  );

  /* ------------------- 主预览流程 ------------------- */
  const handlePreview = () => {
    if (!rawStrokes.length) return alert("请先上传 JSON 文件");
    const processed = rawStrokes.map(interpolate);
    draw(processed);
    setGcode(generateGcode(processed));
    setHasPreview(true);
  };

  /* ------------------- 文件上传 ------------------- */
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      if (!Array.isArray(data)) throw new Error("JSON 顶层应为数组");
      setRawStrokes(data);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setHasPreview(false);
    } catch (err) {
      alert("解析失败: " + err.message);
    }
  };

  /* ------------------- 保存 G‑Code ------------------- */
  const handleSave = () => {
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `output_${Date.now()}.gcode`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ------------------- 发送 API ------------------- */
  const handleSend = async () => {
    const api = ""; // TODO: 填写 API
    if (!api) return alert("API 地址未配置");
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: gcode,
      });
      if (!res.ok) throw new Error(res.statusText);
      const text = await res.text();
      alert("发送成功: " + text);
    } catch (err) {
      alert("发送失败: " + err.message);
    }
  };

  /* ------------------- 画布交互 ------------------- */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const wheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = canvasRef.current.getBoundingClientRect();
      const cx = (e.clientX - rect.left - pan.x) / zoom;
      const cy = (e.clientY - rect.top - pan.y) / zoom;
      setZoom((z) => z * factor);
      setPan((p) => ({
        x: p.x - cx * (factor - 1) * zoom,
        y: p.y - cy * (factor - 1) * zoom,
      }));
    };

    const down = (e) => {
      isPanning.current = true;
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };
    const move = (e) => {
      if (!isPanning.current) return;
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    };
    const up = () => (isPanning.current = false);

    wrapper.addEventListener("wheel", wheel, { passive: false });
    wrapper.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);

    return () => {
      wrapper.removeEventListener("wheel", wheel);
      wrapper.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [zoom, pan]);

  /* ------------------- 重新绘制 ------------------- */
  useEffect(() => {
    if (hasPreview) {
      const processed = rawStrokes.map(interpolate);
      draw(processed);
    }
  }, [zoom, pan, hasPreview, rawStrokes, interpolate, draw]);

  /* ------------------------- UI ------------------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-neutral-900 dark:to-neutral-800 p-6 text-neutral-900 dark:text-neutral-100 space-y-6">
      <h1 className="text-3xl font-bold">JSON → G‑Code Converter</h1>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* 控制面板 */}
        <Card className="shadow-xl dark:bg-neutral-800">
          <CardContent className="space-y-6 pt-6">
            {/* File */}
            <div className="space-y-2">
              <label className="font-medium">上传原始 JSON</label>
              <Input type="file" accept="application/json" onChange={handleFile} />
            </div>

            {/* Interpolation */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-1">
                <label className="font-medium mb-1 block">插值方法</label>
                <Select value={interpMethod} onValueChange={setInterpMethod}>
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无</SelectItem>
                    <SelectItem value="linear">线性</SelectItem>
                    <SelectItem value="catmull">Catmull‑Rom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="font-medium mb-1 block">密度 (点/mm)</label>
                <Input type="number" step="0.1" value={density} onChange={(e) => setDensity(+e.target.value)} />
              </div>
            </div>

            {/* Transform params */}
            <details className="rounded-xl border p-4">
              <summary className="font-medium cursor-pointer">坐标变换与 Z‑W 关系</summary>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <InputField label="X 偏移" value={xOff} setValue={setXOff} />
                <InputField label="Y 偏移" value={yOff} setValue={setYOff} />
                <InputField label="缩放" value={scale} step={0.01} setValue={setScale} />
                <InputField label="Z(min) w=0" value={zMin} setValue={setZMin} step={0.01} />
                <InputField label="Z(max) w=max" value={zMax} setValue={setZMax} step={0.01} />
                <InputField label="w 最大" value={wMax} setValue={setWMax} />
              </div>
            </details>

            {/* G‑code blocks */}
            <div className="grid gap-4">
              <TextareaField label="起始 G‑Code" value={gStart} setValue={setGStart} rows={3} />
              <InputField label="笔落 Z" value={penDownZ} setValue={setPenDownZ} step={0.01} />
              <InputField label="笔起 Z" value={penUpZ} setValue={setPenUpZ} step={0.01} />
              <TextareaField label="结束 G‑Code" value={gEnd} setValue={setGEnd} rows={2} />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-4 pt-2">
              <Button onClick={handlePreview}>预览 / 更新</Button>
              <Button variant="success" disabled={!hasPreview} onClick={handleSave}>
                保存 G‑Code
              </Button>
              <Button variant="secondary" disabled={!hasPreview} onClick={handleSend}>
                发送到 API
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Canvas */}
        <div className="space-y-2">
          <h2 className="text-xl font-medium">实时预览</h2>
          <div
            ref={wrapperRef}
            className="border rounded-2xl shadow-inner bg-white dark:bg-neutral-800 overflow-auto h-[70vh]"
          >
            <canvas ref={canvasRef} width={800} height={800} className="block mx-auto" />
          </div>
          <p className="text-sm text-neutral-500">滚轮缩放，拖拽平移</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------ 可复用小组件 ------------------ */
function InputField({ label, value, setValue, step = 0.1 }) {
  return (
    <div>
      <label className="font-medium mb-1 block">{label}</label>
      <Input type="number" step={step} value={value} onChange={(e) => setValue(+e.target.value)} />
    </div>
  );
}

function TextareaField({ label, value, setValue, rows = 3 }) {
  return (
    <div>
      <label className="font-medium mb-1 block">{label}</label>
      <Textarea rows={rows} value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}
