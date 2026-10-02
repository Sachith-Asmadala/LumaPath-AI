"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpenCheck, CheckCircle2, Clock3, LoaderCircle, MessageSquareText, Pause, Play, Plus, RefreshCcw, ShieldCheck, Sparkles, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/i18n";
import { useDemo } from "@/state/demo-provider";
import { currentInterviewQuestion, remainingSeconds, type CreateInterviewInput, type FeedbackItem, type InterviewSession } from "@/features/interviews/domain/interviews";
import { actionInterview, addInterviewTopic, createInterviewSession, deleteInterviewSession, listInterviewSessions, retryInterviewFeedback, submitInterviewAnswer } from "@/features/interviews/services/interviews";

const roles = ["DevOps Engineer", "Backend Engineer", "AI Engineer", "Cloud Engineer", "Cybersecurity Engineer"] as const;
const ACTIVE_KEY = "lumapath.interview.active.v1";

function mmss(seconds: number) { const safe=Math.max(0,seconds); return `${String(Math.floor(safe/60)).padStart(2,"0")}:${String(safe%60).padStart(2,"0")}`; }

export default function InterviewsPage() {
  const { state, addTask } = useDemo();
  const { t, locale, formatDate, formatTime } = useLocale();
  const studentId=state.student.id;
  const [sessions,setSessions]=useState<InterviewSession[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [answer,setAnswer]=useState("");
  const [now,setNow]=useState(()=>Date.now());
  const [showLauncher,setShowLauncher]=useState(false);
  const [form,setForm]=useState<CreateInterviewInput>({ role: state.student.targetRole || state.onboarding.careerGoal || "DevOps Engineer", level:"intern", round_type:"technical", question_time_seconds:180, max_followups_per_question:1, retention_days:30, recording_mode:"text", store_recordings:false, consent_acknowledged:false, locale });

  const selected=useMemo(()=>sessions.find((item)=>item.id===selectedId)??null,[sessions,selectedId]);
  const current=selected?currentInterviewQuestion(selected):null;
  const remaining=selected?remainingSeconds(selected,now):0;
  const answeredCount=selected?.responses.length??0;
  const progress=selected ? Math.min(100,Math.round((answeredCount/Math.max(selected.questions.length,1))*100)) : 0;

  const load=useCallback(async()=>{
    if(!studentId) return;
    setLoading(true); setError("");
    try{
      const items=await listInterviewSessions(studentId); setSessions(items);
      const stored=window.localStorage.getItem(ACTIVE_KEY);
      const preferred=items.find((item)=>item.id===stored)??items.find((item)=>["ready","running","paused","completed","feedback_failed"].includes(item.status))??items[0];
      setSelectedId((currentId)=>items.some((item)=>item.id===currentId)?currentId:(preferred?.id??""));
    } catch(e){setError(e instanceof Error?e.message:t("interviews.error.load"));}
    finally{setLoading(false);}
  },[studentId,t]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{setForm((value)=>({...value,locale,role:value.role||state.student.targetRole||"DevOps Engineer"}));},[locale,state.student.targetRole]);
  useEffect(()=>{ if(selectedId) window.localStorage.setItem(ACTIVE_KEY,selectedId); },[selectedId]);
  useEffect(()=>{ const timer=window.setInterval(()=>setNow(Date.now()),1000); return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{
    if(!selected || selected.status!=="running") return;
    const timer=window.setInterval(()=>{void actionInterview(studentId,selected.id,"heartbeat").then(updateSession).catch(()=>undefined);},15000);
    return()=>window.clearInterval(timer);
  },[selected?.id,selected?.status,studentId]);

  function updateSession(next:InterviewSession){ setSessions((items)=>{const exists=items.some((item)=>item.id===next.id); return exists?items.map((item)=>item.id===next.id?next:item):[next,...items];}); setSelectedId(next.id); setNow(Date.now()); }
  async function run(fn:()=>Promise<InterviewSession>, success?:string){ setBusy(true);setError("");try{const next=await fn();updateSession(next);if(success)toast.success(success);}catch(e){setError(e instanceof Error?e.message:t("interviews.error.action"));}finally{setBusy(false);} }

  async function create(){
    if(!form.consent_acknowledged){setError(t("interviews.consentRequired"));return;}
    await run(()=>createInterviewSession(studentId,{...form,locale}),t("interviews.created")); setShowLauncher(false);
  }
  async function submit(){ if(!selected||!answer.trim()) return; const text=answer.trim(); setAnswer(""); await run(()=>submitInterviewAnswer(studentId,selected.id,text),t("interviews.answerSaved")); }
  async function addTopic(item:FeedbackItem){
    if(!selected) return; setBusy(true);
    try{const result=await addInterviewTopic(studentId,selected.id,item.refs); const start=new Date(Date.now()+24*60*60*1000); start.setHours(18,0,0,0); result.topics.forEach((topic,index)=>addTask({title:`Interview review · ${topic.title}`,category:"career-learning",estimatedMinutes:30,startAt:new Date(start.getTime()+index*45*60*1000).toISOString(),description:`${topic.detail} Source: DOC-F17 interview feedback.`})); toast.success(t("interviews.topicAdded"));}
    catch(e){toast.error(e instanceof Error?e.message:t("interviews.error.topic"));}finally{setBusy(false);}
  }
  async function remove(){ if(!selected||!window.confirm(t("interviews.deleteConfirm")))return; setBusy(true);try{await deleteInterviewSession(studentId,selected.id);window.localStorage.removeItem(ACTIVE_KEY);setSelectedId("");await load();toast.success(t("interviews.deleted"));}catch(e){setError(e instanceof Error?e.message:t("interviews.error.delete"));}finally{setBusy(false);} }

  return <div className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="type-eyebrow text-primary">{t("interviews.eyebrow")}</p><TypographyH1 className="mt-2">{t("interviews.title")}</TypographyH1><TypographyP className="mt-2 max-w-3xl">{t("interviews.subtitle")}</TypographyP></div>
      <Button onClick={()=>setShowLauncher((v)=>!v)} className="rounded-xl"><Plus className="size-4"/>{t("interviews.newSession")}</Button>
    </div>

    {error&&<div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-risk/20 bg-risk/[0.045] p-4 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk"/><div className="min-w-0 flex-1"><p className="font-medium">{t("interviews.problem")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p></div><Button size="sm" variant="ghost" onClick={()=>void load()}><RefreshCcw className="size-3.5"/>{t("common.retry")}</Button></div>}

    {showLauncher&&<Card className="mt-5 rounded-[20px] p-5 sm:p-6"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 size-5 text-primary"/><div><h2 className="type-section-title">{t("interviews.launchTitle")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("interviews.launchHint")}</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div><Label htmlFor="interview-role">{t("interviews.role")}</Label><select id="interview-role" className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.role} onChange={(e)=>setForm(v=>({...v,role:e.target.value}))}>{roles.map((r)=><option key={r}>{r}</option>)}</select></div>
      <div><Label htmlFor="interview-round">{t("interviews.round")}</Label><select id="interview-round" className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.round_type} onChange={(e)=>setForm(v=>({...v,round_type:e.target.value as CreateInterviewInput["round_type"]}))}><option value="technical">{t("interviews.round.technical")}</option><option value="behavioral">{t("interviews.round.behavioral")}</option><option value="project">{t("interviews.round.project")}</option></select></div>
      <div><Label htmlFor="interview-level">{t("interviews.level")}</Label><select id="interview-level" className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.level} onChange={(e)=>setForm(v=>({...v,level:e.target.value as CreateInterviewInput["level"]}))}><option value="intern">{t("interviews.level.intern")}</option><option value="junior">{t("interviews.level.junior")}</option><option value="mid">{t("interviews.level.mid")}</option></select></div>
      <div><Label htmlFor="interview-duration">{t("interviews.timePerQuestion")}</Label><Input id="interview-duration" type="number" min={30} max={900} value={form.question_time_seconds} onChange={(e)=>setForm(v=>({...v,question_time_seconds:Number(e.target.value)||180}))} className="mt-2"/></div>
      <div><Label htmlFor="interview-followups">{t("interviews.followups")}</Label><select id="interview-followups" className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.max_followups_per_question} onChange={(e)=>setForm(v=>({...v,max_followups_per_question:Number(e.target.value)}))}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option></select></div>
      <div><Label htmlFor="interview-retention">{t("interviews.retention")}</Label><select id="interview-retention" className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.retention_days} onChange={(e)=>setForm(v=>({...v,retention_days:Number(e.target.value) as 7|30|90}))}><option value={7}>{t("interviews.days",{count:7})}</option><option value={30}>{t("interviews.days",{count:30})}</option><option value={90}>{t("interviews.days",{count:90})}</option></select></div>
      <div><Label htmlFor="interview-recording">{t("interviews.practiceMode")}</Label><select id="interview-recording" className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.recording_mode} onChange={(e)=>setForm(v=>({...v,recording_mode:e.target.value as CreateInterviewInput["recording_mode"],store_recordings:e.target.value==="text"?false:v.store_recordings}))}><option value="text">{t("interviews.mode.text")}</option><option value="audio">{t("interviews.mode.audio")}</option><option value="video">{t("interviews.mode.video")}</option></select></div>
      <div className="flex items-end"><label className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground"><Checkbox disabled={form.recording_mode==="text"} checked={form.store_recordings} onCheckedChange={(checked)=>setForm(v=>({...v,store_recordings:Boolean(checked)}))}/><span>{t("interviews.storeRecording")}</span></label></div>
    </div><div className="mt-5 rounded-xl border border-border/75 bg-muted/15 p-4"><label className="flex items-start gap-3 text-xs leading-5 text-muted-foreground"><Checkbox checked={form.consent_acknowledged} onCheckedChange={(checked)=>setForm(v=>({...v,consent_acknowledged:Boolean(checked)}))}/><span>{t("interviews.consent")}</span></label></div><div className="mt-4 flex justify-end"><Button onClick={()=>void create()} disabled={busy}>{busy&&<LoaderCircle className="size-4 animate-spin"/>}{t("interviews.create")}</Button></div></Card>}

    <div className="mt-6 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="h-fit rounded-[20px] p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-medium">{t("interviews.sessions")}</h2><Badge variant="outline">{sessions.length}</Badge></div>{loading?<div className="grid place-items-center py-12"><LoaderCircle className="size-5 animate-spin text-primary"/></div>:sessions.length===0?<div className="py-10 text-center"><MessageSquareText className="mx-auto size-6 text-muted-foreground"/><p className="mt-3 text-xs text-muted-foreground">{t("interviews.empty")}</p></div>:<div className="mt-3 space-y-2">{sessions.map((s)=><button key={s.id} onClick={()=>setSelectedId(s.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${s.id===selectedId?"border-primary/35 bg-primary/[0.05]":"border-border/70 hover:bg-muted/25"}`}><div className="flex items-center gap-2"><p className="truncate text-xs font-medium">{s.role}</p><Badge variant="outline" className="ml-auto text-[0.53rem]">{t(`interviews.status.${s.status}`)}</Badge></div><p className="mt-1 text-[0.62rem] text-muted-foreground">{t(`interviews.round.${s.round_type}`)} · {t(`interviews.level.${s.level}`)}</p><p className="mt-1 text-[0.58rem] text-muted-foreground">{formatDate(s.created_at,{dateStyle:"medium"})}</p></button>)}</div>}</Card>

      {!selected?<Card className="rounded-[20px] p-10 text-center"><MessageSquareText className="mx-auto size-8 text-muted-foreground"/><h2 className="mt-4 text-base font-medium">{t("interviews.selectTitle")}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{t("interviews.selectHint")}</p></Card>:<div className="space-y-5">
        <Card className="rounded-[20px] p-5 sm:p-6"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(`interviews.round.${selected.round_type}`)}</Badge><Badge variant="outline">{t(`interviews.level.${selected.level}`)}</Badge><Badge variant="outline">{t(`interviews.status.${selected.status}`)}</Badge></div><h2 className="mt-3 text-xl font-semibold tracking-tight">{selected.role}</h2><p className="mt-2 text-xs text-muted-foreground">{t("interviews.versions",{template:selected.template_version,rubric:selected.rubric_version})}</p></div><div className="flex flex-wrap gap-2">{selected.status==="ready"&&<Button onClick={()=>void run(()=>actionInterview(studentId,selected.id,"start"))} disabled={busy}><Play className="size-3.5"/>{t("interviews.start")}</Button>}{selected.status==="running"&&<Button variant="outline" onClick={()=>void run(()=>actionInterview(studentId,selected.id,"pause"))} disabled={busy}><Pause className="size-3.5"/>{t("interviews.pause")}</Button>}{selected.status==="paused"&&<Button onClick={()=>void run(()=>actionInterview(studentId,selected.id,"resume"))} disabled={busy}><Play className="size-3.5"/>{t("interviews.resume")}</Button>}<Button variant="ghost" className="text-risk" onClick={()=>void remove()} disabled={busy}><Trash2 className="size-3.5"/>{t("common.delete")}</Button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-4"><Info label={t("interviews.progress")} value={`${answeredCount}/${selected.questions.length}`}/><Info label={t("interviews.pauses")} value={`${selected.pause_count}/${selected.max_pause_count}`}/><Info label={t("interviews.recording")} value={t(`interviews.recordingStatus.${selected.recording_storage_status}`)}/><Info label={t("interviews.expires")} value={formatDate(selected.expires_at,{dateStyle:"medium"})}/></div><Progress value={progress} className="mt-4 h-1.5"/></Card>

        {(selected.status==="running"||selected.status==="paused")&&current&&<Card className="rounded-[20px] p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{current.is_followup?t("interviews.followupQuestion"):t("interviews.mainQuestion")}</Badge>{current.skill_names.map((skill)=><Badge key={skill} variant="outline" className="text-[0.55rem]">{skill}</Badge>)}{current.evidence_refs.map((ref)=><span key={ref} className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[0.48rem] text-muted-foreground">{ref}</span>)}</div><h3 className="mt-4 max-w-4xl text-lg font-medium leading-7">{current.prompt}</h3></div><div className={`shrink-0 rounded-2xl border px-4 py-3 text-center ${remaining===0?"border-risk/30 bg-risk/[0.05]":"border-border/80 bg-muted/20"}`}><Clock3 className="mx-auto size-4 text-muted-foreground"/><p className="mt-1 font-mono text-2xl font-semibold tabular-nums" aria-live="off">{mmss(remaining)}</p><p className="mt-0.5 text-[0.57rem] uppercase tracking-wide text-muted-foreground">{remaining===0?t("interviews.timeElapsed"):t("interviews.remaining")}</p></div></div><div className="mt-6"><Label htmlFor="interview-answer">{t("interviews.yourAnswer")}</Label><Textarea id="interview-answer" disabled={selected.status!=="running"} value={answer} onChange={(e)=>setAnswer(e.target.value)} placeholder={selected.status==="paused"?t("interviews.pausedPlaceholder"):t("interviews.answerPlaceholder")} className="mt-2 min-h-52 resize-y text-sm leading-6"/><div className="mt-3 flex flex-wrap items-center gap-3"><p className="mr-auto text-[0.65rem] text-muted-foreground">{t("interviews.answerPrivacy")}</p><Button onClick={()=>void submit()} disabled={busy||selected.status!=="running"||!answer.trim()}>{t("interviews.saveAnswer")}<ArrowRight className="size-3.5"/></Button></div></div></Card>}

        {(selected.status==="running"||selected.status==="paused")&&!current&&<Card className="rounded-[20px] border-success/20 bg-success/[0.025] p-6"><CheckCircle2 className="size-6 text-success"/><h3 className="mt-3 text-base font-medium">{t("interviews.answersComplete")}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("interviews.answersCompleteHint")}</p><Button className="mt-4" onClick={()=>void run(()=>actionInterview(studentId,selected.id,"complete"))} disabled={busy}><Square className="size-3.5"/>{t("interviews.complete")}</Button></Card>}

        {selected.status==="feedback_failed"&&<Card className="rounded-[20px] border-warning/25 bg-warning/[0.035] p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 text-warning"/><div className="flex-1"><h3 className="text-sm font-medium">{t("interviews.feedbackFailed")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{selected.feedback_error||t("interviews.feedbackFailedHint")}</p><p className="mt-2 text-[0.63rem] text-muted-foreground">{t("interviews.answersPreserved",{count:selected.responses.length})}</p></div><Button variant="outline" onClick={()=>void run(()=>retryInterviewFeedback(studentId,selected.id))} disabled={busy}><RefreshCcw className="size-3.5"/>{t("interviews.retryFeedback")}</Button></div></Card>}

        {selected.feedback&&<FeedbackView session={selected} t={t} formatDate={formatDate} formatTime={formatTime} busy={busy} onAddTopic={addTopic}/>} 

        <Card className="rounded-[20px] p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-primary"/><div><h3 className="text-sm font-medium">{t("interviews.privacyTitle")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("interviews.privacyText")}</p><p className="mt-2 text-[0.62rem] text-muted-foreground">{t("interviews.retentionText",{days:selected.retention_days})}</p></div></div></Card>
      </div>}
    </div>
  </div>;
}

