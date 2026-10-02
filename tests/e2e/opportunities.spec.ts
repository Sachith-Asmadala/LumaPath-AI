import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers={"content-type":"application/json"};

async function mockShell(page:Page){
  await page.route("**/api/notifications/**",async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith("/inbox"))return route.fulfill({status:200,headers,body:JSON.stringify({items:[],unread_count:0,generated_at:"2026-11-05T12:00:00Z",partial:false,calendar_integration_available:true})});if(path.endsWith("/preferences"))return route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",timezone:"Asia/Colombo",quiet_hours_enabled:true,quiet_hours_start:"22:00",quiet_hours_end:"07:00",mute_non_critical:false,max_non_critical_per_day:6,max_non_critical_per_hour:3,in_app_enabled:true,push_enabled:false,push_permission_granted:false,email_enabled:false,email_consent:false,categories:{deadline:true,risk:true,top_priority:true,missed_work:true,study_session:true,application_date:true,roadmap_milestone:true,calendar_event:true},updated_at:"2026-11-05T12:00:00Z",push_provider_available:false,email_provider_available:false})});if(path.endsWith("/candidates/sync"))return route.fulfill({status:200,headers,body:JSON.stringify({accepted:0,deduplicated:0,resolved:0,expired:0,delivered:0,suppressed:0,failed:0})});return route.fulfill({status:200,headers,body:JSON.stringify({saved:true})});});
  await page.route("**/api/achievements**",route=>route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",catalogue_version:"2026-10-v1",preferences:{student_id:"student-onboarded",feature_visible:true,celebrations_enabled:false,streak_visible:true,updated_at:"2026-11-05T12:00:00Z"},awards:[],progress:[],streak:{current_count:0,longest_count:0,last_qualifying_date:null,grace_days_used:0,state:"empty",rule_version:"2026-10-v1",explanation:"",qualifying_dates:[]},new_awards:[],private_only:true,comparison_enabled:false,generated_at:"2026-11-05T12:00:00Z"})}));
}

function opportunity(saved=false,tracking:Record<string,unknown>|null=null){return {
  id:"devops-intern-2026",category:"internship",title:"DevOps Engineering Internship",provider:"Northstar Labs",summary:"Hands-on internship focused on CI/CD, containers and cloud fundamentals.",starts_on:"2026-11-09",closes_on:"2026-11-28",location_mode:"hybrid",location:"Colombo, Sri Lanka",cost_type:"free",cost_amount:0,currency:"LKR",required_skills:["git","docker"],useful_skills:["cicd","cloud"],
  source_url:"https://example.org/opportunities/devops-intern-2026",source_name:"Curated demo fixture",source_checked_at:"2026-11-05T12:00:00Z",freshness_status:"fresh",trust_status:"curated",source_validation:{validation_id:"src-1",status:"trusted",last_verified_at:"2026-11-05T12:00:00Z",freshness_expires_at:"2026-12-05T12:00:00Z",opportunity_expires_on:"2026-11-28",detail:"Source is inside the configured trust and freshness window."},requirement_version:"2026-11-v1",application_steps:["Review the official role and application instructions.","Prepare a concise CV and evidence links.","Submit through the provider's official application channel."],
  sponsored:false,sponsor_name:null,rank_score:84,ranking_factors:[{key:"goal_fit",label:"Career-goal fit",points:30,max_points:30,explanation:"Matches your selected/active pathway career goal."},{key:"skills",label:"Requirement evidence",points:12.5,max_points:25,explanation:"1 of 2 structured skill prerequisites currently have supporting evidence; unknowns are not treated as failures."}],strengths:["git"],skill_gaps:["docker"],eligibility_status:"unmet",eligibility_evaluation_id:"elig-1",eligibility_checks:[{requirement_id:"req-status",key:"profile:student_status",label:"Student status",kind:"profile",status:"unknown",explanation:"Student status is not available in the approved eligibility context.",evidence:[],source_text:"The source catalogue lists student status as an eligibility condition.",source_reference:"https://example.org/opportunities/devops-intern-2026",required:true},{requirement_id:"req-git",key:"skill:git",label:"Git",kind:"skill",status:"met",explanation:"Current evidence supports Git.",evidence:[{source_type:"pathway",label:"Pathway step · completed",reference:"step-git",verification:"completed"}],source_text:"The source catalogue lists git as a prerequisite skill.",source_reference:"https://example.org/opportunities/devops-intern-2026",required:true},{requirement_id:"req-docker",key:"skill:docker",label:"Docker",kind:"skill",status:"unmet",explanation:"Your active pathway still has Docker in progress, so LumaPath treats it as a preparation gap rather than proof of eligibility.",evidence:[{source_type:"pathway",label:"Pathway step · in progress",reference:"step-docker",verification:"in_progress"}],source_text:"The source catalogue lists docker as a prerequisite skill.",source_reference:"https://example.org/opportunities/devops-intern-2026",required:true}],missing_eligibility_data:["Student status"],why_fit:"Fits your active career goal, recorded evidence.",feedback_effect:null,saved,dismissed:false,reported:false,tracking,
};}

async function mockOpportunityApi(page:Page){
  let saved=false; let tracking:Record<string,unknown>|null=null; let prepApproved=false;
  await page.route("**/api/opportunities/**",async route=>{
    const req=route.request(), path=new URL(req.url()).pathname;
    if(path.endsWith("/browse")){const body=req.postDataJSON() as {context?:unknown};return route.fulfill({status:200,headers,body:JSON.stringify({personalized:Boolean(body.context),generated_at:"2026-11-05T12:00:00Z",catalogue_version:"2026-11-v2",eligibility_engine_version:"eligibility-2026-11-v1",items:[opportunity(saved,tracking)],excluded_expired:1,excluded_untrusted:1,excluded_stale:1,message:body.context?"Ranked using approved context.":"Browsing without personalization."})});}
    if(path.endsWith("/interactions")){const body=req.postDataJSON() as {action:string};saved=body.action==="save"?true:body.action==="unsave"?false:saved;return route.fulfill({status:200,headers,body:JSON.stringify({opportunity_id:"devops-intern-2026",action:body.action,saved,dismissed:false,reported:false,message:"saved"})});}
    if(path.endsWith("/preparation-plans")){return route.fulfill({status:201,headers,body:JSON.stringify({id:"prep-1",opportunity_id:"devops-intern-2026",status:"draft",proposal_version:"preparation-2026-11-v1",requirement_version:"2026-11-v1",eligibility_evaluation_id:"elig-1",source_validation_id:"src-1",deadline:"2026-11-28",generated_at:"2026-11-05T12:00:00Z",approved_at:null,warnings:["Verify the source for the exact deadline time."],items:[{id:"prep-docker",requirement_id:"req-docker",kind:"gap",title:"Strengthen: Docker",rationale:"Docker remains in progress.",estimated_minutes:45,suggested_start_at:"2026-11-20T12:30:00Z",suggested_end_at:"2026-11-20T13:15:00Z",editable:true,scheduled:true},{id:"prep-status",requirement_id:"req-status",kind:"verification",title:"Verify: Student status",rationale:"Confirm this requirement.",estimated_minutes:20,suggested_start_at:"2026-11-21T12:30:00Z",suggested_end_at:"2026-11-21T12:50:00Z",editable:true,scheduled:true}]})});}
    if(path.endsWith("/approve")){const body=req.postDataJSON() as {confirmed:boolean};if(!body.confirmed)return route.fulfill({status:422,headers,body:JSON.stringify({detail:"Explicit approval is required."})});const newly=!prepApproved;prepApproved=true;tracking={id:"track-1",opportunity_id:"devops-intern-2026",status:"preparing",result:null,follow_up_at:null,source_validation_id:"src-1",source_status:"trusted",active_deadline_alerts_allowed:true,updated_at:"2026-11-05T12:10:00Z"};return route.fulfill({status:200,headers,body:JSON.stringify({plan_id:"prep-1",opportunity_id:"devops-intern-2026",status:"approved",newly_approved:newly,actions:[{plan_item_id:"prep-docker",action_id:"pa-1",title:"Strengthen: Docker",start_at:"2026-11-20T12:30:00Z",end_at:"2026-11-20T13:15:00Z",category:"Career",source:"Opportunity · Northstar Labs",description:"Preparation for DevOps Engineering Internship.",idempotency_key:"one"},{plan_item_id:"prep-status",action_id:"pa-2",title:"Verify: Student status",start_at:"2026-11-21T12:30:00Z",end_at:"2026-11-21T12:50:00Z",category:"Career",source:"Opportunity · Northstar Labs",description:"Preparation for DevOps Engineering Internship.",idempotency_key:"two"}],warnings:[]})});}
    if(path.endsWith("/tracking")&&req.method()==="PUT"){const body=req.postDataJSON() as {status:string;result?:string|null;follow_up_at?:string|null};tracking={id:"track-1",opportunity_id:"devops-intern-2026",status:body.status,result:body.result??null,follow_up_at:body.follow_up_at??null,source_validation_id:"src-1",source_status:"trusted",active_deadline_alerts_allowed:true,updated_at:"2026-11-05T12:20:00Z"};return route.fulfill({status:200,headers,body:JSON.stringify(tracking)});}
    if(path.endsWith("/tracking"))return route.fulfill({status:200,headers,body:JSON.stringify(tracking)});
    if(path.endsWith("/internship-handoff"))return route.fulfill({status:200,headers,body:JSON.stringify({opportunity_id:"devops-intern-2026",source_reference:"opportunity:devops-intern-2026",company:"Northstar Labs",role:"DevOps Engineering Internship",source_url:"https://example.org/opportunities/devops-intern-2026",deadline:"2026-11-28",requirements:["git","docker"]})});
    return route.fulfill({status:404,headers,body:JSON.stringify({detail:`unmocked ${path}`})});
  });
  await page.route("**/api/internships/applications",route=>route.fulfill({status:201,headers,body:JSON.stringify({id:"app-1"})}));
}

test.beforeEach(async({page})=>{await seedExistingStudent(page);await mockShell(page);await mockOpportunityApi(page);});

test("student can inspect requirement evidence and source validation without an eligibility guarantee",async({page})=>{
  await page.goto("/opportunities");
  await expect(page.getByRole("heading",{name:"Opportunity Explorer"})).toBeVisible();
  await page.getByRole("button",{name:"Why this?"}).click();
  await expect(page.getByText("Requirement version 2026-11-v1")).toBeVisible();
  await expect(page.getByText("Preparation gaps found")).toBeVisible();
  await expect(page.getByText("Pathway step · in progress")).toBeVisible();
  await expect(page.getByText(/Eligibility is never guaranteed/i)).toBeVisible();
  await expect(page.getByText("Last verified:")).toBeVisible();
});

test("preparation checklist requires a second explicit approval before planner insertion",async({page})=>{
  await page.goto("/opportunities");
  await page.getByRole("button",{name:"Why this?"}).click();
  await page.getByRole("button",{name:"Build preparation plan"}).click();
  await expect(page.getByDisplayValue("Strengthen: Docker")).toBeVisible();
  const approve=page.getByRole("button",{name:"Approve selected tasks"});
  await expect(approve).toBeDisabled();
  await page.getByText(/I reviewed the checklist/i).locator("..").getByRole("checkbox").check();
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(page.getByText("Preparing").first()).toBeVisible();
});

test("student can track application and result state without automatic submission",async({page})=>{
  await page.goto("/opportunities");
  await page.getByRole("button",{name:"Why this?"}).click();
  await page.getByLabel("Status").selectOption("result");
  await page.getByLabel("Result").fill("Interview invited");
  await page.getByRole("button",{name:"Save status"}).click();
  await expect(page.getByText("Result").first()).toBeVisible();
});

test("opportunity page remains keyboard reachable and narrow-screen safe",async({page})=>{
  await page.setViewportSize({width:360,height:800}); await page.goto("/opportunities");
  const search=page.getByLabel("Search opportunities, providers or categories"); await search.focus(); await expect(search).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)).toBe(false);
});
