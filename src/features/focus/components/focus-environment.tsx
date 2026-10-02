"use client";

import { useEffect, useState } from "react";
import { Moon, Mountain, Pause, Play, Waves } from "lucide-react";

const scenes = [{ id: "aurora", label: "Aurora", icon: Moon }, { id: "ocean", label: "Ocean", icon: Waves }, { id: "dawn", label: "Dawn", icon: Mountain }];

export function FocusEnvironment({ children }: { children: React.ReactNode }) {
  const [scene, setScene] = useState("aurora");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lumapath-focus-scene");
      if (scenes.some((item) => item.id === saved)) setScene(saved!);
      setPaused(localStorage.getItem("lumapath-focus-motion") === "paused");
    } catch { /* Keep the default scene when storage is unavailable. */ }
  }, []);
  function chooseScene(value: string) { setScene(value); try { localStorage.setItem("lumapath-focus-scene", value); } catch {} }
  function toggleMotion() { setPaused(!paused); try { localStorage.setItem("lumapath-focus-motion", paused ? "playing" : "paused"); } catch {} }
  return <div className="focus-environment" data-scene={scene} data-paused={paused || Boolean(reduced)}>
    <div className="focus-landscape" aria-hidden="true"><div className="focus-glow focus-glow-one" /><div className="focus-glow focus-glow-two" /><div className="focus-glow focus-glow-three" /><div className="focus-sun" /><div className="focus-stars" />
      <svg className="focus-mountains" viewBox="0 0 1440 500" preserveAspectRatio="none"><path d="M0 300 Q160 180 320 290 T650 250 T990 220 T1440 260 V500 H0Z" /><path d="M0 370 Q220 220 460 360 T900 310 T1440 350 V500 H0Z" /><path d="M0 440 Q300 330 600 410 T1100 380 T1440 400 V500 H0Z" /></svg>
    </div>
    <div className="focus-scene-controls"><span className="focus-scene-label">SET THE MOOD</span><div role="group" aria-label="Focus background">{scenes.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => chooseScene(id)} aria-pressed={scene === id}><Icon size={14} /><span>{label}</span></button>)}</div><button className="focus-motion-toggle" disabled={Boolean(reduced)} onClick={toggleMotion} aria-label={reduced ? "Motion off: reduced motion preference" : paused ? "Resume background animation" : "Pause background animation"} title={reduced ? "Following your reduced motion preference" : paused ? "Resume animation" : "Pause animation"}>{paused || reduced ? <Play size={14} /> : <Pause size={14} />}</button></div>
    <div className="focus-environment-content">{children}</div>
  </div>;
}
