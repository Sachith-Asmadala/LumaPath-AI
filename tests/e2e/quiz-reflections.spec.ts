import { expect, test } from '@playwright/test';
import { seedExistingStudent } from './seed-existing-student';
import { baselineQuestions } from '../../src/features/assessment/domain/baseline-assessment';
import { knowledgeResponses } from '../../src/features/assessment/domain/knowledge-responses';

test('every baseline question accepts both reflection choices and preserves them without awarding points', async ({page}) => {
  test.setTimeout(90_000);
  await seedExistingStudent(page);
  await page.goto('/assessment');
  for(let index=0;index<baselineQuestions.length;index++) {
    const group=page.getByRole('group',{name:baselineQuestions[index].question});
    for(const answer of knowledgeResponses) await expect(group.getByRole('radio',{name:answer,exact:true})).toBeAttached();
    await group.getByRole('radio',{name:knowledgeResponses[index%2],exact:true}).press('Space');
    if(index===0){
      await page.reload();
      await expect(group.getByRole('radio',{name:knowledgeResponses[0],exact:true})).toBeChecked();
    }
    await page.getByRole('button',{name:index===baselineQuestions.length-1?'Submit Assessment':'Next',exact:true}).click();
  }
  await expect(page).toHaveURL(/\/assessment\/results$/);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lumapath-baseline-v1')!));
  expect(saved.overallScore).toBe(0);
  expect(saved.correctCount).toBe(0);
  expect(Object.values(saved.answers)).toContain(knowledgeResponses[0]);
  expect(Object.values(saved.answers)).toContain(knowledgeResponses[1]);
});
