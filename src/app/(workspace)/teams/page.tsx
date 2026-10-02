"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, CheckCircle2, Clipboard, GitBranch, History, ListChecks, MessageSquareText, Plus, RefreshCw, ShieldCheck, Sparkles, UserPlus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";
import { canCoordinateTeamWork, canCorrectActivityRecord, fitTone, type ActivityEvent, type AllocationSuggestionResponse, type ContributionHistory, type GroupTask, type Project, type ProjectWorkspace, type TeamComment, type TeamDetail, type TeamSummary } from "@/features/teams/domain/teams";
import { teamRequest } from "@/features/teams/services/teams";

function localInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function TeamsPage() {
  const { state } = useDemo();
  const { t, formatDate, formatTime, formatNumber } = useLocale();
  const studentId = state.student.id;
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [workspace, setWorkspace] = useState<ProjectWorkspace | null>(null);
  const [suggestions, setSuggestions] = useState<AllocationSuggestionResponse | null>(null);
  const [history, setHistory] = useState<ActivityEvent[]>([]);
  const [contributions, setContributions] = useState<ContributionHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [teamForm, setTeamForm] = useState({ name: "", description: "" });
  const [joinToken, setJoinToken] = useState("");
  const [invite, setInvite] = useState({ label: "", role: "member", expiry: localInput(new Date(Date.now() + 7 * 86_400_000)) });
  const [lastInviteToken, setLastInviteToken] = useState("");
  const [sharing, setSharing] = useState({ shareAvailability: false, minutes: 240, shareSkills: false, skillIds: [] as string[] });
  const [projectForm, setProjectForm] = useState({ name: "", description: "" });
  const [milestoneForm, setMilestoneForm] = useState({ title: "", dueAt: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", estimatedMinutes: 60, dueAt: "", requiredSkills: [] as string[], dependencyIds: [] as string[] });
  const [meetingForm, setMeetingForm] = useState({ title: "", occurredAt: localInput(new Date()), summary: "", decisions: "" });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentsByTask, setCommentsByTask] = useState<Record<string, TeamComment[]>>({});
  const [correctionTarget, setCorrectionTarget] = useState<number | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const canCoordinate = Boolean(detail && selectedProject && canCoordinateTeamWork(detail.team.my_role, detail.team.my_membership_id, selectedProject.owner_membership_id));
  const shareableSkills = useMemo(() => state.careerSkills.slice(0, 18), [state.careerSkills]);

  const flash = (text: string) => { setMessage(text); setError(""); };
  const fail = (caught: unknown) => { setError(caught instanceof Error ? caught.message : t("teams.errorGeneric")); setMessage(""); };

  const loadTeams = useCallback(async () => {
    if (!studentId) return;
    try {
      const rows = await teamRequest<TeamSummary[]>("/api/teams", studentId);
      setTeams(rows);
      setSelectedTeamId((current) => current || rows[0]?.id || "");
    } catch (caught) { fail(caught); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const loadTeam = useCallback(async (teamId: string) => {
    if (!studentId || !teamId) return;
    try {
      const [teamDetail, teamProjects, teamHistory, teamContributions] = await Promise.all([
        teamRequest<TeamDetail>(`/api/teams/${teamId}`, studentId),
        teamRequest<Project[]>(`/api/teams/${teamId}/projects`, studentId),
        teamRequest<ActivityEvent[]>(`/api/teams/${teamId}/activity`, studentId),
        teamRequest<ContributionHistory>(`/api/teams/${teamId}/contributions`, studentId),
      ]);
      setDetail(teamDetail); setProjects(teamProjects); setHistory(teamHistory); setContributions(teamContributions);
      const own = teamDetail.my_sharing;
      setSharing({ shareAvailability: own?.availability_shared ?? false, minutes: own?.availability_minutes_per_week ?? 240, shareSkills: own?.skills_shared ?? false, skillIds: own?.skills.map((skill) => skill.skill_id) ?? [] });
      setSelectedProjectId((current) => teamProjects.some((p) => p.id === current) ? current : teamProjects[0]?.id || "");
    } catch (caught) { fail(caught); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const loadProject = useCallback(async (teamId: string, projectId: string) => {
    if (!studentId || !teamId || !projectId) { setWorkspace(null); setSuggestions(null); return; }
    try {
      const [data, allocation] = await Promise.all([
        teamRequest<ProjectWorkspace>(`/api/teams/${teamId}/projects/${projectId}`, studentId),
        teamRequest<AllocationSuggestionResponse>(`/api/teams/${teamId}/projects/${projectId}/allocation-suggestions`, studentId, { method: "POST", body: "{}" }),
      ]);
      setWorkspace(data); setSuggestions(allocation);
    } catch (caught) { fail(caught); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  useEffect(() => { void loadTeams(); }, [loadTeams]);
  useEffect(() => { if (selectedTeamId) void loadTeam(selectedTeamId); }, [loadTeam, selectedTeamId]);
  useEffect(() => { if (selectedTeamId && selectedProjectId) void loadProject(selectedTeamId, selectedProjectId); }, [loadProject, selectedProjectId, selectedTeamId]);

  async function createTeam() {
    if (!teamForm.name.trim()) return;
    setBusy(true); try {
      const created = await teamRequest<TeamDetail>("/api/teams", studentId, { method: "POST", body: JSON.stringify({ name: teamForm.name, description: teamForm.description, owner_display_name: state.student.name }) });
      setTeamForm({ name: "", description: "" }); setSelectedTeamId(created.team.id); await loadTeams(); flash(t("teams.teamCreated"));
    } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function joinTeam() {
    if (!joinToken.trim()) return;
    setBusy(true); try {
      const joined = await teamRequest<TeamDetail>("/api/team-invitations/accept", studentId, { method: "POST", body: JSON.stringify({ invitation_token: joinToken.trim(), display_name: state.student.name }) });
      setJoinToken(""); setSelectedTeamId(joined.team.id); await loadTeams(); flash(t("teams.joined"));
    } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function createInvitation() {
    if (!selectedTeamId || !invite.label.trim() || !invite.expiry) return;
    setBusy(true); try {
      const result = await teamRequest<{ invitation_token: string }>(`/api/teams/${selectedTeamId}/invitations`, studentId, { method: "POST", body: JSON.stringify({ invite_label: invite.label, role: invite.role, expires_at: new Date(invite.expiry).toISOString() }) });
      setLastInviteToken(result.invitation_token); setInvite((current) => ({ ...current, label: "" })); flash(t("teams.inviteCreated")); await loadTeam(selectedTeamId);
    } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function saveSharing() {
    if (!selectedTeamId) return;
    setBusy(true); try {
      await teamRequest(`/api/teams/${selectedTeamId}/sharing`, studentId, { method: "PUT", body: JSON.stringify({ share_availability: sharing.shareAvailability, availability_minutes_per_week: sharing.shareAvailability ? sharing.minutes : null, share_skills: sharing.shareSkills, target_role: sharing.shareSkills ? (state.student.targetRole || state.onboarding.careerGoal) : null, skill_ids: sharing.shareSkills ? sharing.skillIds : [] }) });
      await loadTeam(selectedTeamId); flash(t("teams.sharingSaved"));
    } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function leaveTeam() {
    if (!selectedTeamId || !window.confirm(t("teams.confirmLeave"))) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/leave`, studentId, { method: "POST", body: JSON.stringify({ reason: t("teams.leaveReason") }) }); setSelectedTeamId(""); setDetail(null); setProjects([]); setWorkspace(null); await loadTeams(); flash(t("teams.leftTeam")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function removeMember(memberId: string, version: number) {
    if (!selectedTeamId || !window.confirm(t("teams.confirmRemove"))) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/members/${memberId}/remove`, studentId, { method: "POST", body: JSON.stringify({ reason: t("teams.removalReason"), expected_version: version }) }); await loadTeam(selectedTeamId); flash(t("teams.memberRemoved")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function createProject() {
    if (!selectedTeamId || !projectForm.name.trim()) return;
    setBusy(true); try { const project = await teamRequest<Project>(`/api/teams/${selectedTeamId}/projects`, studentId, { method: "POST", body: JSON.stringify({ name: projectForm.name, description: projectForm.description }) }); setProjectForm({ name: "", description: "" }); setSelectedProjectId(project.id); await loadTeam(selectedTeamId); flash(t("teams.projectCreated")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function createMilestone() {
    if (!selectedTeamId || !selectedProjectId || !milestoneForm.title.trim()) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/projects/${selectedProjectId}/milestones`, studentId, { method: "POST", body: JSON.stringify({ title: milestoneForm.title, due_at: milestoneForm.dueAt ? new Date(milestoneForm.dueAt).toISOString() : null }) }); setMilestoneForm({ title: "", dueAt: "" }); await loadProject(selectedTeamId, selectedProjectId); await loadTeam(selectedTeamId); flash(t("teams.milestoneCreated")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function createTask() {
    if (!selectedTeamId || !selectedProjectId || !taskForm.title.trim()) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/projects/${selectedProjectId}/tasks`, studentId, { method: "POST", body: JSON.stringify({ title: taskForm.title, description: taskForm.description, estimated_minutes: taskForm.estimatedMinutes, due_at: taskForm.dueAt ? new Date(taskForm.dueAt).toISOString() : null, required_skill_ids: taskForm.requiredSkills, dependency_task_ids: taskForm.dependencyIds }) }); setTaskForm({ title: "", description: "", estimatedMinutes: 60, dueAt: "", requiredSkills: [], dependencyIds: [] }); await loadProject(selectedTeamId, selectedProjectId); await loadTeam(selectedTeamId); flash(t("teams.taskCreated")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function changeStatus(task: GroupTask, status: GroupTask["status"]) {
    if (!selectedTeamId || !selectedProjectId) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/projects/${selectedProjectId}/tasks/${task.id}/status`, studentId, { method: "POST", body: JSON.stringify({ status, expected_version: task.version }) }); await loadProject(selectedTeamId, selectedProjectId); await loadTeam(selectedTeamId); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function assign(task: GroupTask, membershipId: string | null) {
    if (!selectedTeamId || !selectedProjectId || !window.confirm(t("teams.confirmAssignment"))) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/projects/${selectedProjectId}/tasks/${task.id}/assignment`, studentId, { method: "POST", body: JSON.stringify({ assignee_membership_id: membershipId, expected_version: task.version, confirmed: true, rationale_note: t("teams.assignmentConfirmedByHuman") }) }); await loadProject(selectedTeamId, selectedProjectId); await loadTeam(selectedTeamId); flash(t("teams.assignmentSaved")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function loadComments(taskId: string) {
    if (!selectedTeamId || !selectedProjectId) return;
    try { const rows = await teamRequest<TeamComment[]>(`/api/teams/${selectedTeamId}/projects/${selectedProjectId}/tasks/${taskId}/comments`, studentId); setCommentsByTask((current) => ({ ...current, [taskId]: rows })); } catch (caught) { fail(caught); }
  }

  async function addComment(task: GroupTask) {
    const body = commentDrafts[task.id]?.trim(); if (!body || !selectedTeamId || !selectedProjectId) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/projects/${selectedProjectId}/tasks/${task.id}/comments`, studentId, { method: "POST", body: JSON.stringify({ body }) }); setCommentDrafts((current) => ({ ...current, [task.id]: "" })); await loadComments(task.id); await loadTeam(selectedTeamId); flash(t("teams.commentAdded")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function submitCorrection(eventId: number) {
    if (!selectedTeamId || correctionTarget !== eventId || correctionReason.trim().length < 3) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/activity/${eventId}/corrections`, studentId, { method: "POST", body: JSON.stringify({ reason: correctionReason.trim() }) }); setCorrectionTarget(null); setCorrectionReason(""); await loadTeam(selectedTeamId); flash(t("teams.correctionSaved")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  async function createMeetingNote() {
    if (!selectedTeamId || !selectedProjectId || !meetingForm.title.trim() || !meetingForm.summary.trim()) return;
    setBusy(true); try { await teamRequest(`/api/teams/${selectedTeamId}/projects/${selectedProjectId}/meeting-notes`, studentId, { method: "POST", body: JSON.stringify({ title: meetingForm.title, occurred_at: new Date(meetingForm.occurredAt).toISOString(), summary: meetingForm.summary, decisions: meetingForm.decisions, action_items: [] }) }); setMeetingForm({ title: "", occurredAt: localInput(new Date()), summary: "", decisions: "" }); await loadProject(selectedTeamId, selectedProjectId); await loadTeam(selectedTeamId); flash(t("teams.meetingSaved")); } catch (caught) { fail(caught); } finally { setBusy(false); }
  }

  function toggleSkill(skillId: string, target: "sharing" | "task") {
    if (target === "sharing") setSharing((current) => ({ ...current, skillIds: current.skillIds.includes(skillId) ? current.skillIds.filter((id) => id !== skillId) : [...current.skillIds, skillId] }));
    else setTaskForm((current) => ({ ...current, requiredSkills: current.requiredSkills.includes(skillId) ? current.requiredSkills.filter((id) => id !== skillId) : [...current.requiredSkills, skillId] }));
  }

  return <div className="mx-auto max-w-[1500px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
    <Reveal><div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><UsersRound className="size-3.5" />{t("teams.eyebrow")}</p><TypographyH1>{t("teams.title")}</TypographyH1><TypographyP className="mt-2 max-w-3xl">{t("teams.subtitle")}</TypographyP></div><Button variant="outline" onClick={() => { void loadTeams(); if (selectedTeamId) void loadTeam(selectedTeamId); }}><RefreshCw className="size-4" />{t("teams.refresh")}</Button></div></Reveal>

    {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-sm text-destructive">{error}</div>}
    {message && <div role="status" className="mb-4 rounded-xl border border-success/20 bg-success/[0.04] p-3 text-sm text-success">{message}</div>}
    <Card className="mb-5 rounded-[20px] border-primary/15 bg-primary/[0.025] p-4 shadow-none"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary"/><div><p className="text-sm font-medium">{t("teams.privacyTitle")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("teams.privacyBody")}</p></div></div></Card>

    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card className="rounded-[20px] p-5 shadow-none"><h2 className="font-heading text-lg font-semibold">{t("teams.myTeams")}</h2><div className="mt-4 space-y-2">{teams.length===0?<p className="text-sm text-muted-foreground">{t("teams.noTeams")}</p>:teams.map((team)=><button key={team.id} type="button" onClick={()=>setSelectedTeamId(team.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedTeamId===team.id?"border-primary/30 bg-primary/[0.04]":"border-border/70 hover:bg-muted/30"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{team.name}</span><span className="text-[0.62rem] uppercase text-muted-foreground">{team.my_role}</span></div><p className="mt-1 text-xs text-muted-foreground">{t("teams.memberCount",{count:formatNumber(team.active_member_count)})}</p></button>)}</div></Card>
        <Card className="rounded-[20px] p-5 shadow-none"><h2 className="font-heading text-lg font-semibold">{t("teams.createTeam")}</h2><div className="mt-4 space-y-3"><Input aria-label={t("teams.teamName")} placeholder={t("teams.teamName")} value={teamForm.name} onChange={(e)=>setTeamForm({...teamForm,name:e.target.value})}/><Textarea aria-label={t("teams.teamDescription")} placeholder={t("teams.teamDescription")} value={teamForm.description} onChange={(e)=>setTeamForm({...teamForm,description:e.target.value})}/><Button disabled={busy||!teamForm.name.trim()} onClick={()=>void createTeam()}><Plus className="size-4"/>{t("teams.createTeam")}</Button></div></Card>
        <Card className="rounded-[20px] p-5 shadow-none"><h2 className="font-heading text-lg font-semibold">{t("teams.joinTeam")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("teams.joinHelp")}</p><div className="mt-4 space-y-3"><Input aria-label={t("teams.invitationToken")} placeholder={t("teams.invitationToken")} value={joinToken} onChange={(e)=>setJoinToken(e.target.value)}/><Button variant="outline" disabled={busy||!joinToken.trim()} onClick={()=>void joinTeam()}><UserPlus className="size-4"/>{t("teams.joinTeam")}</Button></div></Card>
      </div>

      <div className="min-w-0 space-y-5">
        {!detail ? <Card className="rounded-[20px] p-8 text-center shadow-none"><p className="text-sm text-muted-foreground">{t("teams.selectTeam")}</p></Card> : <>
          <Card className="rounded-[20px] p-5 shadow-none"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">{detail.team.my_role}</p><h2 className="mt-1 font-heading text-2xl font-semibold">{detail.team.name}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{detail.team.description||t("teams.noDescription")}</p></div><div className="flex items-center gap-2"><span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{t("teams.memberCount",{count:formatNumber(detail.team.active_member_count)})}</span>{detail.team.my_role!=="owner"&&<Button size="sm" variant="outline" onClick={()=>void leaveTeam()}>{t("teams.leaveTeam")}</Button>}</div></div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-border/70 p-4"><h3 className="text-sm font-semibold">{t("teams.members")}</h3><div className="mt-3 space-y-2">{detail.members.filter((member)=>member.status==="active").map((member)=><div key={member.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/25 px-3 py-2"><div><p className="text-sm font-medium">{member.display_name}{member.is_self?` · ${t("teams.you")}`:""}</p><p className="text-[0.65rem] uppercase text-muted-foreground">{member.role}</p></div>{detail.team.my_role==="owner"&&!member.is_self&&<Button size="sm" variant="ghost" onClick={()=>void removeMember(member.id,member.version)}>{t("teams.remove")}</Button>}</div>)}</div></div>
              <div className="rounded-2xl border border-border/70 p-4"><h3 className="text-sm font-semibold">{t("teams.inviteMember")}</h3>{detail.team.my_role==="member"?<p className="mt-2 text-xs text-muted-foreground">{t("teams.invitePermission")}</p>:<div className="mt-3 space-y-2"><Input aria-label={t("teams.inviteLabel")} placeholder={t("teams.inviteLabel")} value={invite.label} onChange={(e)=>setInvite({...invite,label:e.target.value})}/><select aria-label={t("teams.inviteRole")} value={invite.role} onChange={(e)=>setInvite({...invite,role:e.target.value})} className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm"><option value="member">{t("teams.roleMember")}</option><option value="coordinator">{t("teams.roleCoordinator")}</option></select><Input aria-label={t("teams.inviteExpiry")} type="datetime-local" value={invite.expiry} onChange={(e)=>setInvite({...invite,expiry:e.target.value})}/><Button disabled={busy||!invite.label.trim()} onClick={()=>void createInvitation()}><UserPlus className="size-4"/>{t("teams.createInvite")}</Button>{lastInviteToken&&<div className="rounded-xl border border-warning/20 bg-warning/[0.03] p-3"><p className="text-xs font-medium">{t("teams.copyInviteOnce")}</p><p className="mt-1 break-all font-mono text-[0.65rem] text-muted-foreground">{lastInviteToken}</p><Button className="mt-2" size="sm" variant="outline" onClick={()=>void navigator.clipboard?.writeText(lastInviteToken)}><Clipboard className="size-3.5"/>{t("teams.copyToken")}</Button></div>}</div>}</div></div>
          </Card>

          <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("teams.sharingTitle")}</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("teams.sharingHelp")}</p><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="rounded-xl border border-border/70 p-3"><span className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={sharing.shareAvailability} onChange={(e)=>setSharing({...sharing,shareAvailability:e.target.checked})}/>{t("teams.shareAvailability")}</span>{sharing.shareAvailability&&<Input className="mt-3" type="number" min={0} max={10080} aria-label={t("teams.weeklyMinutes")} value={sharing.minutes} onChange={(e)=>setSharing({...sharing,minutes:Number(e.target.value)})}/>}<p className="mt-2 text-[0.65rem] text-muted-foreground">{t("teams.availabilityPrivacy")}</p></label><div className="rounded-xl border border-border/70 p-3"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={sharing.shareSkills} onChange={(e)=>setSharing({...sharing,shareSkills:e.target.checked})}/>{t("teams.shareSkills")}</label>{sharing.shareSkills&&<div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto">{shareableSkills.map((skill)=><label key={skill.id} className="flex items-center gap-1.5 rounded-lg border border-border/70 px-2 py-1 text-xs"><input type="checkbox" checked={sharing.skillIds.includes(skill.id)} onChange={()=>toggleSkill(skill.id,"sharing")}/>{skill.name}</label>)}</div>}<p className="mt-2 text-[0.65rem] text-muted-foreground">{t("teams.skillPrivacy")}</p></div></div><Button className="mt-4" variant="outline" onClick={()=>void saveSharing()} disabled={busy}><ShieldCheck className="size-4"/>{t("teams.saveSharing")}</Button></Card>

          <Card className="rounded-[20px] p-5 shadow-none"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="font-heading text-lg font-semibold">{t("teams.projects")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("teams.projectsHelp")}</p></div>{projects.length>0&&<select value={selectedProjectId} onChange={(e)=>setSelectedProjectId(e.target.value)} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm" aria-label={t("teams.selectProject")}>{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select>}</div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label={t("teams.projectName")} placeholder={t("teams.projectName")} value={projectForm.name} onChange={(e)=>setProjectForm({...projectForm,name:e.target.value})}/><Input aria-label={t("teams.projectDescription")} placeholder={t("teams.projectDescription")} value={projectForm.description} onChange={(e)=>setProjectForm({...projectForm,description:e.target.value})}/><Button onClick={()=>void createProject()} disabled={busy||!projectForm.name.trim()}><Plus className="size-4"/>{t("teams.addProject")}</Button></div></Card>

          {workspace&&selectedProject&&<Card className="rounded-[20px] p-4 shadow-none"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("teams.projectOwner")}</p><p className="mt-1 text-sm font-medium">{selectedProject.owner_display_name}</p></div><div className="text-right"><p className="text-xs uppercase tracking-wide text-muted-foreground">{t("teams.projectStatus")}</p><p className="mt-1 text-sm font-medium">{selectedProject.status}</p></div></div></Card>}

          {workspace&&selectedProject&&<Tabs defaultValue="work" className="gap-4"><TabsList variant="line" className="max-w-full overflow-x-auto"><TabsTrigger value="work">{t("teams.tabWork")}</TabsTrigger><TabsTrigger value="allocation">{t("teams.tabAllocation")}</TabsTrigger><TabsTrigger value="meetings">{t("teams.tabMeetings")}</TabsTrigger><TabsTrigger value="history">{t("teams.tabHistory")}</TabsTrigger></TabsList>
            <TabsContent value="work" className="space-y-5"><Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><GitBranch className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("teams.milestones")}</h2></div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_220px_auto]"><Input aria-label={t("teams.milestoneTitle")} placeholder={t("teams.milestoneTitle")} value={milestoneForm.title} onChange={(e)=>setMilestoneForm({...milestoneForm,title:e.target.value})}/><Input type="datetime-local" aria-label={t("teams.milestoneDue")} value={milestoneForm.dueAt} onChange={(e)=>setMilestoneForm({...milestoneForm,dueAt:e.target.value})}/><Button variant="outline" onClick={()=>void createMilestone()} disabled={busy||!milestoneForm.title.trim()}><Plus className="size-4"/>{t("teams.add")}</Button></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{workspace.milestones.map((milestone)=><div key={milestone.id} className="rounded-xl border border-border/70 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{milestone.title}</p><span className="text-[0.62rem] uppercase text-muted-foreground">{milestone.status}</span></div>{milestone.due_at&&<p className="mt-2 text-xs text-muted-foreground"><CalendarClock className="mr-1 inline size-3"/>{formatDate(milestone.due_at)} · {formatTime(milestone.due_at)}</p>}</div>)}</div></Card>
              <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><ListChecks className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("teams.tasks")}</h2></div><div className="mt-4 grid gap-3"><Input aria-label={t("teams.taskTitle")} placeholder={t("teams.taskTitle")} value={taskForm.title} onChange={(e)=>setTaskForm({...taskForm,title:e.target.value})}/><Textarea aria-label={t("teams.taskDescription")} placeholder={t("teams.taskDescription")} value={taskForm.description} onChange={(e)=>setTaskForm({...taskForm,description:e.target.value})}/><div className="grid gap-2 sm:grid-cols-2"><Input type="number" min={5} max={10080} aria-label={t("teams.estimateMinutes")} value={taskForm.estimatedMinutes} onChange={(e)=>setTaskForm({...taskForm,estimatedMinutes:Number(e.target.value)})}/><Input type="datetime-local" aria-label={t("teams.taskDue")} value={taskForm.dueAt} onChange={(e)=>setTaskForm({...taskForm,dueAt:e.target.value})}/></div><div><p className="mb-2 text-xs font-medium">{t("teams.requiredSkills")}</p><div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">{shareableSkills.map((skill)=><label key={skill.id} className="flex items-center gap-1.5 rounded-lg border border-border/70 px-2 py-1 text-xs"><input type="checkbox" checked={taskForm.requiredSkills.includes(skill.id)} onChange={()=>toggleSkill(skill.id,"task")}/>{skill.name}</label>)}</div></div>{workspace.tasks.length>0&&<div><p className="mb-2 text-xs font-medium">{t("teams.dependencies")}</p><div className="flex flex-wrap gap-2">{workspace.tasks.filter((task)=>task.status!=="done"&&task.status!=="cancelled").map((task)=><label key={task.id} className="flex items-center gap-1.5 rounded-lg border border-border/70 px-2 py-1 text-xs"><input type="checkbox" checked={taskForm.dependencyIds.includes(task.id)} onChange={()=>setTaskForm((current)=>({...current,dependencyIds:current.dependencyIds.includes(task.id)?current.dependencyIds.filter((id)=>id!==task.id):[...current.dependencyIds,task.id]}))}/>{task.title}</label>)}</div></div>}<Button className="w-fit" onClick={()=>void createTask()} disabled={busy||!taskForm.title.trim()}><Plus className="size-4"/>{t("teams.addTask")}</Button></div>
                <div className="mt-6 space-y-3">{workspace.tasks.length===0?<p className="text-sm text-muted-foreground">{t("teams.noTasks")}</p>:workspace.tasks.map((task)=><div key={task.id} className="rounded-2xl border border-border/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.assignee_display_name??t("teams.unassigned")} · {t("teams.minutes",{count:formatNumber(task.estimated_minutes)})}</p></div><span className="rounded-full border border-border px-2 py-1 text-[0.62rem] uppercase text-muted-foreground">{task.status}</span></div>{task.description&&<p className="mt-3 text-sm text-muted-foreground">{task.description}</p>}{task.dependency_task_ids.length>0&&<p className="mt-2 text-[0.65rem] text-muted-foreground">{t("teams.dependsOn",{count:formatNumber(task.dependency_task_ids.length)})}</p>}<div className="mt-3 flex flex-wrap gap-2">{task.status!=="done"&&<Button size="sm" variant="outline" onClick={()=>void changeStatus(task,task.status==="in_progress"?"done":"in_progress")}>{task.status==="in_progress"?t("teams.markDone"):t("teams.startTask")}</Button>}</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input aria-label={t("teams.commentPlaceholder")} placeholder={t("teams.commentPlaceholder")} value={commentDrafts[task.id]??""} onChange={(e)=>setCommentDrafts((current)=>({...current,[task.id]:e.target.value}))}/><Button size="sm" variant="ghost" onClick={()=>void addComment(task)} disabled={!commentDrafts[task.id]?.trim()}><MessageSquareText className="size-4"/>{t("teams.comment")}</Button><Button size="sm" variant="ghost" onClick={()=>void loadComments(task.id)}>{t("teams.viewComments")}</Button></div>{commentsByTask[task.id]?.length?<div className="mt-3 space-y-2">{commentsByTask[task.id].map((comment)=><div key={comment.id} className="rounded-lg bg-muted/25 px-3 py-2"><p className="text-xs font-medium">{comment.author_display_name}</p><p className="mt-1 text-xs text-muted-foreground">{comment.body}</p></div>)}</div>:null}</div>)}</div></Card></TabsContent>

            <TabsContent value="allocation"><Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 size-5 text-primary"/><div><h2 className="font-heading text-lg font-semibold">{t("teams.allocationTitle")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("teams.allocationBody")}</p></div></div><div className="mt-5 space-y-4">{suggestions?.suggestions.length? suggestions.suggestions.map((suggestion)=>{const task=workspace.tasks.find((item)=>item.id===suggestion.task_id);return <div key={suggestion.task_id} className="rounded-2xl border border-border/70 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{suggestion.task_title}</p><p className="mt-1 text-xs text-muted-foreground">{t("teams.minutes",{count:formatNumber(suggestion.estimated_minutes)})}</p></div><span className="text-[0.62rem] uppercase text-muted-foreground">{t("teams.humanApprovalRequired")}</span></div><div className="mt-3 grid gap-2 md:grid-cols-2">{suggestion.candidates.map((candidate)=><div key={candidate.membership_id} className={`rounded-xl border p-3 ${fitTone(candidate.fit_band)}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{candidate.display_name}</p><span className="text-[0.6rem] uppercase">{t(`teams.fit.${candidate.fit_band}`)}</span></div><ul className="mt-2 space-y-1 text-[0.65rem] leading-5 text-muted-foreground">{candidate.rationale.map((reason)=><li key={reason}>• {reason}</li>)}</ul>{canCoordinate&&task&&task.assignee_membership_id!==candidate.membership_id&&<Button size="sm" variant="outline" className="mt-3" onClick={()=>void assign(task,candidate.membership_id)}>{t("teams.assignAfterReview")}</Button>}</div>)}</div></div>;}):<p className="text-sm text-muted-foreground">{t("teams.noAllocationSuggestions")}</p>}</div></Card></TabsContent>

            <TabsContent value="meetings"><Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><MessageSquareText className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("teams.meetingNotes")}</h2></div><div className="mt-4 grid gap-3"><Input aria-label={t("teams.meetingTitle")} placeholder={t("teams.meetingTitle")} value={meetingForm.title} onChange={(e)=>setMeetingForm({...meetingForm,title:e.target.value})}/><Input type="datetime-local" aria-label={t("teams.meetingTime")} value={meetingForm.occurredAt} onChange={(e)=>setMeetingForm({...meetingForm,occurredAt:e.target.value})}/><Textarea aria-label={t("teams.meetingSummary")} placeholder={t("teams.meetingSummary")} value={meetingForm.summary} onChange={(e)=>setMeetingForm({...meetingForm,summary:e.target.value})}/><Textarea aria-label={t("teams.meetingDecisions")} placeholder={t("teams.meetingDecisions")} value={meetingForm.decisions} onChange={(e)=>setMeetingForm({...meetingForm,decisions:e.target.value})}/><Button className="w-fit" onClick={()=>void createMeetingNote()} disabled={busy||!meetingForm.title.trim()||!meetingForm.summary.trim()}>{t("teams.saveMeeting")}</Button></div><div className="mt-6 space-y-3">{workspace.meeting_notes.map((note)=><div key={note.id} className="rounded-xl border border-border/70 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{note.title}</p><span className="text-xs text-muted-foreground">{formatDate(note.occurred_at)} · {formatTime(note.occurred_at)}</span></div><p className="mt-2 text-sm text-muted-foreground">{note.summary}</p>{note.decisions&&<p className="mt-2 text-xs"><span className="font-medium">{t("teams.decisions")}: </span>{note.decisions}</p>}<p className="mt-2 text-[0.65rem] text-muted-foreground">{note.created_by_display_name}</p></div>)}</div></Card></TabsContent>

            <TabsContent value="history" className="space-y-5"><Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><History className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("teams.contributionHistory")}</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{contributions?.explanation??t("teams.contributionHelp")}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{contributions?.members.map((member)=><div key={member.membership_id} className="rounded-xl border border-border/70 p-3"><div className="flex justify-between gap-2"><p className="text-sm font-medium">{member.display_name}</p><span className="text-[0.62rem] uppercase text-muted-foreground">{member.role}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-[0.68rem] text-muted-foreground"><span>{t("teams.tasksCreated")}: {formatNumber(member.task_created)}</span><span>{t("teams.tasksCompleted")}: {formatNumber(member.task_completed)}</span><span>{t("teams.comments")}: {formatNumber(member.comments_added)}</span><span>{t("teams.meetings")}: {formatNumber(member.meeting_notes_added)}</span></div></div>)}</div></Card><Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><Activity className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("teams.activityHistory")}</h2></div><div className="mt-4 space-y-2">{history.slice(0,40).map((event)=><div key={event.id} className={`rounded-xl border p-3 ${event.corrected?"border-warning/20 bg-warning/[0.025]":"border-border/70"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium">{event.event_type.replaceAll("_"," ")}</p><p className="mt-1 text-xs text-muted-foreground">{event.actor_display_name??t("teams.systemActor")} · {event.entity_type}</p></div><span className="text-[0.65rem] text-muted-foreground">{formatDate(event.occurred_at)} · {formatTime(event.occurred_at)}</span></div>{event.corrected&&<p className="mt-2 text-xs text-warning">{t("teams.correctedEvent")}</p>}{!event.corrected&&!event.correction_of_event_id&&canCorrectActivityRecord(detail.team.my_role,detail.team.my_membership_id,event)&&<div className="mt-2">{correctionTarget===event.id?<div className="flex flex-col gap-2 sm:flex-row"><Input value={correctionReason} onChange={(e)=>setCorrectionReason(e.target.value)} aria-label={t("teams.correctionReason")} placeholder={t("teams.correctionReason")}/><Button size="sm" variant="outline" onClick={()=>void submitCorrection(event.id)} disabled={correctionReason.trim().length<3}>{t("teams.saveCorrection")}</Button><Button size="sm" variant="ghost" onClick={()=>{setCorrectionTarget(null);setCorrectionReason("");}}>{t("teams.cancel")}</Button></div>:<Button size="sm" variant="ghost" onClick={()=>setCorrectionTarget(event.id)}>{t("teams.correctRecord")}</Button>}</div>}</div>)}</div></Card></TabsContent>
          </Tabs>}
        </>}
      </div>
    </div>
  </div>;
}
