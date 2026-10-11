import { expect, test } from '@playwright/test'
import { login, mockCloud, userA } from './fixtures/accountCloud'
import { readyHistory, readSessions } from './fixtures/sessionHistory'

test.describe('Spatial Sessions account transport and Analysis',()=>{
  test('syncs nested rounds, restores after reload, renders degrees and isolates a second account',async({page,context})=>{
    await page.addInitScript(()=>localStorage.setItem('sensi-locale','pt'))
    const cloud=await mockCloud(context);await login(page);await readyHistory(page)
    // Fixtures verify transport separately; spatial-hunt.spec exercises the actual arena.
    await page.evaluate(async owner=>{
      const {getSessionRepository}=await import('/src/sessionRepository.ts')
      const {SessionRecorder}=await import('/src/sessionRecorder.ts')
      const {exerciseConfig}=await import('/src/trainingSession.ts')
      const {spatialMetrics}=await import('/src/testFixtures/sessions.ts')
      const {createEmptyWarmupMetrics}=await import('/src/warmupTelemetry.ts')
      const repository=getSessionRepository(), recorder=new SessionRecorder(repository,'spatial-test')
      for(const value of [12.4,9.8,11.1,0]){
        recorder.start(owner,'spatial_hunt',{gameId:'cs2',sensitivity:1,dpi:800},exerciseConfig('spatial_hunt','medium','medium',0,1440,900,'classic'))
        const saved=recorder.complete({...createEmptyWarmupMetrics(0),spatial:spatialMetrics(value)})!
        await repository.waitForSession(saved)
      }
    },userA)
    await expect.poll(()=>cloud.sessions.length).toBe(4)
    expect(cloud.historyCalls.every(call=>call.owner===userA)).toBe(true)
    await page.reload();await readyHistory(page)
    await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
    await page.getByRole('combobox',{name:'Exercício',exact:true}).selectOption('spatial_hunt')
    await expect(page.locator('.analysis-pb-panel strong')).toHaveText('0,0°')
    await expect(page.locator('.analysis-v1-recents > button')).toHaveCount(4)
    await expect(page.locator('.analysis-v1-recents')).toContainText('9,8°')
    await page.locator('.analysis-v1-recents > button').first().click()
    await expect(page.getByRole('dialog')).toContainText('HRTF')
    await page.keyboard.press('Escape')
    expect((await readSessions(page,userA)).filter(s=>s.exerciseId==='spatial_hunt')).toHaveLength(4)
    await page.locator('.xensi-user-trigger').click();await page.getByRole('button',{name:'Sair',exact:true}).click()
    await login(page,'b@example.invalid');await readyHistory(page)
    await page.getByRole('button',{name:'ANÁLISE',exact:true}).click()
    await expect(page.getByText('Nenhuma sessão registrada')).toBeVisible()
    await expect(page.getByText('9,8°')).toHaveCount(0)
  })
})
