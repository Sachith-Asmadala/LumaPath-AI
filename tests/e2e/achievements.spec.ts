import { expect, test, type Page } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

const headers={"content-type":"application/json"};

async function mockNotifications(page:Page){
  await page.route("**/api/notifications/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith("/inbox")) return route.fulfill({status:200,headers,body:JSON.stringify({items:[],unread_count:0,generated_at:"2026-11-05T12:00:00Z",partial:false,calendar_integration_available:true})});
    if(path.endsWith("/preferences")) return route.fulfill({status:200,headers,body:JSON.stringify({student_id:"student-onboarded",timezone:"Asia/Colombo",quiet_hours_enabled:true,quiet_hours_start:"22:00",quiet_hours_end:"07:00",mute_non_critical:false,max_non_critical_per_day:6,max_non_critical_per_hour:3,in_app_enabled:true,push_enabled:false,push_permission_granted:false,email_enabled:false,email_consent:false,categories:{deadline:true,risk:true,top_priority:true,missed_work:true,study_session:true,application_date:true,roadmap_milestone:true,calendar_event:true},updated_at:"2026-11-05T12:00:00Z",push_provider_available:false,email_provider_available:false})});
    if(path.endsWith("/candidates/sync")) return route.fulfill({status:200,headers,body:JSON.stringify({accepted:0,deduplicated:0,resolved:0,expired:0,delivered:0,suppressed:0,failed:0})});
    return route.fulfill({status:200,headers,body:JSON.stringify({saved:true})});
  });
}

function dashboard(overrides:Record<string,unknown>={}){
  return {student_id:"student-onboarded",catalogue_version:"2026-10-v1",preferences:{student_id:"student-onboarded",feature_visible:true,celebrations_enabled:false,streak_visible:true,updated_at:"2026-11-05T12:00:00Z"},awards:[{id:"a1",definition_key:"deadline.on_time",definition_version:"2026-10-v1",title:"Deadline handled",description:"Completed a dated task on or before its recorded deadline.",category:"deadline",awarded_at:"2026-11-04T12:00:00Z",evidence_status:"active",evidence:[{source_type:"task",source_id:"task-1",occurred_at:"2026-11-04T12:00:00Z",href:"/tasks",label:"Task completed by its recorded deadline",verified:true}],restored_at:null}],progress:[{definition:{key:"deadline.on_time",version:"2026-10-v1",category:"deadline",title:"Deadline handled",description:"Completed a dated task on or before its recorded deadline.",target:1,unit:"on-time completion",optional_career:false},current:1,target:1,complete:true,evidence:[]},{definition:{key:"study.consistency_three",version:"2026-10-v1",category:"study",title:"Steady study rhythm",description:"Recorded focused study on three qualifying days, with one grace day allowed between study days.",target:3,unit:"qualifying study days",optional_career:false},current:2,target:3,complete:false,evidence:[]}],streak:{current_count:2,longest_count:2,last_qualifying_date:"2026-11-05",grace_days_used:1,state:"active",rule_version:"2026-10-v1",explanation:"One grace day is allowed.",qualifying_dates:["2026-11-03","2026-11-05"]},new_awards:[],private_only:true,comparison_enabled:false,generated_at:"2026-11-05T12:00:00Z",...overrides};
}

async function mockAchievements(page:Page){
  let data=dashboard();
  await page.route("**/api/achievements**",async route=>{
    const req=route.request(); const path=new URL(req.url()).pathname;
    if(path.endsWith("/preferences")&&req.method()==="PUT"){
      data={...data,preferences:{...(data.preferences as Record<string,unknown>),...req.postDataJSON(),updated_at:"2026-11-05T12:01:00Z"}};
      return route.fulfill({status:200,headers,body:JSON.stringify(data)});
    }
    return route.fulfill({status:200,headers,body:JSON.stringify(data)});
  });
}

test.beforeEach(async({page})=>{await seedExistingStudent(page);await mockNotifications(page);await mockAchievements(page);});

test("achievements stay private, evidence-linked and celebrations are opt-in",async({page})=>{
  await page.goto("/achievements");
  await expect(page.getByRole("heading",{name:"Achievements & consistency"})).toBeVisible();
  await expect(page.getByText("Private to you")).toBeVisible();
  await expect(page.getByText("Deadline handled")).toBeVisible();
  await expect(page.getByRole("link",{name:/Task completed by its recorded deadline/})).toHaveAttribute("href","/tasks");
  await expect(page.getByText(/does not rank you against other students/i)).toBeVisible();
  const celebrationRow=page.getByText("Private celebrations").locator("..");
  await expect(celebrationRow.getByRole("button",{name:"Off"})).toBeVisible();
  await celebrationRow.getByRole("button",{name:"Off"}).click();
  await expect(celebrationRow.getByRole("button",{name:"On"})).toBeVisible();
});

test("student can hide and restore the feature without loss language",async({page})=>{
  await page.goto("/achievements");
  await page.getByRole("button",{name:"Hide achievements"}).click();
  await expect(page.getByRole("heading",{name:"Achievements are hidden"})).toBeVisible();
  await expect(page.getByText(/records remain private and intact/i)).toBeVisible();
  await page.getByRole("button",{name:"Show achievements again"}).click();
  await expect(page.getByRole("heading",{name:"Achievements & consistency"})).toBeVisible();
});

test("achievements controls are keyboard reachable and narrow-screen safe",async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto("/achievements");
  const button=page.getByRole("button",{name:"Refresh"}); await button.focus(); await expect(button).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)).toBe(false);
});
