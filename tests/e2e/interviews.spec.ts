import { expect, test } from "@playwright/test";
import { seedExistingStudent } from "./seed-existing-student";

test("interview practice supports keyboard setup, timed answer flow and feedback recovery", async ({ page }) => {
  await seedExistingStudent(page);
  const session={id:"int-e2e",role:"DevOps Engineer",level:"intern",round_type:"technical",template_version:"2026-10-v1",rubric_version:"2026-10-v1",status:"ready",question_time_seconds:60,max_followups_per_question:1,current_question_id:null,current_question_started_at:null,current_question_elapsed_seconds:0,pause_count:0,max_pause_count:3,questions:[{id:"q1",prompt:"Explain how you would verify a Docker deployment.",round_type:"technical",skill_ids:["docker"],skill_names:["Docker"],evidence_refs:["cv_analysis:test:skill:docker:cv_evidenced"],is_followup:false,parent_question_id:null,sequence:10,time_limit_seconds:60}],responses:[],feedback:null,feedback_error:null,recording_mode:"text",store_recordings:false,recording_storage_status:"not_applicable",retention_days:30,expires_at:"2026-11-01T00:00:00Z",created_at:"2026-10-02T00:00:00Z",updated_at:"2026-10-02T00:00:00Z"};
  await page.route("**/api/interviews/sessions**", async route=>{
    const url=route.request().url(), method=route.request().method();
    if(method==="GET" && /sessions$/.test(url)) return route.fulfill({json:{items:[session]}});
    if(url.endsWith("/start")) return route.fulfill({json:{...session,status:"running",current_question_id:"q1",current_question_started_at:new Date().toISOString()}});
    if(url.endsWith("/answers")) return route.fulfill({json:{...session,status:"running",current_question_id:null,responses:[{id:"r1",question_id:"q1",answer_text:"I verify health checks and logs.",started_at:new Date().toISOString(),submitted_at:new Date().toISOString(),active_seconds:12,timed_out:false}]}});
    if(url.endsWith("/complete")) return route.fulfill({json:{...session,status:"feedback_ready",current_question_id:null,responses:[{id:"r1",question_id:"q1",answer_text:"I verify health checks and logs.",started_at:new Date().toISOString(),submitted_at:new Date().toISOString(),active_seconds:12,timed_out:false}],feedback:{rubric_version:"2026-10-v1",generated_at:new Date().toISOString(),overall_practice_score:70,rubric_results:[{criterion:"communication",score:4,rationale:"Clear text",evidence_excerpt:"I verify health checks",response_id:"r1"}],items:[{kind:"study_topic",title:"Docker verification",detail:"Review health checks.",refs:["response:r1","rubric:communication:r1"]}],illustrative_answer_structure:["Context","Action","Evidence","Next step"],disclaimer:"This is automated practice feedback, not an employment decision.",uncertainty_note:"Text-only rubric."}}});
    return route.continue();
  });
  await page.goto("/interviews");
  await expect(page.getByRole("heading",{name:"Interview Practice"})).toBeVisible();
  await page.getByRole("button",{name:"Start interview"}).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Explain how you would verify a Docker deployment.")).toBeVisible();
  await page.getByLabel("Your answer").fill("I verify health checks and logs.");
  await page.getByRole("button",{name:"Save answer"}).click();
  await page.getByRole("button",{name:"Complete and review"}).click();
  await expect(page.getByText("Practice rubric indicator")).toBeVisible();
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBeTruthy();
});
