import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers={"content-type":"application/json"};
const role={id:"devops-engineer",name:"DevOps Engineer",version:"2026-10-v2",level:"entry_to_junior",description:"Build, automate, deliver and observe reliable software infrastructure.",quality_status:"approved",skill_count:3,skills:[
  {skill_id:"linux",name:"Linux",required_proficiency:70,prerequisites:[],estimated_minutes:600,recommended_evidence:["Show Linux troubleshooting evidence."]},
  {skill_id:"networking",name:"Networking",required_proficiency:65,prerequisites:["linux"],estimated_minutes:600,recommended_evidence:["Explain DNS and HTTP flows."]},
  {skill_id:"docker",name:"Docker",required_proficiency:70,prerequisites:["linux","networking"],estimated_minutes:1080,recommended_evidence:["Show a containerized service."]},
]};
const assessment={id:"assess-1",target_role:"DevOps Engineer",taxonomy_version:"2026-10-v2",created_at:"2026-11-01T08:00:00Z",gap_order:["networking","docker"],conflicting_skills:[],disclaimer:"Skill estimates are planning signals, not hiring decisions.",skills:[
  {skill_id:"linux",name:"Linux",proficiency:82,confidence:0.72,required_proficiency:70,gap:0,meets_requirement:true,uncertainty:null,evidence:[{id:"e1",source_type:"quiz",verification_status:"observed",proficiency:82,confidence:0.68,source_ref:"quiz:q1",source_label:"LumaPath quiz result",observed_at:"2026-11-01T08:00:00Z"}]},
  {skill_id:"networking",name:"Networking",proficiency:58,confidence:0.35,required_proficiency:65,gap:7,meets_requirement:false,uncertainty:"Evidence confidence is limited; treat this as a planning estimate.",evidence:[{id:"e2",source_type:"self_assessment",verification_status:"self_reported",proficiency:58,confidence:0.35,source_ref:"self:networking",source_label:"Student self-assessment",observed_at:"2026-11-01T08:00:00Z"}]},
  {skill_id:"docker",name:"Docker",proficiency:45,confidence:0.35,required_proficiency:70,gap:25,meets_requirement:false,uncertainty:"Evidence confidence is limited; treat this as a planning estimate.",evidence:[{id:"e3",source_type:"self_assessment",verification_status:"self_reported",proficiency:45,confidence:0.35,source_ref:"self:docker",source_label:"Student self-assessment",observed_at:"2026-11-01T08:00:00Z"}]},
]};

async function mockShell(page:Page){
 await page.route("**/api/notifications/**",async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith("/inbox"))return route.fulfill({status:200,headers,body:JSON.stringify({items:[],unread_count:0,generated_at:"2026-11-01T08:00:00Z",partial:false,calendar_integration_available:true})});if(path.endsWith("/preferences"))return route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",timezone:"Asia/Colombo",quiet_hours_enabled:true,quiet_hours_start:"22:00",quiet_hours_end:"07:00",mute_non_critical:false,max_non_critical_per_day:6,max_non_critical_per_hour:3,in_app_enabled:true,push_enabled:false,push_permission_granted:false,email_enabled:false,email_consent:false,categories:{deadline:true,risk:true,top_priority:true,missed_work:true,study_session:true,application_date:true,roadmap_milestone:true,calendar_event:true},updated_at:"2026-11-01T08:00:00Z",push_provider_available:false,email_provider_available:false})});if(path.endsWith("/candidates/sync"))return route.fulfill({status:200,headers,body:JSON.stringify({accepted:0,deduplicated:0,resolved:0,expired:0,delivered:0,suppressed:0,failed:0})});return route.fulfill({status:200,headers,body:JSON.stringify({saved:true})});});
 await page.route("**/api/achievements**",route=>route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",catalogue_version:"2026-10-v1",preferences:{student_id:"student-onboarded",feature_visible:true,celebrations_enabled:false,streak_visible:true,updated_at:"2026-11-01T08:00:00Z"},awards:[],progress:[],streak:{current_count:0,longest_count:0,last_qualifying_date:null,grace_days_used:0,state:"empty",rule_version:"2026-10-v1",explanation:"",qualifying_dates:[]},new_awards:[],private_only:true,comparison_enabled:false,generated_at:"2026-11-01T08:00:00Z"})}));
}

async function mockCareer(page:Page){
 let hasAssessment=false;
 await page.route("**/api/careers/**",async route=>{const req=route.request(),path=new URL(req.url()).pathname;
   if(path==="/api/careers/roles")return route.fulfill({status:200,headers,body:JSON.stringify([{...role,skills:undefined}].map(({skills,...rest})=>rest))});
   if(path.includes("/api/careers/roles/"))return route.fulfill({status:200,headers,body:JSON.stringify(role)});
   if(path.endsWith("/assessments/current"))return hasAssessment?route.fulfill({status:200,headers,body:JSON.stringify(assessment)}):route.fulfill({status:404,headers,body:JSON.stringify({detail:"No skill assessment exists for this career role yet."})});
   if(path.endsWith("/assessments")){hasAssessment=true;return route.fulfill({status:201,headers,body:JSON.stringify(assessment)});}
   if(path.includes("/resources/rank"))return route.fulfill({status:200,headers,body:JSON.stringify({skill_id:"networking",taxonomy_version:"2026-10-v2",missing_metadata_warning:false,resources:[{id:"networking-mdn",skill_id:"networking",title:"How does the Internet work?",source:"MDN",source_url:"https://developer.mozilla.org",resource_type:"tutorial",quality_score:88,cost_type:"free",price_usd:0,language:"English",format:"reading",estimated_minutes:120,fit_score:85,ranking_factors:["editorial quality 88/100","matches language preference"],metadata_complete:true,quality_note:"Editorial quality is a catalogue signal."}]})});
   return route.fulfill({status:404,headers,body:JSON.stringify({detail:`unmocked ${path}`})});
 });
}

test.beforeEach(async({page})=>{await seedExistingStudent(page);await mockShell(page);await mockCareer(page);});

test("student reviews versioned requirements then creates evidence-aware assessment",async({page})=>{
 await page.goto("/career-path");
 await expect(page.getByRole("heading",{name:"Build a pathway from verified requirements"})).toBeVisible();
 await expect(page.getByText("Taxonomy 2026-10-v2")).toBeVisible();
 await expect(page.getByText("Required 70%").first()).toBeVisible();
 await expect(page.getByText(/No server-owned assessment exists/i)).toBeVisible();
 await page.getByRole("button",{name:"Run skill assessment"}).click();
 await expect(page.getByText("Skill assessment updated from the evidence currently available.")).toBeVisible();
 await expect(page.getByText("LumaPath quiz result")).toBeVisible();
 await expect(page.getByText("Confidence 72%")).toBeVisible();
 await expect(page.getByText("How does the Internet work?")).toBeVisible();
});

test("career engine remains keyboard reachable and narrow-screen safe",async({page})=>{
 await page.setViewportSize({width:360,height:800}); await page.goto("/career-path");
 const roleSelect=page.getByLabel("Target career role"); await roleSelect.focus(); await expect(roleSelect).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)).toBe(false);
});
