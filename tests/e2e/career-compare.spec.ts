import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers={"content-type":"application/json"};
const roles=[
 {id:"devops-engineer",name:"DevOps Engineer",version:"2026-10-v2",level:"entry_to_junior",description:"Build and operate reliable delivery infrastructure.",quality_status:"approved",skill_count:9},
 {id:"cloud-engineer",name:"Cloud Engineer",version:"2026-10-v2",level:"entry_to_junior",description:"Design and operate cloud infrastructure.",quality_status:"approved",skill_count:5},
 {id:"backend-engineer",name:"Backend Engineer",version:"2026-10-v2",level:"entry_to_junior",description:"Design reliable APIs and data systems.",quality_status:"approved",skill_count:5},
];

function scenario(weekly=360){return {id:"scenario-1",status:"disposable",role_ids:["devops-engineer","cloud-engineer"],created_at:"2026-11-20T10:00:00Z",saved_at:null as string | null,latest_result:{id:`result-${weekly}`,scenario_id:"scenario-1",created_at:"2026-11-20T10:00:00Z",inputs:{role_ids:["devops-engineer","cloud-engineer"],taxonomy_version:"2026-10-v2",active_pathway_id:"path-1",active_pathway_version:1,active_target_role:"DevOps Engineer",weekly_learning_minutes:weekly,target_date:"2027-02-12",preferences:{language:"English",formats:["hands-on"]},context_refreshed:weekly===360},shared_skill_ids:["cloud","networking","monitoring"],roles:[
 {role_id:"devops-engineer",role_name:"DevOps Engineer",role_version:"2026-10-v2",shared_skill_ids:["cloud","networking","monitoring"],unique_skill_ids:["git","docker","cicd","terraform","kubernetes"],transferable_skill_ids:["linux","git","networking"],remaining_skill_ids:["docker","cicd","cloud","terraform","kubernetes","monitoring"],skills:[{skill_id:"linux",name:"Linux",required_proficiency:70,current_proficiency:85,confidence:.88,credited:true,shared:false,unique_to_role:false,prerequisites:[],remaining_prerequisites:[],estimated_minutes_min:0,estimated_minutes_max:0,evidence_refs:["passport:linux"],uncertainty:null},{skill_id:"docker",name:"Docker",required_proficiency:70,current_proficiency:45,confidence:.5,credited:false,shared:false,unique_to_role:true,prerequisites:["linux","networking"],remaining_prerequisites:[],estimated_minutes_min:330,estimated_minutes_max:570,evidence_refs:["passport:docker"],uncertainty:"Evidence confidence is limited."}],effort_hours_min:42,effort_hours_max:69,duration:{weeks_min:7,weeks_max:11.5,weekly_learning_minutes:weekly,target_date:"2027-02-12",target_fit:"likely_fits",available_weeks:12,explanation:"The current estimate fits inside the target window, subject to assumptions."},routes:[{route_type:"free",known_cost_min_usd:0,known_cost_max_usd:0,planning_budget_max_usd:0,unknown_price_count:0,resources:[],assumptions:["Only resources explicitly marked free are included."],missing_data:[]},{route_type:"low_cost",known_cost_min_usd:0,known_cost_max_usd:0,planning_budget_max_usd:150,unknown_price_count:0,resources:[],assumptions:["The planning envelope is a budget assumption."],missing_data:[]},{route_type:"certification_focused",known_cost_min_usd:0,known_cost_max_usd:null,planning_budget_max_usd:null,unknown_price_count:3,resources:[],assumptions:["Unknown exam prices are not guessed."],missing_data:["Exam price unknown"]}],reusable_evidence:[{skill_id:"linux",skill_name:"Linux",proficiency:85,confidence:.88,credited:true,evidence_refs:["passport:linux"],uncertainty:null}],assumptions:["Evidence credit assumption"],missing_data:["Exam price unknown"]},
 {role_id:"cloud-engineer",role_name:"Cloud Engineer",role_version:"2026-10-v2",shared_skill_ids:["cloud","networking","monitoring"],unique_skill_ids:["iac","containers"],transferable_skill_ids:["networking"],remaining_skill_ids:["cloud","iac","containers","monitoring"],skills:[{skill_id:"networking",name:"Cloud networking",required_proficiency:65,current_proficiency:80,confidence:.8,credited:true,shared:true,unique_to_role:false,prerequisites:["cloud"],remaining_prerequisites:["cloud"],estimated_minutes_min:0,estimated_minutes_max:0,evidence_refs:["passport:networking"],uncertainty:null}],effort_hours_min:31,effort_hours_max:49,duration:{weeks_min:5.2,weeks_max:8.2,weekly_learning_minutes:weekly,target_date:"2027-02-12",target_fit:"likely_fits",available_weeks:12,explanation:"The current estimate fits inside the target window, subject to assumptions."},routes:[{route_type:"free",known_cost_min_usd:0,known_cost_max_usd:0,planning_budget_max_usd:0,unknown_price_count:0,resources:[],assumptions:["Only resources explicitly marked free are included."],missing_data:[]},{route_type:"low_cost",known_cost_min_usd:0,known_cost_max_usd:0,planning_budget_max_usd:150,unknown_price_count:0,resources:[],assumptions:["The planning envelope is a budget assumption."],missing_data:[]},{route_type:"certification_focused",known_cost_min_usd:0,known_cost_max_usd:null,planning_budget_max_usd:null,unknown_price_count:1,resources:[],assumptions:["Unknown exam prices are not guessed."],missing_data:["Exam price unknown"]}],reusable_evidence:[],assumptions:["Evidence credit assumption"],missing_data:["Exam price unknown"]}],assumptions:["Approved taxonomy snapshot.","Missing evidence stays unknown."],uncertainty:["Some price metadata is missing."],active_pathway_unchanged:true,disclaimer:"Planning ranges only; not employment guarantees."}};}

