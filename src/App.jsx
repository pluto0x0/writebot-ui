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
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { io } from "socket.io-client";
// import { Label } from "@radix-ui/react-dropdown-menu"; // Label was imported but not used directly in the provided code.

/**
 * JSON (multi-character) → G‑Code Converter
 * -------------------------------------------------------
 * - Supports uploading JSON: Array of characters, each char is [[[x,y,w], ...], ...]
 * - Layout: X/Y bounds, line/column spacing.
 * - Character Randomization: X, Y, Rotation (Gaussian).
 * - Filtering & Interpolation per stroke.
 * - Coordinate scaling / Z‑W linear mapping.
 * - Real-time Canvas preview.
 * - Canvas Zoom/Pan.
 */

export default function App() {
  /* ------------------------- State: Original Data & Processing ------------------------- */
  const [rawTexts, setRawTexts] = useState([]); // Array of characters
  const [interpMethod, setInterpMethod] = useState("none");
  const [density, setDensity] = useState(2);

  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterWindow, setFilterWindow] = useState(5);

  /* ------------------------- State: Layout Parameters ------------------------- */
  const [xMinLayout, setXMinLayout] = useState(10);
  const [xMaxLayout, setXMaxLayout] = useState(200);
  const [yMinLayout, setYMinLayout] = useState(10);
  const [lineSpacing, setLineSpacing] = useState(60); // Approximate height of a character + gap
  const [columnSpacing, setColumnSpacing] = useState(5);

  /* ------------------------- State: Character Randomization ------------------------- */
  const [randomXMean, setRandomXMean] = useState(0);
  const [randomXVariance, setRandomXVariance] = useState(0);
  const [randomYMean, setRandomYMean] = useState(0);
  const [randomYVariance, setRandomYVariance] = useState(0);
  const [randomRotationMean, setRandomRotationMean] = useState(0); // Degrees
  const [randomRotationVariance, setRandomRotationVariance] = useState(0); // Degrees^2

  /* ------------------------- State: Transformations & G-Code Params ------------------------- */
  const [scale, setScale] = useState(0.2);
  const [zMin, setZMin] = useState(-0.4);
  const [zMax, setZMax] = useState(0.4);

  const [penDownZ, setPenDownZ] = useState(-24.4);
  const [penUpZ, setPenUpZ] = useState(-22);

  const [gStart, setGStart] = useState("G21\nG90\n");
  const [gEnd, setGEnd] = useState("G00 Z0\nG00 X0 Y0\n");

  const [gcode, setGcode] = useState("");
  const [hasPreview, setHasPreview] = useState(false);
  const [displayMode, setDisplayMode] = useState("processed");

  const [feedrate00, setFeedrate00] = useState(4000);
  const [feedrate01, setFeedrate01] = useState(3500);

  /* ------------------------- Socket ------------------------- */
  // const socket = io("http://localhost:3000", {
  //   transports: ["websocket"],
  //   path: "/socket.io",
  // });
  // 单一 Socket.IO 客户端
  const { hostname } = window.location;
  console.log('Connecting to socket server at:', `http://${hostname}:3000`);
  const socket = io(`http://${hostname}:3000`, {
    transports: ["websocket"],
    path: "/socket.io",
  });
  const [hasSocket, setHasSocket] = useState(false); // Keep for UI indication if needed

  /* ----------------------- Canvas refs & Interaction ----------------------- */
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);

  /* --------------------- Utility Functions --------------------- */
  // Gaussian Random Number (Box-Muller transform)
  const gaussianRandom = (mean, variance) => {
    if (variance === 0) return mean;
    const stdDev = Math.sqrt(variance);
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random(); //Ensure u1 is not 0
    while (u2 === 0) u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  };

  // Rotate point (px, py) around (cx, cy) by angle in radians
  const rotatePoint = (px, py, angleRad, cx, cy) => {
    const s = Math.sin(angleRad);
    const c = Math.cos(angleRad);
    const x = px - cx;
    const y = py - cy;
    const newX = x * c - y * s;
    const newY = x * s + y * c;
    return [newX + cx, newY + cy];
  };

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
        out.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t]);
      }
    }
    return out.length > 0 ? out : pts; // Ensure non-empty output if input was single point
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
      const steps = Math.max(8, Math.floor(base * dens * 0.5)); // Adjusted density impact for Catmull
      for (let j = 0; j < steps; j++) {
        const t = j / (steps -1 <=0 ? 1: steps-1) ; // Avoid division by zero if steps is 1
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
     return out.length > 0 ? out : (pts.length === 1 ? [pts[0]] : []); // Handle single point or empty result
  };

  function smoothStroke(pts, windowSize = 3) {
    if (pts.length <= 2 || windowSize <= 1) return pts;
    const out = [];
    for (let i = 0; i < pts.length; ++i) {
      let sx = 0, sy = 0, sw = 0, n = 0;
      for (let j = -Math.floor(windowSize / 2); j <= Math.floor(windowSize / 2); ++j) {
        const idx = Math.min(pts.length - 1, Math.max(0, i + j));
        sx += pts[idx][0];
        sy += pts[idx][1];
        sw += pts[idx][2];
        n++;
      }
      out.push([sx / n, sy / n, sw / n]);
    }
    return out;
  }

  const interpolate = useCallback(
    (stroke) => {
      if (!stroke || stroke.length === 0) return [];
      return interpMethod === "linear"
        ? linearInterp(stroke, density)
        : interpMethod === "catmull"
        ? catmullRom(stroke, density)
        : stroke;
    },
    [interpMethod, density]
  );

  const w2z = useCallback(
    (w) => zMin + ((zMax - zMin) * (w - 2)) / 4, // Assuming w range 2-6
    [zMin, zMax]
  );

  /* ------------------- Core Processing & Layout Logic ------------------- */
  const processAndLayoutTexts = useCallback(() => {
    if (!rawTexts || rawTexts.length === 0) return [];

    let allGloballyTransformedStrokes = [];
    let currentLineOriginX = xMinLayout;
    let currentLineOriginY = yMinLayout;

    for (const charOriginalStrokes of rawTexts) {
      if (!charOriginalStrokes || charOriginalStrokes.length === 0) continue;

      // 1. Calculate scaled bounding box and pivot for the current character (from original points)
      let charMinScaledX = Infinity, charMinScaledY = Infinity;
      let charMaxScaledX = -Infinity, charMaxScaledY = -Infinity;
      
      let hasPoints = false;
      charOriginalStrokes.forEach(stroke => {
        if (!stroke || stroke.length === 0) return;
        stroke.forEach(([x, y, _w]) => {
          hasPoints = true;
          const sx = x * scale;
          const sy = y * scale;
          charMinScaledX = Math.min(charMinScaledX, sx);
          charMaxScaledX = Math.max(charMaxScaledX, sx);
          charMinScaledY = Math.min(charMinScaledY, sy);
          charMaxScaledY = Math.max(charMaxScaledY, sy);
        });
      });

      if (!hasPoints) { // Character has no drawable points
        currentLineOriginX += columnSpacing; // Advance by column spacing even for empty char
        continue;
      }
      
      const charScaledWidth = charMaxScaledX - charMinScaledX;
      const charScaledHeight = charMaxScaledY - charMinScaledY; // For potential future use with yMaxLayout

      // 2. Layout: Check for wrapping
      if (currentLineOriginX !== xMinLayout && (currentLineOriginX + charScaledWidth) > xMaxLayout) {
        currentLineOriginX = xMinLayout;
        currentLineOriginY += lineSpacing;
      }
      
      // This character's top-left in the layout
      const charLayoutOriginX = currentLineOriginX;
      const charLayoutOriginY = currentLineOriginY;

      // 3. Define rotation pivot (center of the character's scaled bounding box)
      const pivotScaledX = charMinScaledX + charScaledWidth / 2;
      const pivotScaledY = charMinScaledY + charScaledHeight / 2;

      // 4. Generate random transformations for this character
      const randDeltaX = gaussianRandom(randomXMean, randomXVariance);
      const randDeltaY = gaussianRandom(randomYMean, randomYVariance);
      const randRotationDeg = gaussianRandom(randomRotationMean, randomRotationVariance);
      const randRotationRad = randRotationDeg * (Math.PI / 180);

      // 5. Process each stroke of the character
      charOriginalStrokes.forEach(rawStrokeData => {
        if (!rawStrokeData || rawStrokeData.length === 0) return;
        
        let processedStroke = rawStrokeData; // Points are [x,y,w] in original char space
        if (filterEnabled) processedStroke = smoothStroke(processedStroke, filterWindow);
        processedStroke = interpolate(processedStroke);
        if (!processedStroke || processedStroke.length === 0) return;

        const fullyTransformedStroke = processedStroke.map(([x, y, w]) => {
          // a. Scale original point
          let spx = x * scale;
          let spy = y * scale;

          // b. Rotate scaled point around character's scaled pivot
          let [rpx, rpy] = rotatePoint(spx, spy, randRotationRad, pivotScaledX, pivotScaledY);
          
          // c. Apply random translation (to the rotated point)
          let randomOffsetPx = rpx + randDeltaX;
          let randomOffsetPy = rpy + randDeltaY;

          // d. Translate to final layout position
          // The point (randomOffsetPx, randomOffsetPy) is in a system where the char's original scaled minX was charMinScaledX.
          // We want to place this character such that its bounding box's minX (after rand transforms) aligns with charLayoutOriginX.
          // Effectively, shift the transformed character block.
          let finalX = charLayoutOriginX + (randomOffsetPx - charMinScaledX);
          let finalY = charLayoutOriginY + (randomOffsetPy - charMinScaledY);
          
          return [finalX, finalY, w];
        });
        allGloballyTransformedStrokes.push(fullyTransformedStroke);
      });
      
      // 6. Update X origin for the next character on the same line
      currentLineOriginX += charScaledWidth + columnSpacing;
    }
    return allGloballyTransformedStrokes;
  }, [
    rawTexts, scale, xMinLayout, xMaxLayout, yMinLayout, lineSpacing, columnSpacing,
    randomXMean, randomXVariance, randomYMean, randomYVariance,
    randomRotationMean, randomRotationVariance,
    filterEnabled, filterWindow, interpolate // interpolate depends on interpMethod, density
  ]);

  /* ------------------- G-code Generation ------------------- */
  const generateGcode = useCallback(
    (globallyTransformedStrokes) => {
      // const feed = 1000;
      let gc = gStart.replace(/\r?\n/g, "\n");
      globallyTransformedStrokes.forEach((stroke) => {
        if (!stroke || stroke.length === 0) return;
        stroke.forEach(([x, y, w], idx) => {
          const X_gcode = x.toFixed(3);
          const Y_gcode = y.toFixed(3);
          const Z_gcode = (penDownZ + w2z(w)).toFixed(3);
          if (idx === 0) {
            gc += `G00 X${X_gcode} Y${Y_gcode} F${feedrate00}\n`;
            gc += `G01 Z${Z_gcode} F${feedrate01}\n`;
          } else {
            gc += `G01 X${X_gcode} Y${Y_gcode} Z${Z_gcode} F${feedrate01}\n`;
          }
        });
        gc += `G00 Z${penUpZ.toFixed(3)}\n`;
      });
      gc += gEnd.replace(/\r?\n/g, "\n");
      return gc;
    },
    [gStart, gEnd, penDownZ, penUpZ, w2z, feedrate01, feedrate00]
  );

  /* ------------------- Canvas Rendering ------------------- */
  const draw = useCallback(
    (transformedStrokes, gcodeLines = []) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      ctx.fillStyle = "#f8f8f8"; // Consider theme for background
      // const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      // ctx.fillStyle = theme === 'dark' ? '#1a1a1a' : '#f8f8f8';
      ctx.fillRect(0,0, canvas.width/zoom, canvas.height/zoom); // Fill considering zoom

      if (displayMode === "processed") {
        ctx.lineCap = "round";
        ctx.strokeStyle = "#222"; // Consider theme for stroke color
        transformedStrokes.forEach((stroke) => {
          if (!stroke || stroke.length === 0) return;
          ctx.beginPath();
          stroke.forEach(([x, y, w], idx) => {
            // Make stroke width visible even when zoomed out, but also respect 'w'
            const baseLineWidth = Math.max(0.5 / zoom, w * 0.5); // Ensure minimum visibility and scale 'w'
            ctx.lineWidth = baseLineWidth;
            idx ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          });
          if (stroke.length > 0) ctx.stroke();
        });
      } else if (displayMode === "gcode") {
        ctx.lineCap = "round";
        ctx.lineWidth = 1 / zoom;
        let lastPos = null;
        for (const line of gcodeLines) {
          const m = line.match(/^(G0*([01]))\s+X(-?\d+\.?\d*)\s+Y(-?\d+\.?\d*)/i);
          if (m) {
            const G = m[2];
            const x = +m[3], y = +m[4];
            if (lastPos) {
              ctx.beginPath();
              ctx.moveTo(lastPos[0], lastPos[1]);
              ctx.lineTo(x, y);
              ctx.strokeStyle = G === "0" ? "#bbb" : "#222"; // Consider theme
              ctx.stroke();
            }
            lastPos = [x, y];
          }
        }
      }
      ctx.restore();
    },
    [zoom, pan, displayMode]
  );

  /* ------------------- File Upload & Socket ------------------- */
  const loadRawTexts = useCallback((data) => {
    // Expect data to be Array<CharacterData>
    // CharacterData = Array<StrokeData>
    // StrokeData = Array<[x,y,r]>
    if (!Array.isArray(data) || !data.every(char => Array.isArray(char) && char.every(stroke => Array.isArray(stroke) && stroke.every(point => Array.isArray(point) && point.length === 3 && typeof point[0] === 'number')))) {
      console.log("Invalid JSON format:", data);
      alert("Incorrect JSON format. Expected: Array of characters [ [[ [x,y,r],... ],...], ... ]");
      setRawTexts([]); // Clear if format is wrong
      return;
    }
    setRawTexts(data);
    setZoom(1); // Reset zoom/pan on new file
    setPan({ x: 0, y: 0 });
    setHasPreview(false); // Will be set true after processing
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const data = JSON.parse(txt);
      loadRawTexts(data);
    } catch (err) {
      alert("Failed to load JSON: " + err.message);
      setRawTexts([]);
    }
    e.target.value = null; // Reset file input
  };

  useEffect(() => {
    socket.on("connect", () => setHasSocket(true));
    socket.on("disconnect", () => setHasSocket(false));
    socket.on("newData", (data) => {
      console.log("Received data from server via socket:", data);
      if (data && (data.texts || Array.isArray(data))) {
        loadRawTexts(data.texts || data);
      } else {
         console.warn("Received socket data in unexpected format:", data);
      }
    });
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("newData");
    };
  }, [loadRawTexts, socket]);

  /* ------------------- Save & Send G‑Code ------------------- */
  const handleSave = () => {
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `output_multi_${Date.now()}.gcode`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSend = async () => {
    const api = ""; // TODO: Fill in your API endpoint
    if (!api) return alert("API endpoint not configured.");
    if (!gcode) return alert("No G-code to send.");
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: gcode,
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}: ${await res.text()}`);
      const text = await res.text();
      alert("G-code sent successfully: " + text);
    } catch (err) {
      alert("Failed to send G-code: " + err.message);
    }
  };

  /* ------------------- Canvas Interaction Handlers ------------------- */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const pointX = (mouseX - pan.x) / zoom;
      const pointY = (mouseY - pan.y) / zoom;

      setZoom((prevZoom) => {
        const newZoom = prevZoom * factor;
        setPan((prevPan) => ({
          x: mouseX - pointX * newZoom,
          y: mouseY - pointY * newZoom,
        }));
        return newZoom;
      });
    };

    const handleMouseDown = (e) => {
      isPanning.current = true;
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };
    const handleMouseMove = (e) => {
      if (!isPanning.current) return;
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      });
    };
    const handleMouseUp = () => {
      isPanning.current = false;
    };

    wrapper.addEventListener("wheel", handleWheel, { passive: false });
    wrapper.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      wrapper.removeEventListener("wheel", handleWheel);
      wrapper.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [zoom, pan]); // pan and zoom are dependencies

  /* ------------------- Main Effect: Process Data & Update Preview/G-code ------------------- */
  useEffect(() => {
    if (!rawTexts || rawTexts.length === 0) {
      const canvas = canvasRef.current;
      if (canvas) { // Clear canvas if no data
          const ctx = canvas.getContext("2d");
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#1a1a1a' : '#f8f8f8';
          ctx.fillRect(0,0, canvas.width, canvas.height);
          ctx.restore();
      }
      setGcode("");
      setHasPreview(false);
      return;
    }

    const allTransformedStrokes = processAndLayoutTexts();
    const generatedGc = generateGcode(allTransformedStrokes);
    setGcode(generatedGc);
    setHasPreview(true);

    if (displayMode === "processed") {
      draw(allTransformedStrokes);
    } else if (displayMode === "gcode") {
      draw([], generatedGc.split("\n"));
    }
  }, [rawTexts, processAndLayoutTexts, generateGcode, draw, displayMode, zoom, pan]); // zoom, pan for re-draw on view change

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-neutral-900 dark:to-neutral-800 p-4 sm:p-6 text-neutral-900 dark:text-neutral-100 space-y-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">Multi-Character G‑Code Editor</h1>
          <ModeToggle />
        </div>

        <div className="grid lg:grid-cols-3 gap-6"> {/* Changed to 3 columns for more space */}
          {/* Control Panel */}
          <Card className="lg:col-span-1 shadow-xl dark:bg-neutral-850 rounded-lg">
            <CardContent className="space-y-5 pt-6">
              {/* File & Socket */}
              <div className="space-y-2">
                <label className="font-medium text-sm">Upload JSON (List of Characters)</label>
                <Input type="file" accept="application/json" onChange={handleFile} />
                 <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Format: `[ Char1, Char2, ... ]` where `Char = [ Stroke1, ... ]`, `Stroke = [ [x,y,r], ... ]`. Status: {hasSocket ? "Socket Connected" : "Socket Disconnected"}
                </p>
              </div>
               {/* Data Preview (optional, can be long) */}
               {/* <Textarea
                className="text-xs text-neutral-500 h-20"
                readOnly
                placeholder="Uploaded JSON data will appear here (first 256 chars)..."
                value={rawTexts.length > 0 ? JSON.stringify(rawTexts).substring(0, 256) + "..." : "No data loaded."}
              /> */}


              {/* Filter */}
              <div className="grid grid-cols-2 gap-4 items-end">
                <div>
                  <label className="font-medium mb-1 block text-sm">Low-pass Filter</label>
                  <Select value={filterEnabled ? "on" : "off"} onValueChange={(v) => setFilterEnabled(v === "on")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="on">On</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <InputFieldBare label="Window" type="number" step={1} min={1} value={filterWindow} setValue={setFilterWindow} disabled={!filterEnabled}/>
              </div>

              {/* Interpolation */}
              <div className="grid grid-cols-2 gap-4 items-end">
                <div>
                  <label className="font-medium mb-1 block text-sm">Interpolation</label>
                  <Select value={interpMethod} onValueChange={setInterpMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="linear">Linear</SelectItem>
                      <SelectItem value="catmull">Catmull‑Rom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <InputFieldBare label="Density (pts/unit)" type="number" step="0.1" min="0.1" value={density} setValue={setDensity} disabled={interpMethod === 'none'}/>
              </div>
              
              {/* Layout Parameters */}
               <details className="rounded-lg border dark:border-neutral-700 p-3 space-y-3">
                <summary className="font-medium cursor-pointer text-sm">Layout & Scale</summary>
                <PairedInputGroupField groupLabel="Layout X Range (mm)" label1="Min X" value1={xMinLayout} setValue1={setXMinLayout} label2="Max X" value2={xMaxLayout} setValue2={setXMaxLayout} />
                <div className="grid grid-cols-2 gap-4">
                    <InputFieldBare label="Layout Y Start (mm)" value={yMinLayout} setValue={setYMinLayout} type="number"/>
                    <InputFieldBare label="Scale" value={scale} setValue={setScale} step={0.01} type="number" min="0.01"/>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <InputFieldBare label="Line Spacing (mm)" value={lineSpacing} setValue={setLineSpacing} type="number" min="1"/>
                    <InputFieldBare label="Column Spacing (mm)" value={columnSpacing} setValue={setColumnSpacing} type="number" min="0"/>
                </div>
              </details>

              {/* Character Randomization */}
              <details className="rounded-lg border dark:border-neutral-700 p-3 space-y-3">
                <summary className="font-medium cursor-pointer text-sm">Character Randomization</summary>
                <PairedInputGroupField groupLabel="Random X Offset (mm)" label1="Mean" value1={randomXMean} setValue1={setRandomXMean} label2="Variance" value2={randomXVariance} setValue2={setRandomXVariance} step2={0.01}/>
                <PairedInputGroupField groupLabel="Random Y Offset (mm)" label1="Mean" value1={randomYMean} setValue1={setRandomYMean} label2="Variance" value2={randomYVariance} setValue2={setRandomYVariance} step2={0.01}/>
                <PairedInputGroupField groupLabel="Random Rotation (deg)" label1="Mean (θ)" value1={randomRotationMean} setValue1={setRandomRotationMean} label2="Variance (σ²)" value2={randomRotationVariance} setValue2={setRandomRotationVariance} step1={1} step2={0.1}/>
              </details>

              {/* Z Mapping & Pen */}
              <details className="rounded-lg border dark:border-neutral-700 p-3 space-y-3">
                 <summary className="font-medium cursor-pointer text-sm">Z-Axis & Pen Control</summary>
                <PairedInputGroupField groupLabel="ΔZ for Radius (R)" label1="Rmin=2 (Z)" value1={zMin} setValue1={setZMin} label2="Rmax=6 (Z)" value2={zMax} setValue2={setZMax} step1={0.01} step2={0.01}/>
                <PairedInputGroupField groupLabel="Pen Z Levels" label1="Pen Down (mm)" value1={penDownZ} setValue1={setPenDownZ} label2="Pen Up (mm)" value2={penUpZ} setValue2={setPenUpZ} step1={0.01} step2={0.01}/>
              </details>

              {/* G-code Blocks */}
              <details className="rounded-lg border dark:border-neutral-700 p-3 space-y-3">
                <summary className="font-medium cursor-pointer text-sm">G-Code Prefix/Suffix</summary>
                <TextareaField label="G‑Code Prefix" value={gStart} setValue={setGStart} rows={3} />
                <TextareaField label="G‑Code Suffix" value={gEnd} setValue={setGEnd} rows={2} />
                <InputFieldBare label="G00 Feed Rate" value={feedrate00} setValue={setFeedrate00} type="number" step={100} min={0} placeholder="G00 Feed Rate (mm/min)" />
                <InputFieldBare label="G01 Feed Rate" value={feedrate01} setValue={setFeedrate01} type="number" step={100} min={0} placeholder="G01 Feed Rate (mm/min)" />
              </details>

              {/* Display Mode */}
              <div>
                <label className="font-medium mb-1 block text-sm">Canvas Display Mode</label>
                <Select value={displayMode} onValueChange={setDisplayMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="processed">Processed Strokes</SelectItem>
                    <SelectItem value="gcode">G‑Code Path</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="success" disabled={!hasPreview || !gcode} onClick={handleSave}>Save G‑Code</Button>
                <Button variant="secondary" disabled={!hasPreview || !gcode} onClick={handleSend}>Send G‑Code</Button>
              </div>
            </CardContent>
          </Card>

          {/* Canvas & G-code Output */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h2 className="text-xl font-medium mb-2">Real-Time Preview</h2>
              <div ref={wrapperRef} className="border dark:border-neutral-700 rounded-xl shadow-inner bg-white dark:bg-neutral-900 overflow-hidden h-[60vh] lg:h-[calc(100vh-12rem)] relative">
                <canvas ref={canvasRef} width={1200} height={900} className="absolute top-0 left-0 w-full h-full"/>
              </div>
              <p className="text-xs text-center mt-1 text-neutral-500 dark:text-neutral-400">Scroll to zoom, drag to pan. Canvas: 1200x900.</p>
            </div>
            <div>
                <h2 className="text-xl font-medium mb-2">Generated G-Code</h2>
                <Textarea
                    readOnly
                    value={gcode}
                    placeholder="G-code will appear here..."
                    className="h-48 text-xs font-mono bg-neutral-100 dark:bg-neutral-800 border dark:border-neutral-700"
                />
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

/* ------------------ Reusable Input Field Components ------------------ */
// Bare input field for use in grids or when label is external
function InputFieldBare({ label, value, setValue, type = "number", step = 0.1, min, max, disabled = false, placeholder }) {
  return (
    <div>
      <label className="font-medium mb-1 block text-xs text-neutral-600 dark:text-neutral-300">{label}</label>
      <Input
        type={type}
        step={type === "number" ? step : undefined}
        min={type === "number" ? min : undefined}
        max={type === "number" ? max : undefined}
        value={value}
        onChange={(e) => setValue(type === "number" ? (e.target.value === '' ? (min !== undefined ? min : 0) : +e.target.value) : e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full text-sm p-2"
      />
    </div>
  );
}

function PairedInputGroupField({ groupLabel, label1, value1, setValue1, label2, value2, setValue2, step1 = 0.1, step2 = 0.1, min1, max1, min2, max2, type1="number", type2="number"}) {
    return (
      <div className="space-y-1">
        <label className="font-medium block text-sm">{groupLabel}</label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Input
            type={type1}
            placeholder={label1}
            step={type1 === "number" ? step1 : undefined}
            min={type1 === "number" ? min1 : undefined}
            max={type1 === "number" ? max1 : undefined}
            value={value1}
            onChange={(e) => setValue1(type1 === "number" ? (e.target.value === '' ? (min1 !== undefined ? min1 : 0): +e.target.value) : e.target.value)}
            className="w-full text-sm p-2"
          />
          <Input
            type={type2}
            placeholder={label2}
            step={type2 === "number" ? step2 : undefined}
            min={type2 === "number" ? min2 : undefined}
            max={type2 === "number" ? max2 : undefined}
            value={value2}
            onChange={(e) => setValue2(type2 === "number" ? (e.target.value === '' ? (min2 !== undefined ? min2 : 0) : +e.target.value) : e.target.value)}
            className="w-full text-sm p-2"
          />
        </div>
      </div>
    );
  }

function TextareaField({ label, value, setValue, rows = 3, placeholder }) {
  return (
    <div>
      <label className="font-medium mb-1 block text-sm">{label}</label>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="text-sm p-2"
      />
    </div>
  );
}