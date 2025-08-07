import React, { useRef, useEffect, useCallback } from 'react';

interface WaveformVisualizerProps {
  audioData: Uint8Array | null;
  isRecording: boolean;
  isPaused: boolean;
}

export function WaveformVisualizer({ 
  audioData, 
  isRecording, 
  isPaused
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const barsDataRef = useRef<number[]>([]);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Animation settings
  const barWidth = 1;
  const barSpacing = 2;
  const frameRate = 15; // Much slower frame rate for bar movement
  const frameInterval = 1000 / frameRate;

  const getBarColor = useCallback(() => {
    if (typeof window !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark');
      return isDark ? '#ececec' : '#0d0d0d';
    }
    return '#000000';
  }, []);

  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get container dimensions
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = 24; // Match textarea min-height

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Enable antialiasing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    contextRef.current = ctx;
    
    // Calculate max bars based on actual width
    const maxBars = Math.floor(width / (barWidth + barSpacing));
    barsDataRef.current = new Array(maxBars).fill(0.08); // Very short bars at initialization
  }, [barWidth, barSpacing]);

  const drawWaveform = useCallback(() => {
    const ctx = contextRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerY = canvas.height / 2;
    const maxBarHeight = centerY * 0.8; // Leave some padding
    const barColor = getBarColor();

    ctx.fillStyle = barColor;

    // Draw bars
    barsDataRef.current.forEach((amplitude, index) => {
      const x = index * (barWidth + barSpacing);
      const barHeight = amplitude * maxBarHeight;
      
      // Draw mirrored bars (above and below centerline)
      if (barHeight > 0) {
        // Bar above centerline
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
        // Bar below centerline (mirrored)
        ctx.fillRect(x, centerY, barWidth, barHeight);
      }
    });
  }, [barWidth, barSpacing, getBarColor]);

  const updateBars = useCallback((currentTime: number) => {
    if (!audioData || isPaused) return false;

    // Check if enough time has passed for next frame
    if (currentTime - lastUpdateTimeRef.current < frameInterval) {
      return false;
    }

    lastUpdateTimeRef.current = currentTime;

    // Process audio data to get a single amplitude value
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i];
    }
    const averageAmplitude = sum / audioData.length;
    
    // Normalize to 0-1 range and apply more aggressive boosting for taller bars
    let normalizedAmplitude = (averageAmplitude / 255) * 3.0; // Much higher boost for sensitivity
    normalizedAmplitude = Math.min(normalizedAmplitude, 1); // Cap at 1
    
    // Add some randomness for natural feel (optional)
    normalizedAmplitude *= (0.7 + Math.random() * 0.6);

    // Ensure minimum base height of 0.08
    const baseHeight = 0.08;
    normalizedAmplitude = Math.max(normalizedAmplitude, baseHeight);

    // Shift existing bars left and add new bar on right
    barsDataRef.current.shift();
    barsDataRef.current.push(normalizedAmplitude);
    return true;
  }, [audioData, isPaused, frameInterval]);

  const animate = useCallback((currentTime: number) => {
    if (!isRecording) return;

    const shouldUpdate = updateBars(currentTime);
    if (shouldUpdate) {
      drawWaveform();
    }

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isRecording, updateBars, drawWaveform]);

  // Initialize canvas
  useEffect(() => {
    initializeCanvas();
  }, [initializeCanvas]);

  // Draw initial state with short bars
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  // Start/stop animation
  useEffect(() => {
    if (isRecording) {
      const startAnimation = (currentTime: number) => animate(currentTime);
      animationFrameRef.current = requestAnimationFrame(startAnimation);
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording, animate]);

  // Handle pause state
  useEffect(() => {
    if (isPaused) {
      // Stop updating bars but keep drawing the current state
      drawWaveform();
    }
  }, [isPaused, drawWaveform]);

  // Redraw when theme changes
  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  return (
    <div 
      ref={containerRef} 
      className="w-full bg-transparent flex items-center justify-start"
      aria-label="Audio waveform visualization"
    >
      <canvas
        ref={canvasRef}
        className="bg-transparent w-full"
        aria-hidden="true"
      />
    </div>
  );
}