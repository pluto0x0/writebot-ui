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

export default function PhotoInput() {
  // socket.io 相关
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(`http://${hostname}:3000`, {
      // Ensure protocol is included
      transports: ["websocket"],
      path: "/socket.io",
    });
    socketRef.current = socket;
    setConnected(socket.connected);
    function handleConnect() {
      setConnected(true);
    }
    function handleDisconnect() {
      setConnected(false);
    }
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.disconnect();
    };
  }, []);

  // Image & Cropping state
  const [uploadedImage, setUploadedImage] = useState(null); // Data URL of the uploaded image
  const [imageElement, setImageElement] = useState(null); // HTMLImageElement for drawing and cropping
  const [cropStage, setCropStage] = useState(0); // 0: awaiting upload, 1-4: cropping char i, 5: all cropped
  const [currentCrop, setCurrentCrop] = useState(null); // {startX, startY, endX, endY} for current drawing rect
  const [isCroppingActive, setIsCroppingActive] = useState(false); // User is actively drawing a rectangle
  const [definedCrops, setDefinedCrops] = useState([]); // Array of {rect: {x,y,w,h}, char: '字'}

  // Refs
  const imageCanvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // 已采集样本 (from cropped images)
  const [samples, setSamples] = useState([]); // Array of {char, image (base64)}
  const [showCharPrompt, setShowCharPrompt] = useState(false);
  const [charInput, setCharInput] = useState("");
  const [isComposing, setIsComposing] = useState(false); // 新增状态

  // API & 文本
  const [apiUrl, setApiUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const apiFromUrl = params.get("api");
    if (apiFromUrl) {
      return apiFromUrl;
    }
    return localStorage.getItem("apiUrl") || "";
  });
  const [customText, setCustomText] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);

  // Initialize image canvas (placeholder)
  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas) return;
    if (!imageElement) {
      // If no image is loaded, show placeholder
      canvas.width = 500;
      canvas.height = 200; // Adjusted placeholder height
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#f0f0f0";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#888";
        context.font = "16px Arial";
        context.textAlign = "center";
        context.fillText(
          "Upload an image with 4 characters to begin.",
          canvas.width / 2,
          canvas.height / 2
        );
      }
    }
  }, [imageElement]); // Rerun when imageElement changes

  // Save apiUrl to localStorage
  useEffect(() => {
    localStorage.setItem("apiUrl", apiUrl);
  }, [apiUrl]);

  // Redraw canvas when image, crops, or current drawing changes
  useEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas || !imageElement) return; // Only draw if there's an image

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and draw the scaled image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

    // Draw defined crop boxes and their labels
    definedCrops.forEach((crop) => {
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        crop.rect.x,
        crop.rect.y,
        crop.rect.width,
        crop.rect.height
      );
      if (crop.char) {
        const textX = crop.rect.x + 5;
        const textY = crop.rect.y + 15;
        const textMetrics = ctx.measureText(crop.char);
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.fillRect(textX - 3, textY - 14, textMetrics.width + 6, 18);
        ctx.fillStyle = "blue";
        ctx.font = "16px Arial";
        ctx.fillText(crop.char, textX, textY);
      }
    });

    // Draw current cropping rectangle if user is drawing
    if (isCroppingActive && currentCrop) {
      ctx.strokeStyle = "red";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        currentCrop.startX,
        currentCrop.startY,
        currentCrop.endX - currentCrop.startX,
        currentCrop.endY - currentCrop.startY
      );
    }
  }, [imageElement, definedCrops, currentCrop, isCroppingActive]);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setImageElement(img);
          setUploadedImage(e.target.result); // Save data URL
          setCropStage(1); // Start cropping for the first character

          const canvas = imageCanvasRef.current;
          const MAX_WIDTH = 500; // Max display width for canvas
          let { naturalWidth, naturalHeight } = img;
          let displayWidth = naturalWidth;
          let displayHeight = naturalHeight;

          if (displayWidth > MAX_WIDTH) {
            displayHeight = (MAX_WIDTH / displayWidth) * displayHeight;
            displayWidth = MAX_WIDTH;
          }
          // Could also add MAX_HEIGHT constraint if needed

          canvas.width = displayWidth;
          canvas.height = displayHeight;
          // Redraw will be handled by the useEffect hook for [imageElement]

          // Reset previous state
          setDefinedCrops([]);
          setSamples([]);
          setCurrentCrop(null);
          setIsCroppingActive(false);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePointerDown = (e) => {
    if (!imageElement || cropStage === 0 || cropStage > 4 || showCharPrompt)
      return;

    const canvas = imageCanvasRef.current; // Get the canvas element
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect(); // Dimensions and position of the CSS-styled canvas element

    // Calculate scaling factors
    // scale = canvas_internal_resolution / canvas_displayed_size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Get pointer position relative to the viewport
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Calculate pointer position relative to the canvas element (displayed)
    // And then scale it to the canvas's internal coordinate system
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    setCurrentCrop({ startX: x, startY: y, endX: x, endY: y });
    setIsCroppingActive(true);
  };

  const handlePointerMove = (e) => {
    if (!isCroppingActive || !currentCrop) return;

    const canvas = imageCanvasRef.current; // Get the canvas element
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // Calculate scaling factors
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Get pointer position relative to the viewport
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Calculate pointer position relative to the canvas element (displayed)
    // And then scale it to the canvas's internal coordinate system
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    setCurrentCrop((prev) => ({ ...prev, endX: x, endY: y }));
    // Redraw is handled by useEffect
  };

  const handlePointerUp = () => {
    // No event argument needed here as currentCrop is already scaled
    if (!isCroppingActive || !currentCrop) return;
    setIsCroppingActive(false);

    // The currentCrop values are already scaled, so normRect is also scaled correctly
    const normRect = {
      x: Math.min(currentCrop.startX, currentCrop.endX),
      y: Math.min(currentCrop.startY, currentCrop.endY),
      width: Math.abs(currentCrop.startX - currentCrop.endX),
      height: Math.abs(currentCrop.startY - currentCrop.endY),
    };

    if (normRect.width > 5 && normRect.height > 5) {
      // Minimum crop size
      setShowCharPrompt(true);
    } else {
      setCurrentCrop(null); // Discard tiny/invalid crop
    }
    // Redraw is handled by useEffect
  };

  // New function to crop from the original image and resize to 128x128
  function cropAndResizeImage(sourceImageElement, canvasCropRect) {
    if (!sourceImageElement || !canvasCropRect) return null;

    const canvas = imageCanvasRef.current; // The display canvas
    if (!canvas) return null;

    // Scale factors from display canvas to original image dimensions
    const scaleX = sourceImageElement.naturalWidth / canvas.width;
    const scaleY = sourceImageElement.naturalHeight / canvas.height;

    const actualCropRect = {
      x: canvasCropRect.x * scaleX,
      y: canvasCropRect.y * scaleY,
      width: canvasCropRect.width * scaleX,
      height: canvasCropRect.height * scaleY,
    };

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 128;
    offscreenCanvas.height = 128;
    const ctx = offscreenCanvas.getContext("2d");

    ctx.fillStyle = "#fff"; // White background for the 128x128 image
    ctx.fillRect(0, 0, 128, 128);

    ctx.drawImage(
      sourceImageElement,
      actualCropRect.x,
      actualCropRect.y,
      actualCropRect.width,
      actualCropRect.height,
      0,
      0,
      128,
      128
    );
    return offscreenCanvas.toDataURL("image/png");
  }

  const handleSaveChar = () => {
    if (!charInput.trim() || !currentCrop || cropStage > 4) return;

    // Finalize rectangle from currentCrop (which was set on pointer up)
    const finalRect = {
      x: Math.min(currentCrop.startX, currentCrop.endX),
      y: Math.min(currentCrop.startY, currentCrop.endY),
      width: Math.abs(currentCrop.startX - currentCrop.endX),
      height: Math.abs(currentCrop.startY - currentCrop.endY),
    };

    if (finalRect.width <= 5 || finalRect.height <= 5) {
      // Check again
      setShowCharPrompt(false);
      setCharInput("");
      setCurrentCrop(null);
      return;
    }

    const croppedImageB64 = cropAndResizeImage(imageElement, finalRect);

    if (croppedImageB64) {
      const newSample = { char: charInput.trim(), image: croppedImageB64 };
      setSamples((s) => [...s, newSample]);
      setDefinedCrops((prev) => [
        ...prev,
        { rect: finalRect, char: charInput.trim() },
      ]);
    }

    setCharInput("");
    setShowCharPrompt(false);
    setCurrentCrop(null); // Reset current crop drawing

    if (cropStage < 4) {
      setCropStage((prev) => prev + 1);
    } else {
      setCropStage(5); // All 4 characters cropped
    }
    // Canvas redraw is handled by useEffect
  };

  const handleClearAll = () => {
    setUploadedImage(null);
    setImageElement(null);
    setCropStage(0);
    setCurrentCrop(null);
    setIsCroppingActive(false);
    setDefinedCrops([]);
    setSamples([]);
    setCharInput("");
    setShowCharPrompt(false);
    setCustomText(""); // Also clear custom text
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset file input UI
    }
    // Placeholder will be redrawn by useEffect for imageCanvasRef
  };

  const allDone = samples.length >= 4;
  const isApiSectionDisabled = sending || !allDone;
  const canUserCrop =
    imageElement &&
    cropStage > 0 &&
    cropStage <= 4 &&
    !showCharPrompt &&
    !sending;

  const handleSubmitAll = async () => {
    if (!allDone || !apiUrl.trim() || !customText.trim() || sending) return;
    setSending(true);
    setProgress(20);

    const payload = {
      images: Object.fromEntries(samples.map((s) => [s.char, s.image])),
      text: customText,
    };

    try {
      setProgress(40);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`API request failed with status ${res.status}`);
      }
      setProgress(70);
      const result = await res.json();
      console.log("Read from API:", result);
      setProgress(90);

      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("submitData", result);
      }
      setProgress(100);

      // Reset after successful submission
      handleClearAll();
    } catch (err) {
      console.error("Error during submission:", err);
      // Handle error display to user if necessary
      setProgress(0); // Reset progress on error
    } finally {
      setSending(false);
      // Don't reset progress to 0 immediately if successful, let 100 show briefly
      if (progress === 100) {
        setTimeout(() => setProgress(0), 1000);
      }
    }
  };

  let instructionText = "Upload an image to begin.";
  if (imageElement) {
    if (cropStage > 0 && cropStage <= 4) {
      instructionText = `Cropping character ${cropStage}/4. Please draw a box around the character.`;
      if (showCharPrompt) {
        instructionText = `Label the selected area for character ${cropStage}.`;
      }
    } else if (cropStage === 5 || allDone) {
      instructionText =
        "All 4 characters defined. You can now enter API details and submit.";
    }
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-emerald-50 dark:from-neutral-900 dark:to-neutral-800 p-6 text-neutral-900 dark:text-neutral-100 overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Photo Character Input</h1>
          <div className="flex items-center space-x-4">
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
              {connected ? "Socket Connected" : "Socket Disconnected"}
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:space-x-8">
          {/* Left Panel: Image Upload and Cropping */}
          <div className="flex flex-col space-y-6 md:flex-1 md:max-w-[550px]">
            <Card>
              <CardContent className="p-4 space-y-3">
                {!imageElement && (
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    Upload Image
                  </Button>
                )}
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={sending}
                />

                {/* Canvas for image display and cropping */}
                <canvas
                  ref={imageCanvasRef}
                  className={`border rounded-md touch-none ${
                    !imageElement
                      ? "bg-gray-200 dark:bg-gray-700"
                      : "cursor-crosshair"
                  } w-full`}
                  // width & height are set dynamically
                  onPointerDown={canUserCrop ? handlePointerDown : undefined}
                  onPointerMove={
                    isCroppingActive ? handlePointerMove : undefined
                  }
                  onPointerUp={isCroppingActive ? handlePointerUp : undefined}
                  onPointerLeave={
                    isCroppingActive ? handlePointerUp : undefined
                  } // Finalize if pointer leaves
                />

                {imageElement && (
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-sm text-muted-foreground">
                      {instructionText}
                    </p>
                    <Button
                      onClick={handleClearAll}
                      variant="outline"
                      size="sm"
                      disabled={sending}
                    >
                      Clear & Restart
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Character Annotation Popup (Modal-like) */}
            {showCharPrompt && (
              <Card className="fixed inset-0 m-auto w-fit h-fit max-w-sm p-6 bg-background border shadow-lg rounded-lg z-50">
                <CardContent className="space-y-4">
                  <Label htmlFor="char-input-popup">
                    Enter the character for the selected area ({cropStage}/4)
                  </Label>
                  <Input
                    id="char-input-popup"
                    value={charInput}
                    onChange={(e) => {
                      const { value } = e.target;
                      if (isComposing) {
                        // 在组字过程中，允许输入法自由更新输入框内容
                        setCharInput(value);
                      } else {
                        // 非组字过程，或组字已结束，则截取第一个字符
                        setCharInput(value.slice(0, 1));
                      }
                    }}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={(e) => {
                      setIsComposing(false);
                      // 组字结束后，确保输入框内容被截断为单个字符
                      // event.data 通常是最终输入的字符，但 e.target.value 更可靠一些
                      setCharInput(e.target.value.slice(0, 1));
                    }}
                    // maxLength={1} // 建议移除此属性，由JS逻辑控制
                    autoFocus
                    onKeyDown={(e) => {
                      // 防止在组字过程中按 Enter 键触发保存
                      if (
                        e.key === "Enter" &&
                        !isComposing &&
                        charInput.trim()
                      ) {
                        handleSaveChar();
                      }
                    }}
                  />
                  <div className="flex justify-end space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCharPrompt(false);
                        setCharInput("");
                        setCurrentCrop(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveChar}
                      disabled={!charInput.trim()}
                    >
                      Save Character
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {showCharPrompt && (
              <div
                className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
                onClick={() => {
                  setShowCharPrompt(false);
                  setCharInput("");
                  setCurrentCrop(null);
                }}
              />
            )}

            {/* API & Text Input (appears when all 4 chars are collected) */}
            {allDone && (
              <Card className="w-full space-y-3">
                <CardContent className="p-4 space-y-4">
                  <div>
                    <Label htmlFor="api-url">API Address</Label>
                    <Input
                      id="api-url"
                      placeholder="https://your.api/endpoint"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      disabled={isApiSectionDisabled || sending}
                    />
                  </div>
                  <div>
                    <Label htmlFor="custom-text">
                      Custom Text for Analysis
                    </Label>
                    <Textarea
                      id="custom-text"
                      placeholder="Enter the text related to the characters"
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      disabled={isApiSectionDisabled || sending}
                    />
                  </div>
                  {sending && (
                    <Progress value={progress} max={100} className="w-full" />
                  )}
                  <div className="flex justify-end">
                    <Button
                      variant="default" // Assuming 'primary' was a custom variant, using 'default'
                      onClick={handleSubmitAll}
                      disabled={
                        isApiSectionDisabled ||
                        sending ||
                        !customText.trim() ||
                        !apiUrl.trim()
                      }
                    >
                      {sending ? "Submitting..." : "Submit All & Generate"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Panel: Thumbnails of Cropped Characters */}
          <div className="md:flex-1 mt-8 md:mt-0 space-y-4">
            <h2 className="text-xl font-medium">
              Collected Characters ({samples.length}/4)
            </h2>
            {samples.length === 0 && !imageElement && (
              <p className="text-muted-foreground">
                Upload an image and crop characters. They will appear here.
              </p>
            )}
            {samples.length === 0 && imageElement && cropStage < 5 && (
              <p className="text-muted-foreground">
                Begin cropping characters from the uploaded image.
              </p>
            )}
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {samples.map((s, i) => (
                <li
                  key={i}
                  className="flex flex-col items-center space-y-1 p-2 border rounded-md bg-card"
                >
                  <div className="w-24 h-24 border flex items-center justify-center overflow-hidden">
                    <img
                      src={s.image}
                      alt={`Character: ${s.char}`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-2xl font-mono">{s.char}</span>
                </li>
              ))}
            </ul>
            {samples.length > 0 && samples.length < 4 && (
              <p className="text-sm text-muted-foreground">
                {" "}
                {4 - samples.length} more character(s) needed.
              </p>
            )}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
