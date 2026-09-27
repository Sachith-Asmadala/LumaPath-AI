"use client";

import { scenarioDate, scenarioWeekLabel } from "@/lib/demo-data/scenario";

import { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import type { EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDemo } from "@/lib/state/demo-provider";
import { toLocalIso } from "@/lib/domain/planner";
import type { PlanBlock } from "@/lib/demo-data/types";

const categoryClass: Record<PlanBlock["category"], string> = {
  Academic: "planner-event-academic",
  Career: "planner-event-career",
  Personal: "planner-event-personal",
  Internship: "planner-event-internship",
  "AI Recommended": "planner-event-recommended",
};

export function PlannerCalendar({ onEditTask }: { onEditTask: (block: PlanBlock) => void }) {
  const reduced = useReducedMotion();
  const { state, updatePlanBlock, addUrgentDeadline } = useDemo();
  const calendarRef = useRef<FullCalendar>(null);
  const [view, setView] = useState("timeGridWeek");
  const [mobile, setMobile] = useState(false);
  const [viewLabel, setViewLabel] = useState(scenarioWeekLabel());
  const [selectedBlock, setSelectedBlock] = useState<PlanBlock | null>(null);
  const [addingUrgent, setAddingUrgent] = useState(false);
  const events = useMemo<EventInput[]>(() => state.planBlocks.map((block) => ({
    id: block.id,
    groupId: block.taskId ?? block.id,
    title: block.title,
    start: block.startAt,
    end: block.endAt,
    editable: !block.isFixed,
    durationEditable: !block.isFixed,
    classNames: [categoryClass[block.category], ...(block.isConflict ? ["planner-event-conflict"] : [])],
    extendedProps: { block },
  })), [state.planBlocks]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      setMobile(query.matches);
      const nextView = query.matches ? "timeGridDay" : "timeGridWeek";
      setView(nextView);
      calendarRef.current?.getApi().changeView(nextView);
      setViewLabel(calendarRef.current?.getApi().view.title ?? scenarioWeekLabel());
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const onDatesSet = (arg: { view: { title: string; type: string } }) => {
    setViewLabel(arg.view.title);
    setView(arg.view.type);
  };

  const handleEventClick = (arg: EventClickArg) => {
    const block = arg.event.extendedProps.block as PlanBlock;
    setSelectedBlock(block);
    if (block.taskId) onEditTask(block);
  };

  const handleChange = (arg: EventDropArg | EventResizeDoneArg) => {
    const block = arg.event.extendedProps.block as PlanBlock;
    if (!arg.event.start) return;
    updatePlanBlock({
      ...block,
      startAt: toLocalIso(arg.event.start),
      endAt: toLocalIso(arg.event.end ?? new Date(arg.event.start.getTime() + 60 * 60_000)),
    });
    setSelectedBlock(null);
  };

  const runUrgent = async () => {
    setAddingUrgent(true);
    await addUrgentDeadline();
    setAddingUrgent(false);
  };

  const changeView = (nextView: string) => {
    calendarRef.current?.getApi().changeView(nextView);
    setView(nextView);
  };

  const navigate = (direction: "prev" | "next" | "today") => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api[direction]();
    setViewLabel(api.view.title);
  };

  return (
    <div className="space-y-4">
      {state.simulation.kind === "replan" && <div className="rounded-[16px] border border-warning/20 bg-warning/[0.045] px-4 py-3.5" role="status" aria-live="polite">
        <div className="flex items-start gap-3"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[9px] border border-warning/20 bg-warning/[0.07] text-warning"><RotateCcw className="size-3.5" /></span><div><p className="text-xs font-semibold text-foreground">Schedule conflict detected</p><AnimatePresence mode="wait" initial={false}><motion.p key={state.simulation.step} initial={{ opacity: 0, y: reduced ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -4 }} transition={{ duration: reduced ? 0.01 : 0.2 }} className="mt-1 text-[0.68rem] text-muted-foreground">{state.simulation.step ?? "Updating your schedule…"}</motion.p></AnimatePresence></div></div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-warning/10"><motion.div key={state.simulation.step} initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduced ? 0.01 : 0.3 }} className="h-full w-full origin-left rounded-full bg-warning/70" /></div>
      </div>}
      {state.simulation.kind === null && state.simulation.result.length > 0 && <div className="grid gap-2 rounded-[16px] border border-success/15 bg-success/[0.035] p-3 sm:grid-cols-2" role="status" aria-live="polite">
        {state.simulation.result.map((item) => <p key={item} className="flex items-center gap-2 text-[0.67rem] text-foreground/85"><Check className="size-3.5 shrink-0 text-success" />{item}</p>)}
      </div>}
      <Card className="overflow-hidden rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/75 px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="hidden items-center gap-1 lg:flex"><Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => navigate("prev")} className="size-8 rounded-[10px] border-border/75 bg-transparent"><ChevronLeft className="size-4" /></Button><Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => navigate("next")} className="size-8 rounded-[10px] border-border/75 bg-transparent"><ChevronRight className="size-4" /></Button></div>
              <Button variant="outline" onClick={() => navigate("today")} className="h-11 rounded-[10px] border-border/75 bg-transparent px-3 text-xs lg:h-8 lg:px-2.5 lg:text-[0.65rem]">Today</Button>
              <h2 className="min-w-0 truncate font-heading text-sm font-semibold text-foreground sm:text-base">{viewLabel}</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-[11px] border border-border/75 bg-background/60 p-0.5 lg:flex" role="group" aria-label="Calendar view">
                {[{ label: "Week", value: "timeGridWeek" }, { label: "Month", value: "dayGridMonth" }].map((option) => <button key={option.value} type="button" onClick={() => changeView(option.value)} aria-pressed={view === option.value} className={`rounded-[8px] px-2.5 py-1 text-[0.64rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === option.value ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{option.label}</button>)}
              </div>
              <Button size="sm" variant="outline" onClick={runUrgent} disabled={addingUrgent || state.simulation.kind === "replan"} className="h-11 rounded-[10px] border-warning/20 bg-warning/[0.04] px-3 text-xs text-warning hover:bg-warning/[0.08] lg:h-8 lg:px-2.5 lg:text-[0.64rem]"><Plus className="size-3.5" />{addingUrgent ? "Adding…" : "Urgent deadline"}</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/70 px-4 py-3 sm:px-5" aria-label="Task categories">
            {(["Academic", "Career", "Personal", "Internship", "AI Recommended"] as const).map((category) => <span key={category} className="inline-flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${category === "Academic" ? "bg-primary" : category === "Career" ? "bg-pathway" : category === "Internship" ? "bg-success" : category === "AI Recommended" ? "bg-primary/55" : "bg-muted-foreground"}`} /><span className="text-[0.61rem] text-muted-foreground">{category}</span></span>)}
          </div>
          {mobile && <div className="flex items-center justify-between px-4 pt-3"><Button variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => navigate("prev")} className="size-11"><ChevronLeft className="size-4" /></Button><span className="text-xs text-muted-foreground">Day agenda</span><Button variant="ghost" size="icon-sm" aria-label="Next day" onClick={() => navigate("next")} className="size-11"><ChevronRight className="size-4" /></Button></div>}
          <div className="planner-calendar-wrap p-2 sm:p-4">
            <FullCalendar
              ref={calendarRef}
              plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
              initialView={mobile ? "timeGridDay" : "timeGridWeek"}
              initialDate={scenarioDate()}
              headerToolbar={false}
              height={mobile ? 580 : 660}
              firstDay={1}
              slotMinTime="08:00:00"
              slotMaxTime="22:00:00"
              slotDuration="00:30:00"
              allDaySlot={false}
              nowIndicator={!mobile}
              editable
              eventStartEditable
              eventDurationEditable
              eventResizableFromStart
              selectable
              events={events}
              eventClick={handleEventClick}
              eventDrop={handleChange}
              eventResize={handleChange}
              datesSet={onDatesSet}
              eventContent={(arg) => <div className="planner-event-inner"><span className="planner-event-time">{arg.timeText}</span><span className="planner-event-title">{arg.event.title}</span></div>}
              eventDidMount={(arg) => { arg.el.setAttribute("aria-label", `${arg.event.title}, ${arg.timeText}`); }}
              dateClick={(arg) => {
                if (!arg.allDay) setSelectedBlock({ id: "new-block", taskId: null, title: "New task", category: "Academic", startAt: toLocalIso(arg.date), endAt: toLocalIso(new Date(arg.date.getTime() + 60 * 60_000)) });
              }}
              eventAllow={(_dropInfo, draggedEvent) => !Boolean(draggedEvent?.extendedProps.block?.isFixed)}
            />
          </div>
        </CardContent>
      </Card>
      {selectedBlock && !selectedBlock.taskId && <div className="flex items-center justify-between gap-3 rounded-[13px] border border-border bg-background/50 px-4 py-3"><span className="min-w-0 truncate text-xs text-foreground">Selected time · {new Date(selectedBlock.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><Button size="sm" onClick={() => onEditTask(selectedBlock)} className="h-8 rounded-[9px] text-[0.65rem]"><Plus className="size-3.5" />Add task here</Button></div>}
      <p className="sr-only" aria-live="polite">{state.simulation.announcement}</p>
    </div>
  );
}
