import { useState, useRef, useCallback } from 'react';

export type AudioRecordingState = 'idle' | 'recording' | 'processing';

export interface AudioRecordingResult {
  audioBlob: Blob;
  audioBase64: string;
  mimeType: string;
  duration: number;
}

export interface UseAudioRecordingReturn {
  state: AudioRecordingState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<AudioRecordingResult | null>;
  resetToIdle: () => void;
  error: string | null;
  duration: number;
  isSupported: boolean;
  audioData: Uint8Array | null;
}

export function useAudioRecording(): UseAudioRecordingReturn {
  const [state, setState] = useState<AudioRecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Check if MediaRecorder is supported
  const isSupported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('Audio recording is not supported in this browser');
      return;
    }

    try {
      setError(null);
      setState('recording');
      
      // Request microphone access with optimized settings for speech
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Good for speech (vs 44.1kHz for music)
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true, // Helps normalize volume
        } 
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Set up audio analysis
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Create MediaRecorder with compression settings
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000 // Lower bitrate for better compression (default is ~128kbps)
      });
      
      mediaRecorderRef.current = mediaRecorder;

      // Set up event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Start audio analysis loop
      const updateAudioData = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          setAudioData(dataArray);
          animationFrameRef.current = requestAnimationFrame(updateAudioData);
        }
      };
      updateAudioData();

      // Start recording with smaller time slices for better compression
      mediaRecorder.start(250); // 250ms chunks for more granular data
      startTimeRef.current = Date.now();
      setDuration(0);
      
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current > 0) {
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 100);

    } catch (err) {
      setState('idle');
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone access denied. Please allow microphone access and try again.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please check your audio device.');
        } else {
          setError(`Failed to start recording: ${err.message}`);
        }
      } else {
        setError('Failed to start recording');
      }
    }
  }, [isSupported]);

  const stopRecording = useCallback(async (): Promise<AudioRecordingResult | null> => {
    if (!mediaRecorderRef.current || state !== 'recording') {
      return null;
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;
      
      setState('processing');
      
      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      mediaRecorder.onstop = async () => {
        try {
          // Create audio blob from chunks
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: 'audio/webm;codecs=opus' 
          });
          
          // Log recording size information
          console.log(`Audio recording completed:`, {
            size: `${audioBlob.size} bytes (${(audioBlob.size / 1024).toFixed(2)} KB)`,
            duration: `${Math.floor((Date.now() - startTimeRef.current) / 1000)}s`,
            format: 'audio/webm;codecs=opus'
          });
          
          // Convert to base64
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            const audioBase64 = base64.split(',')[1]; // Remove data:audio/webm;base64, prefix
            
            const result: AudioRecordingResult = {
              audioBlob,
              audioBase64,
              mimeType: 'audio/webm;codecs=opus',
              duration: Math.floor((Date.now() - startTimeRef.current) / 1000)
            };
            
            // Don't set state to 'idle' here - let the caller handle it
            resolve(result);
          };
          
          reader.onerror = () => {
            setError('Failed to process recorded audio');
            setState('idle');
            resolve(null);
          };
          
          reader.readAsDataURL(audioBlob);
          
        } catch (err) {
          setError('Failed to process recorded audio');
          setState('idle');
          resolve(null);
        } finally {
          // Clean up audio analysis
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          
          // Clean up audio context
          if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
          }
          
          analyserRef.current = null;
          setAudioData(null);
          
          // Clean up stream
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
        }
      };

      mediaRecorder.stop();
    });
  }, [state]);

  const resetToIdle = useCallback(() => {
    setState('idle');
  }, []);

  return {
    state,
    startRecording,
    stopRecording,
    resetToIdle,
    error,
    duration,
    isSupported,
    audioData
  };
}