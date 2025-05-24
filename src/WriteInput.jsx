import { useRef, useState, useEffect } from "react";
import { io } from "socket.io-client";
import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

const { hostname } = window.location;

export default function WriteInput() {
  // socket.io 相关
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(`http://${hostname}:3000`, {
      transports: ["websocket"],
      path: "/socket.io",
    });
    socketRef.current = socket;
    // 初始状态
    setConnected(socket.connected);
    // 事件监听
    function handleConnect() {
      setConnected(true);
    }
    function handleDisconnect() {
      setConnected(false);
    }
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    // 卸载清理
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.disconnect();
    };
  }, []);

  // 画布 refs & ctx
  const canvasRef = useRef(null);
  const [ctx, setCtx] = useState(null);

  // 书写状态
  const [drawing, setDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState([]);

  // 已采集样本
  const [samples, setSamples] = useState([]);
  const [showCharPrompt, setShowCharPrompt] = useState(false);
  const [charInput, setCharInput] = useState("");

  // API & 文本
  const [apiUrl, setApiUrl] = useState(
    () => localStorage.getItem("apiUrl") || ""
  );
  const [customText, setCustomText] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

  // 禁用 API 区域时机
  const isBusy = drawing || sending;

  // 初始化 canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 500;
    canvas.height = 500;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#000";
    setCtx(context);
  }, []);

  // 保存 apiUrl 至 localStorage
  useEffect(() => {
    localStorage.setItem("apiUrl", apiUrl);
  }, [apiUrl]);

  // pointer 事件
  const handlePointerDown = (e) => {
    if (!ctx) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = Math.max(1, e.pressure * 10);
    ctx.beginPath();
    ctx.lineWidth = w;
    ctx.moveTo(x, y);
    setCurrentStroke([{ x, y, w }]);
    setDrawing(true);
  };

  const handlePointerMove = (e) => {
    if (!drawing || !ctx) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = Math.max(1, e.pressure * 10);
    ctx.lineWidth = w;
    ctx.lineTo(x, y);
    ctx.stroke();
    setCurrentStroke((s) => [...s, { x, y, w }]);
  };

  const handlePointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    if (ctx) ctx.closePath();
    // setShowCharPrompt(true);
  };

  // 自动裁剪黑色笔迹区域
  function cropToInk() {
    const orig = canvasRef.current;
    const w = orig.width,
      h = orig.height;
    const imgData = ctx.getImageData(0, 0, w, h).data;
    let minX = w,
      maxX = 0,
      minY = h,
      maxY = 0,
      found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = imgData[idx],
          g = imgData[idx + 1],
          b = imgData[idx + 2];
        if (!(r === 255 && g === 255 && b === 255)) {
          found = true;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (!found) {
      minX = 0;
      minY = 0;
      maxX = w;
      maxY = h;
    }
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const window = Math.max(cw, ch);
    minX = Math.max(0, minX - (window - cw) / 2);
    minY = Math.max(0, minY - (window - ch) / 2);
    const off = document.createElement("canvas");
    off.width = 128;
    off.height = 128;
    const octx = off.getContext("2d");
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, 128, 128);
    octx.drawImage(orig, minX, minY, window, window, 0, 0, 128, 128);
    return off;
  }

  // 保存当前字样本
  const handleSaveChar = () => {
    if (!charInput.trim()) return;
    const off = cropToInk();
    const img = off.toDataURL("image/png");
    setSamples((s) => [...s, { char: charInput.trim(), image: img }]);
    setCharInput("");
    setShowCharPrompt(false);
    if (ctx && canvasRef.current) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.fillStyle = "#000";
    }
    setCurrentStroke([]);
  };

  const allDone = samples.length >= 4;

  // 用户“完成”后才提交
  const handleSubmitAll = async () => {
    if (!allDone || !apiUrl.trim() || !customText.trim()) return;
    setSending(true);
    setProgress(20);

    const payload = {
      images: Object.fromEntries(samples.map((s) => [s.char, s.image])),
      text: customText,
    };

    try {
      setProgress(40);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      setProgress(70);
      const result = await res.json();
      console.log("Read from API:", result);
      setProgress(90);

      // 使用 socketRef.current.emit
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("submitData", result);
      }
      setProgress(100);

      setSamples([]);
      if (ctx && canvasRef.current) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.fillStyle = "#000";
      }
      setCustomText("");
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-neutral-900 dark:to-neutral-800 p-6 text-neutral-900 dark:text-neutral-100 overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold">手写输入采集</h1>
          <ModeToggle />
          <span
            className={`ml-4 flex items-center text-sm ${
              connected ? "text-green-500" : "text-red-500"
            }`}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full mr-2 ${
                connected ? "bg-green-500" : "bg-red-500"
              }`}
            ></span>
            {connected ? "已连接" : "未连接"}
          </span>
        </div>
        <div className="flex space-x-8">
          {/* 左边：纵向堆叠 */}
          <div className="flex flex-col space-y-8 flex-1 max-w-[550px]">
            {/* 写字区域 */}
            <Card className="flex-shrink-0">
              <CardContent className="p-4">
                <canvas
                  ref={canvasRef}
                  className="border w-[500px] h-[500px] touch-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
                <Button
                  className="mt-4"
                  variant="secondary"
                  disabled={drawing || showCharPrompt}
                  onClick={() => setShowCharPrompt(true)}
                >
                  完成此字
                </Button>
              </CardContent>
            </Card>

            {/* 字符标注弹窗 */}
            {showCharPrompt && (
              <Card className="max-w-sm mx-auto mt-6">
                <CardContent className="space-y-3">
                  <Label>请输入该字对应的字符</Label>
                  <Input
                    value={charInput}
                    onChange={(e) => setCharInput(e.target.value)}
                    maxLength={1}
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleSaveChar}>保存</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* API & 文本 */}
            {allDone && (
              <Card className="w-full mx-auto mt-6 space-y-3">
                <CardContent className="space-y-4">
                  <div>
                    <Label>API 地址</Label>
                    <Input
                      placeholder="https://your.api/endpoint"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      disabled={isBusy}
                    />
                  </div>
                  <div>
                    <Label>自定义文本</Label>
                    <Textarea
                      placeholder="请输入要分析的文本"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      disabled={isBusy}
                    />
                  </div>
                  {sending && <Progress value={progress} max={100} />}
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      onClick={handleSubmitAll}
                      disabled={isBusy}
                    >
                      提交并生成
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 右边：缩略图列表 */}
          <div className="flex-1 overflow-auto space-y-4">
            <h2 className="text-xl font-medium">已采集 ({samples.length}/4)</h2>
            <ul className="grid grid-cols-2 gap-4">
              {samples.map((s, i) => (
                <li key={i} className="flex items-center space-x-2">
                  <div className="w-16 h-16 border">
                    <img src={s.image} alt={s.char} className="w-full h-full" />
                  </div>
                  <span className="text-lg">{s.char}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
