import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers={"content-type":"application/json"};
const evidence={id:"ev-docker",skill_id:"docker",skill_name:"Docker",evidence_type:"repository",title:"Container API",verification_status:"observed",confidence:0.84,proficiency:78,freshness:"fresh",readiness_contribution:55.7,provenance:{source:"portfolio",source_ref:"portfolio:snap-1:docker",source_url:"https://github.com/example/container-api",issuer:null,acquired_at:null,expires_at:null,observed_at:"2026-11-03T06:00:00Z",last_reviewed_at:null,reference_hash:"a".repeat(64)},correction_note:"",can_edit:true,can_revalidate:true};
const certificate={...evidence,id:"ev-git",skill_id:"git",skill_name:"Git",evidence_type:"certificate",title:"Git Fundamentals",verification_status:"self_declared",confidence:0.5,proficiency:65,readiness_contribution:14.6,provenance:{...evidence.provenance,source:"certificate",source_ref:"certificate:cert-1",source_url:null,issuer:"Example Academy",reference_hash:"b".repeat(64)}};
const dashboard={generated_at:"2026-11-03T06:00:00Z",skills:[{skill_id:"docker",skill_name:"Docker",required_proficiency:70,assessed_proficiency:78,readiness_score:72,status:"supported",evidence:[evidence],gap_explanation:"Observed repository evidence supports this skill."},{skill_id:"git",skill_name:"Git",required_proficiency:70,assessed_proficiency:65,readiness_score:35,status:"limited",evidence:[certificate],gap_explanation:"Only self-declared evidence is currently linked."}],total_evidence:2,verified_or_observed:1,stale_or_expired:0,disputed:0,disclaimer:"Evidence Passport reports provenance and verification meaning; it does not guarantee credential authenticity, professional proficiency, or employment outcomes."};

