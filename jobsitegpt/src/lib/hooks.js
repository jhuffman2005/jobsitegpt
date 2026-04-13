import { useState, useCallback, useRef, useEffect } from "react";
import { toBase64 } from "./api";
import { getProjects } from "./projects";

export function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2200);
  };
  return [msg, show];
}

export function useFiles() {
  const [files, setFiles] = useState([]);
  const [b64, setB64] = useState({});

  const add = useCallback(async (newFiles) => {
    const valid = Array.from(newFiles).filter(
      (f) =>
        f.type === "application/pdf" ||
        f.type.startsWith("image/") ||
        f.type.includes("word") ||
        f.name.endsWith(".docx") ||
        f.type === "application/json"
    );
    const map = {};
    for (const f of valid) map[f.name] = await toBase64(f);
    setB64((prev) => ({ ...prev, ...map }));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !names.has(f.name))];
    });
  }, []);

  const remove = (name) => {
    setFiles((p) => p.filter((f) => f.name !== name));
    setB64((p) => {
      const m = { ...p };
      delete m[name];
      return m;
    });
  };

  const reset = () => {
    setFiles([]);
    setB64({});
  };

  return { files, b64, add, remove, reset };
}

export function useVoiceInput(onTranscript) {
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);

  const toggle = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    if (isRecording) {
      shouldListenRef.current = false;
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    shouldListenRef.current = true;
    setIsRecording(true);

    const startListening = () => {
      if (!shouldListenRef.current) return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new SR();
      recognitionRef.current = r;
      r.continuous = false;
      r.interimResults = false;
      r.lang = "en-US";
      r.onresult = (e) => onTranscript(e.results[0][0].transcript);
      r.onend = () => {
        if (shouldListenRef.current) setTimeout(startListening, 100);
        else setIsRecording(false);
      };
      r.onerror = () => {
        if (shouldListenRef.current) setTimeout(startListening, 200);
      };
      r.start();
    };
    startListening();
  };

  return { isRecording, toggle };
}

export function useProjectSwitcher(activeProject, onProjectChange) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getProjects();
        setProjects(data);
      } catch (e) {
        console.error("Failed to load projects:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { projects, loading };
}