async function mockShell(page:Page){
 await page.route("**/api/notifications/**",route=>route.fulfill({status:200,headers,body:JSON.stringify({items:[],unread_count:0,generated_at:"2026-11-20T10:00:00Z",partial:false,calendar_integration_available:true,student_id:"student-onboarded",timezone:"Asia/Colombo",quiet_hours_enabled:false,quiet_hours_start:"22:00",quiet_hours_end:"07:00",mute_non_critical:false,max_non_critical_per_day:6,max_non_critical_per_hour:3,in_app_enabled:true,push_enabled:false,push_permission_granted:false,email_enabled:false,email_consent:false,categories:{},updated_at:"2026-11-20T10:00:00Z",push_provider_available:false,email_provider_available:false,saved:true})}));
 await page.route("**/api/achievements**",route=>route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",catalogue_version:"2026-10-v1",preferences:{student_id:"student-onboarded",feature_visible:true,celebrations_enabled:false,streak_visible:true,updated_at:"2026-11-20T10:00:00Z"},awards:[],progress:[],streak:{current_count:0,longest_count:0,last_qualifying_date:null,grace_days_used:0,state:"empty",rule_version:"2026-10-v1",explanation:"",qualifying_dates:[]},new_awards:[],private_only:true,comparison_enabled:false,generated_at:"2026-11-20T10:00:00Z"})}));
}

async function mockScenarioApi(page:Page){
 let current=scenario();
 await page.route("**/api/career-scenarios/**",async route=>{const req=route.request();const path=new URL(req.url()).pathname;
  if(path.endsWith("/roles"))return route.fulfill({status:200,headers,body:JSON.stringify(roles)});
  if(path.endsWith("/recompute")){const body=req.postDataJSON() as {weekly_learning_minutes:number};current=scenario(body.weekly_learning_minutes);return route.fulfill({status:201,headers,body:JSON.stringify(current)});}
  if(path.endsWith("/saved")){current={...current,status:"saved",saved_at:"2026-11-20T10:05:00Z"};return route.fulfill({status:200,headers,body:JSON.stringify(current)});}
  if(path.endsWith("/switch-draft"))return route.fulfill({status:201,headers,body:JSON.stringify({scenario_id:"scenario-1",result_id:current.latest_result.id,target_role:"Cloud Engineer",draft_pathway_id:"path-draft-2",draft_pathway_version:2,draft_status:"draft",active_pathway_id:"path-1",active_pathway_version:1,active_pathway_unchanged:true,transferable_skill_ids:["networking"],approval_required:true,explanation:"A reviewable roadmap draft was created. Your active roadmap and career goal are unchanged until you approve that draft in Roadmap."})});
  if(path==="/api/career-scenarios"&&req.method()==="POST")return route.fulfill({status:201,headers,body:JSON.stringify(current)});
  return route.fulfill({status:200,headers,body:JSON.stringify(current)});
 });
}

test.beforeEach(async({page})=>{await seedExistingStudent(page);await mockShell(page);await mockScenarioApi(page);});

test("student compares careers and sees ranges, transferable skills and cost assumptions",async({page})=>{
 await page.goto("/career-compare");
 await expect(page.getByRole("heading",{name:"Compare career directions before you change course"})).toBeVisible();
 await page.getByRole("button",{name:"Compare careers"}).click();
 await expect(page.getByText("DevOps Engineer").first()).toBeVisible();
 await expect(page.getByText("Cloud Engineer").first()).toBeVisible();
 await expect(page.getByText("42–69 h")).toBeVisible();
 await page.getByText("Learning and cost routes").first().click();
 await expect(page.getByText("Certification-focused route").first()).toBeVisible();
 await expect(page.getByText(/price\(s\) are unknown/i).first()).toBeVisible();
});

test("availability recomputation preserves the scenario and switching creates only a draft",async({page})=>{
 await page.goto("/career-compare"); await page.getByRole("button",{name:"Compare careers"}).click();
 const hours=page.getByLabel("Weekly learning availability"); await hours.fill("12");
 await page.getByRole("button",{name:"Recompute scenario"}).click();
 await expect(page.getByText("Scenario recalculated. The earlier result is preserved unchanged.")).toBeVisible();
 await page.getByRole("button",{name:"Choose as pathway draft"}).nth(1).click();
 await expect(page.getByText(/creates a reviewable draft only/i)).toBeVisible();
 await page.getByText(/I understand this creates a draft only/i).locator("..").getByRole("checkbox").check();
 await page.getByRole("button",{name:"Create reviewable draft"}).click();
 await expect(page.getByText("Pathway draft created — active roadmap unchanged")).toBeVisible();
 await expect(page.getByRole("link",{name:/Review in Roadmap/})).toBeVisible();
});

test("career comparison stays narrow-screen safe",async({page})=>{
 await page.setViewportSize({width:360,height:800});await page.goto("/career-compare");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)).toBe(false);
});
