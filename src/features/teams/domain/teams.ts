export type TeamRole = "owner" | "coordinator" | "member";
export type MemberStatus = "active" | "left" | "removed";
export type ProjectStatus = "active" | "completed" | "archived";
export type MilestoneStatus = "planned" | "in_progress" | "done";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";

export interface TeamSummary { id:string; name:string; description:string; status:string; my_membership_id:string; my_role:TeamRole; active_member_count:number; version:number; created_at:string; updated_at:string; }
export interface Member { id:string; display_name:string; role:TeamRole; status:MemberStatus; is_self:boolean; joined_at:string; removed_at:string|null; version:number; }
export interface SharedSkill { skill_id:string; name:string; proficiency:number|null; confidence:number|null; }
export interface MemberSharing { membership_id:string; availability_shared:boolean; availability_minutes_per_week:number|null; skills_shared:boolean; target_role:string|null; skills:SharedSkill[]; updated_at:string; privacy_note:string; }
export interface TeamDetail { team:TeamSummary; members:Member[]; my_sharing:MemberSharing|null; privacy_note:string; }
export interface Invitation { id:string; team_id:string; invite_label:string; role:"coordinator"|"member"; status:"pending"|"accepted"|"revoked"|"expired"; expires_at:string; created_at:string; }
export interface InvitationCreateResponse { invitation:Invitation; invitation_token:string; }
export interface Project { id:string; team_id:string; name:string; description:string; owner_membership_id:string; owner_display_name:string; status:ProjectStatus; due_at:string|null; version:number; created_at:string; updated_at:string; }
export interface Milestone { id:string; project_id:string; title:string; description:string; due_at:string|null; status:MilestoneStatus; version:number; created_at:string; updated_at:string; }
export interface GroupTask { id:string; project_id:string; milestone_id:string|null; title:string; description:string; status:TaskStatus; assignee_membership_id:string|null; assignee_display_name:string|null; estimated_minutes:number; due_at:string|null; required_skill_ids:string[]; dependency_task_ids:string[]; version:number; created_by_membership_id:string; created_at:string; updated_at:string; }
export interface TeamComment { id:string; task_id:string; author_membership_id:string; author_display_name:string; body:string; created_at:string; }
export interface MeetingNote { id:string; project_id:string; title:string; occurred_at:string; summary:string; decisions:string; action_items:string[]; created_by_membership_id:string; created_by_display_name:string; version:number; created_at:string; updated_at:string; }
export interface ProjectWorkspace { project:Project; milestones:Milestone[]; tasks:GroupTask[]; meeting_notes:MeetingNote[]; }
export interface AllocationCandidate { membership_id:string; display_name:string; fit_band:"strong"|"possible"|"limited_data"|"capacity_conflict"|"skill_gap"; matched_skill_ids:string[]; missing_skill_ids:string[]; declared_weekly_minutes:number|null; current_group_assigned_minutes:number; remaining_declared_minutes:number|null; rationale:string[]; privacy_note:string; }
export interface TaskAllocationSuggestion { task_id:string; task_title:string; required_skill_ids:string[]; estimated_minutes:number; candidates:AllocationCandidate[]; assignment_requires_human_approval:boolean; disclaimer:string; }
export interface AllocationSuggestionResponse { project_id:string; suggestions:TaskAllocationSuggestion[]; }
export interface ActivityEvent { id:number; project_id:string|null; actor_membership_id:string|null; actor_display_name:string|null; entity_type:string; entity_id:string; event_type:string; detail:Record<string,unknown>; occurred_at:string; correction_of_event_id:number|null; corrected:boolean; }
export interface ContributionMember { membership_id:string; display_name:string; role:TeamRole; task_created:number; task_completed:number; comments_added:number; meeting_notes_added:number; assignment_changes:number; last_activity_at:string|null; }
export interface ContributionHistory { team_id:string; members:ContributionMember[]; no_ranking:boolean; explanation:string; }

export const fitTone = (band: AllocationCandidate["fit_band"]) => band === "strong" ? "text-success border-success/20 bg-success/[0.04]" : band === "capacity_conflict" || band === "skill_gap" ? "text-warning border-warning/20 bg-warning/[0.04]" : "text-primary border-primary/20 bg-primary/[0.04]";

export function canCoordinateTeamWork(role: TeamRole, myMembershipId: string, projectOwnerMembershipId?: string | null) {
  return role === "owner" || role === "coordinator" || Boolean(projectOwnerMembershipId && projectOwnerMembershipId === myMembershipId);
}

export function canCorrectActivityRecord(role: TeamRole, myMembershipId: string, event: Pick<ActivityEvent,"actor_membership_id"|"corrected"|"correction_of_event_id">) {
  if (event.corrected || event.correction_of_event_id) return false;
  return role === "owner" || role === "coordinator" || event.actor_membership_id === myMembershipId;
}
