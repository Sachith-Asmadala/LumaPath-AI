import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers={"content-type":"application/json"};
const now="2026-11-16T06:00:00Z";
const team={id:"team-1",name:"ResearchTrack Group",description:"Sprint collaboration",status:"active",my_membership_id:"member-a",my_role:"owner",active_member_count:2,version:1,created_at:now,updated_at:now};
const members=[{id:"member-a",display_name:"Student",role:"owner",status:"active",is_self:true,joined_at:now,removed_at:null,version:1},{id:"member-b",display_name:"Nima",role:"member",status:"active",is_self:false,joined_at:now,removed_at:null,version:1}];
const project={id:"project-1",team_id:"team-1",name:"Sprint 4",description:"Release sprint",owner_membership_id:"member-a",owner_display_name:"Student",status:"active",due_at:null,version:1,created_at:now,updated_at:now};
const task={id:"gtask-1",project_id:"project-1",milestone_id:null,title:"Prepare demo",description:"Prepare the shared demo flow",status:"todo",assignee_membership_id:null,assignee_display_name:null,estimated_minutes:60,due_at:null,required_skill_ids:["git"],dependency_task_ids:[],version:1,created_by_membership_id:"member-a",created_at:now,updated_at:now};

async function mockShell(page:Page){
  await page.route("**/api/notifications/**",route=>route.fulfill({status:200,headers,body:JSON.stringify({items:[],unread_count:0,generated_at:now,partial:false,calendar_integration_available:true})}));
  await page.route("**/api/achievements**",route=>route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",catalogue_version:"2026-10-v1",preferences:{student_id:"student-onboarded",feature_visible:true,celebrations_enabled:false,streak_visible:true,updated_at:now},awards:[],progress:[],streak:{current_count:0,longest_count:0,last_qualifying_date:null,grace_days_used:0,state:"empty",rule_version:"2026-10-v1",explanation:"",qualifying_dates:[]},new_awards:[],private_only:true,comparison_enabled:false,generated_at:now})}));
}

async function mockTeams(page:Page){
  await page.route("**/api/teams**",async route=>{
    const req=route.request(); const path=new URL(req.url()).pathname;
    if(path==="/api/teams"&&req.method()==="GET") return route.fulfill({status:200,headers,body:JSON.stringify([team])});
    if(path==="/api/teams/team-1"&&req.method()==="GET") return route.fulfill({status:200,headers,body:JSON.stringify({team,members,my_sharing:null,privacy_note:"Private data is excluded."})});
    if(path==="/api/teams/team-1/projects"&&req.method()==="GET") return route.fulfill({status:200,headers,body:JSON.stringify([project])});
    if(path==="/api/teams/team-1/projects/project-1"&&req.method()==="GET") return route.fulfill({status:200,headers,body:JSON.stringify({project,milestones:[],tasks:[task],meeting_notes:[]})});
    if(path.endsWith("/allocation-suggestions")) return route.fulfill({status:200,headers,body:JSON.stringify({project_id:"project-1",suggestions:[{task_id:"gtask-1",task_title:"Prepare demo",required_skill_ids:["git"],estimated_minutes:60,assignment_requires_human_approval:true,disclaimer:"Planning aid only; human approval required.",candidates:[{membership_id:"member-a",display_name:"Student",fit_band:"strong",matched_skill_ids:["git"],missing_skill_ids:[],declared_weekly_minutes:240,current_group_assigned_minutes:0,remaining_declared_minutes:240,rationale:["Shares the Git requirement.","Declared team availability has room."],privacy_note:"Only explicitly shared data is used."},{membership_id:"member-b",display_name:"Nima",fit_band:"limited_data",matched_skill_ids:[],missing_skill_ids:["git"],declared_weekly_minutes:null,current_group_assigned_minutes:0,remaining_declared_minutes:null,rationale:["No shared skill data.","Weekly availability has not been shared."],privacy_note:"Only explicitly shared data is used."}]}]})});
    if(path==="/api/teams/team-1/activity") return route.fulfill({status:200,headers,body:JSON.stringify([{id:1,project_id:"project-1",actor_membership_id:"member-a",actor_display_name:"Student",entity_type:"task",entity_id:"gtask-1",event_type:"task_created",detail:{title:"Prepare demo"},occurred_at:now,correction_of_event_id:null,corrected:false}])});
    if(path==="/api/teams/team-1/contributions") return route.fulfill({status:200,headers,body:JSON.stringify({team_id:"team-1",members:[{membership_id:"member-a",display_name:"Student",role:"owner",task_created:1,task_completed:0,comments_added:0,meeting_notes_added:0,assignment_changes:0,last_activity_at:now},{membership_id:"member-b",display_name:"Nima",role:"member",task_created:0,task_completed:0,comments_added:0,meeting_notes_added:0,assignment_changes:0,last_activity_at:null}],no_ranking:true,explanation:"Recorded actions only; no leaderboard or effort score."})});
    if(path.endsWith("/sharing")&&req.method()==="PUT") return route.fulfill({status:200,headers,body:JSON.stringify({membership_id:"member-a",availability_shared:true,availability_minutes_per_week:240,skills_shared:false,target_role:null,skills:[],updated_at:now,privacy_note:"Private data excluded."})});
    if(path.includes("/comments")&&req.method()==="GET") return route.fulfill({status:200,headers,body:"[]"});
    return route.fulfill({status:200,headers,body:"{}"});
  });
}

test.beforeEach(async({page})=>{await seedExistingStudent(page);await mockShell(page);await mockTeams(page);});

test("team workspace shows consent-minimal allocation rationale and no member ranking",async({page})=>{
  await page.goto("/teams");
  await expect(page.getByRole("heading",{name:"Team Workspaces"})).toBeVisible();
  await expect(page.getByText(/private capacity\/check-ins/i)).toBeVisible();
  await page.getByRole("tab",{name:"Allocation"}).click();
  await expect(page.getByText("Human approval required")).toBeVisible();
  await expect(page.getByText("Strong fit")).toBeVisible();
  await page.getByRole("tab",{name:"History"}).click();
  await expect(page.getByText(/no leaderboard or effort score/i)).toBeVisible();
  await expect(page.getByText(/best member/i)).toHaveCount(0);
});

test("team workspace remains keyboard reachable and narrow-screen safe",async({page})=>{
  await page.setViewportSize({width:360,height:800}); await page.goto("/teams");
  const refresh=page.getByRole("button",{name:"Refresh"}); await refresh.focus(); await expect(refresh).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)).toBe(false);
});