async function mockShell(page:Page){
  await page.route("**/api/notifications/**",async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith("/inbox"))return route.fulfill({status:200,headers,body:JSON.stringify({items:[],unread_count:0,generated_at:"2026-11-03T06:00:00Z",partial:false,calendar_integration_available:true})});if(path.endsWith("/preferences"))return route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",timezone:"Asia/Colombo",quiet_hours_enabled:true,quiet_hours_start:"22:00",quiet_hours_end:"07:00",mute_non_critical:false,max_non_critical_per_day:6,max_non_critical_per_hour:3,in_app_enabled:true,push_enabled:false,push_permission_granted:false,email_enabled:false,email_consent:false,categories:{deadline:true,risk:true,top_priority:true,missed_work:true,study_session:true,application_date:true,roadmap_milestone:true,calendar_event:true},updated_at:"2026-11-03T06:00:00Z",push_provider_available:false,email_provider_available:false})});if(path.endsWith("/candidates/sync"))return route.fulfill({status:200,headers,body:JSON.stringify({accepted:0,deduplicated:0,resolved:0,expired:0,delivered:0,suppressed:0,failed:0})});return route.fulfill({status:200,headers,body:"{}"});});
  await page.route("**/api/achievements**",route=>route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",catalogue_version:"2026-10-v1",preferences:{student_id:"student-onboarded",feature_visible:true,celebrations_enabled:false,streak_visible:true,updated_at:"2026-11-03T06:00:00Z"},awards:[],progress:[],streak:{current_count:0,longest_count:0,last_qualifying_date:null,grace_days_used:0,state:"empty",rule_version:"2026-10-v1",explanation:"",qualifying_dates:[]},new_awards:[],private_only:true,comparison_enabled:false,generated_at:"2026-11-03T06:00:00Z"})}));
}

async function mockEvidenceApi(page:Page){
  let shares:any[]=[];
  await page.route("**/api/evidence-passport**",async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path==="/api/evidence-passport")return route.fulfill({status:200,headers,body:JSON.stringify(dashboard)});
    if(path.endsWith("/shares")&&req.method()==="GET")return route.fulfill({status:200,headers,body:JSON.stringify(shares)});
    if(path.endsWith("/shares")&&req.method()==="POST"){const body=req.postDataJSON() as {evidence_ids:string[]};shares=[{id:"share-1",label:"Recruiter evidence share",evidence_ids:body.evidence_ids,created_at:"2026-11-03T06:00:00Z",expires_at:"2026-11-10T06:00:00Z",revoked_at:null,status:"active",access_count:0}];return route.fulfill({status:201,headers,body:JSON.stringify({share:shares[0],share_token:"share-token-1"})});}
    if(path.endsWith("/access-history"))return route.fulfill({status:200,headers,body:JSON.stringify([])});
    if(path.endsWith("/mentor-validation-requests"))return route.fulfill({status:200,headers,body:JSON.stringify([])});
    if(path.endsWith("/sync"))return route.fulfill({status:200,headers,body:JSON.stringify({status:"synced",synced_at:"2026-11-03T06:00:00Z"})});
    if(path.includes("/shares/share-1/revoke")){shares=[{...shares[0],status:"revoked",revoked_at:"2026-11-03T06:05:00Z"}];return route.fulfill({status:200,headers,body:JSON.stringify(shares[0])});}
    return route.fulfill({status:200,headers,body:"{}"});
  });
  await page.route("**/api/mentors/relationships",route=>route.fulfill({status:200,headers,body:JSON.stringify([])}));
  await page.route("**/api/careers/roles/**",route=>route.fulfill({status:200,headers,body:JSON.stringify({id:"devops-engineer",slug:"devops-engineer",name:"DevOps Engineer",description:"",version:"2026-10-v2",skills:[{skill_id:"git",name:"Git",required_proficiency:70,prerequisites:[],recommended_evidence:[]},{skill_id:"docker",name:"Docker",required_proficiency:70,prerequisites:["git"],recommended_evidence:[]}],published_at:"2026-10-31T00:00:00Z"})}));
  await page.route("**/api/evidence-share/share-token-1",route=>route.fulfill({status:200,headers,body:JSON.stringify({share_id:"share-1",label:"Recruiter evidence share",generated_at:"2026-11-03T06:00:00Z",expires_at:"2026-11-10T06:00:00Z",evidence:[evidence],disclaimer:dashboard.disclaimer})}));
}

test.beforeEach(async({page})=>{await seedExistingStudent(page);await mockShell(page);await mockEvidenceApi(page);});

test("student can select one evidence item and create a scoped recruiter share",async({page})=>{
  await page.goto("/evidence");
  await expect(page.getByRole("heading",{name:"Skills backed by evidence"})).toBeVisible();
  await page.getByLabel("Select Container API for export or sharing").check();
  await page.getByRole("button",{name:"Share selected"}).click();
  await expect(page.getByText("Private share link ready")).toBeVisible();
  await expect(page.locator('input[value*="evidence-share/share-token-1"]')).toBeVisible();
  await page.goto("/evidence-share/share-token-1");
  await expect(page.getByText("Container API")).toBeVisible();
  await expect(page.getByText("Git Fundamentals")).toHaveCount(0);
  await expect(page.getByText(/only evidence explicitly selected by the student/i)).toBeVisible();
});

test("student can revoke an active evidence share",async({page})=>{
  await page.goto("/evidence");
  await page.getByLabel("Select Container API for export or sharing").check();
  await page.getByRole("button",{name:"Share selected"}).click();
  await page.getByRole("button",{name:"Revoke now"}).click();
  await expect(page.getByText("revoked")).toBeVisible();
});

test("evidence passport is keyboard reachable and narrow-screen safe",async({page})=>{
  await page.setViewportSize({width:360,height:800});await page.goto("/evidence");
  const sync=page.getByRole("button",{name:"Sync evidence"});await sync.focus();await expect(sync).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)).toBe(false);
});
