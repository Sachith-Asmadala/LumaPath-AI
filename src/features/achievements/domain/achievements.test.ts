import { describe, expect, it } from "vitest";
import { achievementPercent, activeAchievementAwards, canCelebrate, streakStateKey, type AchievementDashboard } from "@/features/achievements/domain/achievements";

const base:AchievementDashboard={student_id:"s",catalogue_version:"2026-10-v1",preferences:{student_id:"s",feature_visible:true,celebrations_enabled:false,streak_visible:true,updated_at:"2026-11-01T00:00:00Z"},awards:[],progress:[],streak:{current_count:0,longest_count:0,last_qualifying_date:null,grace_days_used:0,state:"empty",rule_version:"2026-10-v1",explanation:"",qualifying_dates:[]},new_awards:[],private_only:true,comparison_enabled:false,generated_at:"2026-11-01T00:00:00Z"};

describe("DOC-F27 achievements client contract",()=>{
  it("clamps progress instead of showing manipulative over-completion",()=>{ expect(achievementPercent(7,5)).toBe(100); expect(achievementPercent(0,5)).toBe(0); });
  it("shows only currently supported awards while preserving withdrawn history in data",()=>{
    const data={...base,awards:[{id:"a",definition_key:"x",definition_version:"v",title:"A",description:"",category:"planning",awarded_at:"2026-11-01T00:00:00Z",evidence_status:"active" as const,evidence:[],restored_at:null},{id:"b",definition_key:"y",definition_version:"v",title:"B",description:"",category:"planning",awarded_at:"2026-11-01T00:00:00Z",evidence_status:"withdrawn" as const,evidence:[],restored_at:null}]};
    expect(activeAchievementAwards(data)).toHaveLength(1);
  });
  it("requires explicit celebration opt-in",()=>{ expect(canCelebrate({...base,new_awards:[]})).toBe(false); expect(canCelebrate({...base,new_awards:[{id:"a",definition_key:"x",definition_version:"v",title:"A",description:"",category:"planning",awarded_at:"2026-11-01T00:00:00Z",evidence_status:"active",evidence:[],restored_at:null}]})).toBe(false); expect(canCelebrate({...base,preferences:{...base.preferences,celebrations_enabled:true},new_awards:[{id:"a",definition_key:"x",definition_version:"v",title:"A",description:"",category:"planning",awarded_at:"2026-11-01T00:00:00Z",evidence_status:"active",evidence:[],restored_at:null}]})).toBe(true); });
  it("maps consistency states to localized message keys",()=>{ expect(streakStateKey("grace")).toBe("achievements.streakState.grace"); });
});