function Info({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-border/70 bg-muted/15 p-3"><p className="text-[0.57rem] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 truncate text-xs font-medium">{value}</p></div>}

function FeedbackView({session,t,formatDate,formatTime,busy,onAddTopic}:{session:InterviewSession;t:(key:string,values?:Record<string,string|number>,fallback?:string)=>string;formatDate:(v:string|Date,o?:Intl.DateTimeFormatOptions)=>string;formatTime:(v:string|Date,o?:Intl.DateTimeFormatOptions)=>string;busy:boolean;onAddTopic:(item:FeedbackItem)=>Promise<void>}){
  const feedback=session.feedback!;
  const grouped={strength:feedback.items.filter((i)=>i.kind==="strength"),improvement:feedback.items.filter((i)=>i.kind==="improvement"),study_topic:feedback.items.filter((i)=>i.kind==="study_topic")};
  return <>
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><Card className="rounded-[20px] p-5"><p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t("interviews.practiceScore")}</p><div className="mt-3 flex items-end gap-2"><span className="font-mono text-4xl font-semibold">{feedback.overall_practice_score}</span><span className="pb-1 text-xs text-muted-foreground">/100</span></div><Progress value={feedback.overall_practice_score} className="mt-3 h-1.5"/><p className="mt-4 text-[0.63rem] leading-5 text-muted-foreground">{feedback.disclaimer}</p><p className="mt-3 text-[0.6rem] text-muted-foreground">{formatDate(feedback.generated_at,{dateStyle:"medium"})} · {formatTime(feedback.generated_at,{timeStyle:"short"})}</p></Card><Card className="rounded-[20px] p-5"><h3 className="text-sm font-medium">{t("interviews.rubricTitle")}</h3><div className="mt-4 grid gap-2 sm:grid-cols-2">{["relevance","structure","technical_content","communication"].map((criterion)=>{const rows=feedback.rubric_results.filter((r)=>r.criterion===criterion);const avg=rows.length?rows.reduce((sum,r)=>sum+r.score,0)/rows.length:0;return <div key={criterion} className="rounded-xl border border-border/70 p-3"><div className="flex items-center justify-between"><p className="text-xs font-medium">{t(`interviews.criterion.${criterion}`)}</p><span className="font-mono text-xs">{avg.toFixed(1)}/5</span></div><Progress value={avg*20} className="mt-2 h-1"/><p className="mt-2 text-[0.6rem] leading-5 text-muted-foreground">{rows[0]?.rationale}</p></div>})}</div></Card></div>
    <Card className="rounded-[20px] p-5 sm:p-6"><h3 className="text-sm font-medium">{t("interviews.answerStructure")}</h3><ol className="mt-4 grid gap-2 sm:grid-cols-2">{feedback.illustrative_answer_structure.map((step,index)=><li key={step} className="flex gap-3 rounded-xl border border-border/70 p-3 text-xs"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-[0.6rem] text-primary">{index+1}</span><span className="leading-5">{step}</span></li>)}</ol></Card>
    <div className="grid gap-5 xl:grid-cols-3">{(["strength","improvement","study_topic"] as const).map((kind)=><Card key={kind} className="rounded-[20px] p-5"><h3 className="text-sm font-medium">{t(`interviews.feedback.${kind}`)}</h3><div className="mt-4 space-y-3">{grouped[kind].length?grouped[kind].map((item,index)=><div key={`${kind}-${index}`} className="rounded-xl border border-border/70 bg-muted/10 p-3"><p className="text-xs font-medium">{item.title}</p><p className="mt-1.5 text-[0.63rem] leading-5 text-muted-foreground">{item.detail}</p><div className="mt-2 flex flex-wrap gap-1">{item.refs.map((ref)=><span key={ref} className="rounded border border-border/70 px-1.5 py-0.5 font-mono text-[0.5rem] text-muted-foreground">{ref}</span>)}</div>{(kind==="study_topic"||kind==="improvement")&&<Button size="sm" variant="outline" className="mt-3" disabled={busy} onClick={()=>void onAddTopic(item)}><BookOpenCheck className="size-3.5"/>{t("interviews.addToRoadmap")}</Button>}</div>):<p className="text-xs text-muted-foreground">{t("interviews.none")}</p>}</div></Card>)}</div>
    <Card className="rounded-[20px] border-primary/15 bg-primary/[0.025] p-5"><p className="text-xs leading-5 text-muted-foreground">{feedback.uncertainty_note}</p><Button asChild variant="ghost" size="sm" className="mt-2"><Link href="/career-path">{t("interviews.openCareerPath")}<ArrowRight className="size-3.5"/></Link></Button></Card>
  </>;
}
