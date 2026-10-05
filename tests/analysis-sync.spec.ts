import { expect, test } from '@playwright/test'
import { login, mockCloud, userA } from './fixtures/accountCloud'
import { readyHistory, seedSession } from './fixtures/sessionHistory'

test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('sensi-locale','pt'))})
test('queries full account statistics beyond the Sessions cache and filters real variants',async({page,context})=>{
  const cloud=await mockCloud(context)
  await page.goto('/')
  cloud.sessions=await page.evaluate(async owner=>{
    const {makeSession}=await import('/src/testFixtures/sessions.ts')
    const {sessionRow}=await import('/src/sessionCloud.ts')
    return Array.from({length:351},(_,i)=>sessionRow(makeSession(i===0?1000:100,i+1,{userId:owner,finishedAt:new Date(Date.now()-86400000-i*1000).toISOString()})))
  },userA)
  const requests:Record<string,unknown>[]=[]
  page.on('request',r=>{if(r.url().endsWith('/xensi_analysis_v1'))requests.push(r.postDataJSON())})
  await login(page);await readyHistory(page)
  await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
  await page.getByRole('combobox',{name:'Exercício',exact:true}).selectOption('flick')
  await expect(page.locator('.analysis-v1-summary')).toContainText('351')
  await expect(page.locator('.av1-point')).toHaveCount(300)
  await expect(page.locator('.av1-note')).toContainText('estatísticas incluem todo o período')
  await expect(page.locator('.analysis-v1-recents > button')).toHaveCount(20)
  expect(requests.some(r=>r.expected_user_id===userA&&r.period_days===30&&r.target_exercise==='flick'&&r.metric_key==='score')).toBe(true)
  await expect(page.locator('.analysis-pb-panel strong')).toHaveText('1.000')
  await page.locator('.analysis-v1-recents > button').first().click()
  cloud.failWrites=true
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Excluir sessão',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Detalhes da sessão'}).getByRole('alert')).toContainText('Não foi possível excluir')
  await expect(page.locator('.analysis-v1-summary')).toContainText('351')
  cloud.failWrites=false
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Excluir sessão',exact:true}).click()
  await expect(page.locator('.analysis-v1-summary')).toContainText('350')
  await expect(page.locator('.analysis-pb-panel strong')).toHaveText('100')
})
test('loads a second device and clears cloud analysis on logout/account change',async({page,context,browser})=>{
  const cloud=await mockCloud(context)
  await page.goto('/')
  cloud.sessions=await page.evaluate(async owner=>{
    const {makeSession}=await import('/src/testFixtures/sessions.ts');const {sessionRow}=await import('/src/sessionCloud.ts')
    return [sessionRow(makeSession(234,1,{userId:owner,exerciseId:'micro_flick',finishedAt:new Date(Date.now()-1000).toISOString()}))]
  },userA)
  await login(page);await readyHistory(page)
  await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
  await expect(page.locator('.analysis-v1-recents')).toContainText('234 ms')
  const second=await browser.newContext({baseURL:'http://127.0.0.1:5175/',viewport:page.viewportSize()!})
  try {
    const other=await mockCloud(second);other.sessions=cloud.sessions
    const tab=await second.newPage();await tab.addInitScript(()=>localStorage.setItem('sensi-locale','pt'))
    await login(tab);await readyHistory(tab)
    await tab.getByRole('button',{name:'ANÁLISE',exact:true}).click()
    await expect(tab.locator('.analysis-v1-recents')).toContainText('234 ms')
  } finally {await second.close()}
  await page.locator('.xensi-user-trigger').click();await page.getByRole('button',{name:'Sair',exact:true}).click()
  await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
  await expect(page.getByText('Nenhuma sessão registrada')).toBeVisible()
  await expect(page.getByText('234 ms')).toHaveCount(0)
  await login(page,'b@example.invalid');await readyHistory(page)
  await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
  await expect(page.getByText('Nenhuma sessão registrada')).toBeVisible()
  await expect(page.getByText('234 ms')).toHaveCount(0)
})
test('shows an explicit RPC error and retries without guest fallback',async({page,context})=>{
  await mockCloud(context)
  await login(page);await readyHistory(page)
  const url='https://xensi-presets.example.invalid/rest/v1/rpc/xensi_analysis_v1'
  await context.route(url,r=>r.fulfill({status:503,json:{message:'Analysis unavailable'}}))
  await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar a análise.')
  await expect(page.locator('.av1-point')).toHaveCount(0)
  await context.unroute(url)
  await page.getByRole('button',{name:'Atualizar análise',exact:true}).click()
  await expect(page.getByText('Nenhuma sessão registrada')).toBeVisible()
})

test('recalculates open account analysis after explicit guest import without reload',async({page,context})=>{
  const cloud=await mockCloud(context)
  await page.goto('/')
  await seedSession(page)
  await login(page)
  await page.getByRole('dialog',{name:'Importar histórico de visitante?'}).getByRole('button',{name:'AGORA NÃO'}).click()
  await readyHistory(page)
  await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
  await expect(page.getByText('Nenhuma sessão registrada')).toBeVisible()
  expect(await page.evaluate(async()=> (await import('/src/sessionRepository.ts')).getSessionRepository().importGuestSessions())).toBe(true)
  await expect(page.locator('.analysis-v1-recents')).toContainText('100')
  await expect(page.locator('.analysis-v1-summary')).toContainText('1')
  expect(cloud.sessions).toHaveLength(1)
})

test('ignores an account RPC response arriving after logout',async({page,context})=>{
  const cloud=await mockCloud(context)
  await page.goto('/')
  cloud.sessions=await page.evaluate(async owner=>{
    const {makeSession}=await import('/src/testFixtures/sessions.ts')
    const {sessionRow}=await import('/src/sessionCloud.ts')
    return [sessionRow(makeSession(234,1,{userId:owner,exerciseId:'micro_flick',finishedAt:new Date(Date.now()-1000).toISOString()}))]
  },userA)
  await login(page);await readyHistory(page)
  let release!:()=>void
  const gate=new Promise<void>(resolve=>{release=resolve})
  const url='https://xensi-presets.example.invalid/rest/v1/rpc/xensi_analysis_v1'
  const completed=page.waitForResponse(url)
  await context.route(url,async route=>{await gate;await route.fallback()})
  try {
    const requested=page.waitForRequest(url)
    await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
    await requested
    await page.locator('.xensi-user-trigger').click()
    await page.getByRole('button',{name:'Sair',exact:true}).click()
    await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
    await expect(page.getByText('Nenhuma sessão registrada')).toBeVisible()
  } finally {release()}
  await completed
  await expect(page.getByText('Nenhuma sessão registrada')).toBeVisible()
  await expect(page.getByText('234 ms')).toHaveCount(0)
  await expect(page.locator('.av1-point')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
