"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useDemo } from "@/state/demo-provider";
import { evaluateAchievements } from "@/features/achievements/services/achievements";
import { canCelebrate } from "@/features/achievements/domain/achievements";
import { useLocale } from "@/i18n/locale-provider";

export function AchievementProvider({children}:{children:ReactNode}){
  const {state}=useDemo(); const pathname=usePathname(); const {t}=useLocale(); const busy=useRef(false);
  useEffect(()=>{
    if(!state.student.id) return;
    let cancelled=false;
    const run=async()=>{
      if(busy.current||cancelled) return; busy.current=true;
      try{
        const result=await evaluateAchievements(state.student.id);
        if(!cancelled&&canCelebrate(result)){
          for(const award of result.new_awards.slice(0,2)) toast.success(t("achievements.celebrationTitle"),{description:t(`achievements.definition.${award.definition_key}.title`,undefined,award.title),duration:4500});
        }
      }catch{ /* Achievements are optional; core work stays unaffected. */ }
      finally{busy.current=false;}
    };
    const timer=window.setTimeout(()=>void run(),650);
    const interval=window.setInterval(()=>void run(),20_000);
    return()=>{cancelled=true;window.clearTimeout(timer);window.clearInterval(interval);};
  },[pathname,state.student.id,state.tasks,state.planBlocks,t]);
  return children;
}
