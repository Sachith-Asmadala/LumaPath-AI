export interface AchievementEvidence { source_type:string; source_id:string; occurred_at:string; href:string; label:string; verified:boolean }
export interface AchievementDefinition { key:string; version:string; category:string; title:string; description:string; target:number; unit:string; optional_career:boolean }
export interface AwardedAchievement { id:string; definition_key:string; definition_version:string; title:string; description:string; category:string; awarded_at:string; evidence_status:"active"|"withdrawn"; evidence:AchievementEvidence[]; restored_at:string|null }
export interface AchievementProgress { definition:AchievementDefinition; current:number; target:number; complete:boolean; evidence:AchievementEvidence[] }
export interface StreakView { current_count:number; longest_count:number; last_qualifying_date:string|null; grace_days_used:number; state:"active"|"grace"|"resting"|"empty"; rule_version:string; explanation:string; qualifying_dates:string[] }
export interface AchievementPreferences { student_id:string; feature_visible:boolean; celebrations_enabled:boolean; streak_visible:boolean; updated_at:string }
export interface AchievementDashboard { student_id:string; catalogue_version:string; preferences:AchievementPreferences; awards:AwardedAchievement[]; progress:AchievementProgress[]; streak:StreakView; new_awards:AwardedAchievement[]; private_only:boolean; comparison_enabled:boolean; generated_at:string }
export type AchievementPreferenceUpdate = Pick<AchievementPreferences,"feature_visible"|"celebrations_enabled"|"streak_visible">;

export function achievementPercent(current:number,target:number){ return target<=0?0:Math.max(0,Math.min(100,current/target*100)); }
export function activeAchievementAwards(data:AchievementDashboard){ return data.awards.filter((award)=>award.evidence_status==="active"); }
export function canCelebrate(data:AchievementDashboard){ return data.preferences.feature_visible&&data.preferences.celebrations_enabled&&data.new_awards.length>0; }
export function streakStateKey(state:StreakView["state"]){ return `achievements.streakState.${state}` as const; }
