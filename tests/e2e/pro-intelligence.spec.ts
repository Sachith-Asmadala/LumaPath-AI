import { expect, test, type Page } from '@playwright/test';
import { seedExistingStudent } from './seed-existing-student';

async function fixture(page: Page, plan = 'pro') {
  await seedExistingStudent(page);
  let authorizations = 0;
  await page.route('**/api/subscriptions/**', async route => {
    const request = route.request();
    if (request.url().endsWith('/automation/authorize')) { authorizations++; await route.fulfill({json:{authorized:plan !== 'free'}}); return; }
    if (request.url().endsWith('/demo-plan')) plan = request.postDataJSON().plan;
    await route.fulfill({json:{subject_id:request.headers()['x-luma-student-id'],plan,name:'LumaPath '+plan,demo_switch_enabled:true,billing_connected:false,period_timezone:'UTC',entitlements:{assistant_requests:{enabled:true,remaining:82,used:18,limit:100,period:'day'},career_comparisons:{enabled:true,remaining:26,used:4,limit:30,period:'month'}}}});
  });
  await page.route('**/api/market-taxonomy/student/updates', route => route.fulfill({json:[]}));
  return () => authorizations;
}
const blocks = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('lumapath-demo-state-v1')!).planBlocks);

test('Pro explains priorities, adapts changed capacity, records history and supports undo', async ({page}) => {
  test.setTimeout(90_000);
  const authorizations = await fixture(page);
  await page.goto('/overview');
  await expect(page.getByRole('heading',{name:'Your Pro Intelligence',exact:true})).toBeVisible();
  await expect(page.getByLabel('Pro usage')).toContainText('82 remaining');
  await expect(page.getByLabel('Pro usage')).toContainText('4 used');
  await page.getByRole('button',{name:'Why this?',exact:true}).click();
  for (const name of ['Deadline urgency','Career relevance','Dependency impact','Evidence confidence','Capacity fit']) await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close priority explanation'}).click();
  const before = await blocks(page);
  await page.locator('#capacity > summary').click();
  await page.getByRole('button',{name:/Low Capacity/}).click();
  await page.getByRole('button',{name:'Update the plan with this capacity',exact:true}).click();
  await expect(page.getByRole('button',{name:'Undo adaptation',exact:true})).toBeVisible({timeout:15_000});
  expect(authorizations()).toBe(1);
  const adapted = await blocks(page);
  expect(adapted).not.toEqual(before);
  for (const block of before.filter((item: {isFixed?:boolean;isFocusBlock?:boolean})=>item.isFixed||item.isFocusBlock)) expect(adapted.find((item:{id:string})=>item.id===block.id)).toEqual(block);
  await page.getByRole('button',{name:'Undo adaptation',exact:true}).click();
  await expect.poll(()=>blocks(page)).toEqual(before);
  await page.locator('#pro-history > summary').click();
  await expect(page.locator('#pro-history')).toContainText('Previous plan restored');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('option',{name:'Recalculate my plan',exact:true})).toBeVisible();
  await expect(page.getByRole('option',{name:'Analyze CV',exact:true})).toBeVisible();
});

test('Free stays useful with short explanations and manual capacity updates', async ({page}) => {
  const authorizations = await fixture(page,'free');
  await page.goto('/overview');
  await expect(page.getByRole('heading',{name:'Your Free demo',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Your Pro Intelligence',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Why this?',exact:true}).click();
  await expect(page.getByRole('link',{name:'Unlock advanced explanations'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Evidence confidence',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Close priority explanation'}).click();
  const before = await blocks(page);
  await page.locator('#capacity > summary').click();
  await page.getByRole('button',{name:/Low Capacity/}).click();
  await page.getByRole('button',{name:'Save my capacity',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lumapath-demo-state-v1')!).capacity.availableMinutes)).toBe(120);
  expect(await blocks(page)).toEqual(before);
  expect(authorizations()).toBe(0);
});

test('Pro preferences persist and mobile intelligence cards fit', async ({page}) => {
  await fixture(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/settings');
  const controls=page.getByRole('region',{name:'Pro controls'});
  await controls.getByLabel('Weekly career-learning hours').fill('8');
  await controls.getByLabel('Preferred learning difficulty').selectOption('advanced');
  await controls.getByLabel('Planning style').selectOption('deadline-first');
  await controls.getByRole('button',{name:'Save Pro preferences'}).click();
  await expect(controls.getByRole('status')).toContainText('Pro preferences saved');
  await page.reload();
  await expect(controls.getByLabel('Weekly career-learning hours')).toHaveValue('8');
  await expect(controls.getByLabel('Preferred learning difficulty')).toHaveValue('advanced');
  await page.goto('/overview');
  await expect(page.getByRole('region',{name:'Your Pro Intelligence'})).toContainText('8 career-learning hours');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/lumapath-pro-intelligence-mobile.png',fullPage:true});
});
