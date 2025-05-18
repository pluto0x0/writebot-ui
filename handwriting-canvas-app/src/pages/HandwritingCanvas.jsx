import React, { useState, useRef } from "react";
import CanvasPad from "../components/CanvasPad";
import ThumbnailList from "../components/ThumbnailList";
import InputField from "../components/InputField";
import { resizeImage, convertToBase64 } from "../utils/imageUtils";

export default function HandwritingCanvas() {
  const [textInput, setTextInput] = useState("");
  const [thumbnails, setThumbnails] = useState([]);
  const canvasRef = useRef(null);

  const handleSubmit = async () => {
    if (thumbnails.length < 4) {
      alert("Please complete four drawings before submitting.");
      return;
    }

    const base64Images = await Promise.all(
      thumbnails.map(async (thumbnail) => {
        const resizedImage = await resizeImage(thumbnail, 128, 128);
        return convertToBase64(resizedImage);
      })
    );

    const payload = {
      text: textInput,
      images: base64Images,
    };

    try {
      const response = await fetch("YOUR_API_ENDPOINT", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      alert("Submission successful!");
    } catch (error) {
      alert("Submission failed: " + error.message);
    }
  };

  const handleDrawingComplete = (thumbnail) => {
    if (thumbnails.length < 4) {
      setThumbnails((prev) => [...prev, thumbnail]);
    } else {
      alert("You can only submit four drawings.");
    }
  };

  return (
    <div className="handwriting-canvas">
      <h1 className="text-3xl font-bold">Handwriting Canvas</h1>
      <InputField label="Enter Text" value={textInput} setValue={setTextInput} />
      <CanvasPad ref={canvasRef} onDrawingComplete={handleDrawingComplete} />
      <ThumbnailList thumbnails={thumbnails} />
      <button onClick={handleSubmit} className="submit-button">
        Submit
      </button>
    </div>
  );
}