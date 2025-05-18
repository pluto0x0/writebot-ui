import React, { useRef, useEffect } from 'react';

const CanvasPad = ({ onDrawComplete }) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const strokes = useRef([]);

  const handleMouseDown = (e) => {
    isDrawing.current = true;
    const rect = canvasRef.current.getBoundingClientRect();
    lastX.current = e.clientX - rect.left;
    lastY.current = e.clientY - rect.top;
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(lastX.current, lastY.current);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    strokes.current.push({ x, y });
    lastX.current = x;
    lastY.current = y;
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    onDrawComplete(strokes.current);
    strokes.current = [];
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    isDrawing.current = true;
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    lastX.current = touch.clientX - rect.left;
    lastY.current = touch.clientY - rect.top;
  };

  const handleTouchMove = (e) => {
    if (!isDrawing.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const touch = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(lastX.current, lastY.current);
    ctx.lineTo(x, y);
    ctx.stroke();

    strokes.current.push({ x, y });
    lastX.current = x;
    lastY.current = y;
  };

  const handleTouchEnd = () => {
    isDrawing.current = false;
    onDrawComplete(strokes.current);
    strokes.current = [];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={600}
      style={{ border: '1px solid #000', touchAction: 'none' }}
    />
  );
};

export default CanvasPad;