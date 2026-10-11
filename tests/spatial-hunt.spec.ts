import { expect, test, type Page } from '@playwright/test'
import { readyHistory, readSessions } from './fixtures/sessionHistory'

declare global {
  interface Window { spatialProbe: { contexts: AudioContext[]; panners: PannerNode[]; sources: AudioBufferSourceNode[]; draws: number; starts: number[]; frames: number[] } }
}
async function probe(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sensi-locale', 'en')
    const stats = window.spatialProbe = {contexts: [], panners: [], sources: [], draws: 0, starts: [], frames: []} as Window['spatialProbe']
    const Base = window.AudioContext
    window.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) { super(options); stats.contexts.push(this) }
      createPanner() { const p=super.createPanner(); stats.panners.push(p); return p }
      createBufferSource() { const s=super.createBufferSource(); stats.sources.push(s); const start=s.start.bind(s); s.start=(when=0)=>{ stats.starts.push(when); start(when) }; return s }
    }
    const draw=WebGL2RenderingContext.prototype.drawElements
    WebGL2RenderingContext.prototype.drawElements=function(...args) { stats.draws++; const now=performance.now(); if(!stats.frames.length || now-stats.frames.at(-1)!>2) stats.frames.push(now); return draw.apply(this,args) }
  })
}
async function pixelStats(page: Page, png: Buffer) {
  return page.evaluate(async base64 => {
    const img=new Image(); img.src='data:image/png;base64,'+base64; await img.decode()
    const canvas=document.createElement('canvas'); canvas.width=img.width; canvas.height=img.height
    const ctx=canvas.getContext('2d')!; ctx.drawImage(img,0,0)
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data
    let nonblack=0; const colors=new Set<string>()
    for(let i=0;i<pixels.length;i+=4) { if(pixels[i]+pixels[i+1]+pixels[i+2]>15) nonblack++; if(i%400===0) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`) }
    return {nonblack,colors:colors.size,total:canvas.width*canvas.height}
  },png.toString('base64'))
}

test.describe('Spatial Hunt V1', () => {
  test.beforeEach(async ({page}) => { await probe(page) })
  test('keeps the shared hover preview silent and lazy, then opens the supported setup', async ({page},info) => {
    const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message))
    const loaded:string[]=[]; page.on('request',r=>loaded.push(r.url()))
    await page.goto('/train'); await readyHistory(page)
    await page.getByRole('group').filter({has:page.getByRole('button',{name:/Audio/})}).getByRole('button',{name:/Audio/}).click()
    const card=page.getByRole('button',{name:/Spatial Hunt/}); await expect(card).toBeVisible(); await card.hover()
    await expect(card.locator('.spatial-preview')).toBeVisible()
    expect(loaded.some(url=>/SpatialHuntPage|firstPersonViewport|three[._/]/.test(url))).toBe(false)
    expect(await page.evaluate(()=>window.spatialProbe.contexts.length)).toBe(0)
    expect(await page.evaluate(()=>document.pointerLockElement)).toBeNull()
    await page.screenshot({path:info.outputPath('spatial-preview.png')})
    await page.mouse.move(0,0); await card.blur(); await expect(card.locator('.spatial-preview')).toHaveCount(0)
    await card.click(); await expect(page).toHaveURL(/\/train\/spatial-hunt$/)
    await expect(page.getByRole('heading',{name:'Spatial Hunt',exact:true})).toBeVisible()
    expect(await page.evaluate(()=>window.spatialProbe.contexts.length)).toBe(0)
    const start=page.getByRole('button',{name:'START',exact:true})
    if(info.project.name==='mobile') { await expect(start).toBeDisabled(); await expect(page.getByRole('alert')).toContainText('requires a mouse') }
    else {
      await expect(start).toBeEnabled(); const png=await page.locator('.spatial-world').screenshot(); const pixels=await pixelStats(page,png); expect(pixels.colors).toBeGreaterThan(15); expect(pixels.nonblack/pixels.total).toBeGreaterThan(.8)
      const original=page.viewportSize()!; await page.setViewportSize({width:original.width-100,height:original.height-60})
      await expect.poll(()=>page.locator('.spatial-world canvas').evaluate(el=>Math.abs((el as HTMLCanvasElement).width/el.clientWidth-Math.min(devicePixelRatio,1.5)))).toBeLessThan(.01)
      await page.setViewportSize(original)
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:info.outputPath('spatial-setup.png'),fullPage:true})
    expect(errors).toEqual([])
  })
  test('completes eight real-camera rounds, persists metrics and PB, and releases audio on exit', async ({page},info) => {
    test.skip(info.project.name==='mobile','Fine mouse and pointer lock are required; unsupported mobile is tested separately.')
    test.setTimeout(120000)
    const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message))
    await page.emulateMedia({reducedMotion:'reduce'})
    await page.goto('/train/spatial-hunt'); await readyHistory(page)
    await page.getByRole('button',{name:'START',exact:true}).click()
    const game=page.locator('.spatial-hunt')
    await expect(game).toHaveAttribute('data-phase','orientation')
    await expect.poll(()=>page.evaluate(()=>document.pointerLockElement?.tagName)).toBe('CANVAS')
    await expect.poll(()=>page.evaluate(()=>window.spatialProbe.contexts[0]?.state)).toBe('running')
    await page.screenshot({path:info.outputPath('spatial-orientation.png')})
    let requests=0; page.on('request',r=>{if(r.url().includes('/rest/v1/'))requests++})
    for(let round=0;round<8;round++) {
      await expect(game).toHaveAttribute('data-phase',/stimulus|awaiting_response/,{timeout:10000})
      const draws=await page.evaluate(()=>window.spatialProbe.draws)
      const before=await page.evaluate(()=>window.spatialProbe.contexts[0].listener.forwardX.value)
      // Browser-dispatched mouse movement remains real pointer-lock input, not a game-state shortcut.
      await page.mouse.move(650+round*10,350+round*5)
      if(round===0) {
        await expect.poll(()=>page.evaluate(()=>window.spatialProbe.contexts[0].listener.forwardX.value)).not.toBe(before)
        const black=await page.screenshot({path:info.outputPath('spatial-blackout.png')})
        const pixels=await pixelStats(page,black); expect(pixels.nonblack).toBeLessThan(1500)
        expect(await page.evaluate(()=>window.spatialProbe.draws)).toBe(draws)
        expect(await page.evaluate(()=>window.spatialProbe.panners[0].panningModel)).toBe('HRTF')
      }
      await page.mouse.click(700,400)
      await expect(game).toHaveAttribute('data-phase','revealing')
      if(round===0) await page.screenshot({path:info.outputPath('spatial-reveal.png')})
      if(round<7) await expect(game).toHaveAttribute('data-phase','orientation',{timeout:8000})
    }
    await expect(game).toHaveAttribute('data-phase','completed',{timeout:8000})
    await expect.poll(async()=>(await readSessions(page)).length).toBe(1)
    const saved=(await readSessions(page))[0]
    expect(saved).toMatchObject({exerciseId:'spatial_hunt',exerciseVersion:1,status:'completed',metrics:{round_count:8,timeouts:0}})
    if(saved.exerciseId!=='spatial_hunt')throw new Error('Spatial session expected')
    expect(saved.metrics!.rounds).toHaveLength(8)
    expect(new Set(saved.metrics!.rounds.map(r=>r.sector)).size).toBe(8)
    expect(saved.metrics!.mean_angular_error_deg).toBeGreaterThanOrEqual(0)
    expect(requests).toBe(0)
    await expect(page.locator('.spatial-pb')).toBeVisible()
    expect(await page.evaluate(()=>window.spatialProbe.contexts.length)).toBe(1)
    expect(await page.evaluate(()=>window.spatialProbe.starts.length)).toBe(24)
    await expect.poll(()=>page.evaluate(()=>window.spatialProbe.contexts[0].state)).toBe('suspended')
    const pacing=await page.evaluate(()=>{
      const times=window.spatialProbe.frames, intervals=times.slice(1).map((v,i)=>v-times[i]).filter(v=>v<200).sort((a,b)=>a-b)
      return {frames:times.length,visibleIntervalMedian:intervals[Math.floor(intervals.length/2)],visibleIntervalP95:intervals[Math.ceil(intervals.length*.95)-1],contexts:window.spatialProbe.contexts.length,drawCalls:window.spatialProbe.draws}
    })
    await info.attach('render-observation',{body:JSON.stringify(pacing),contentType:'application/json'})
    await page.screenshot({path:info.outputPath('spatial-results.png'),fullPage:true})
    await page.getByRole('button',{name:'TRY AGAIN',exact:true}).click(); await expect(game).toHaveAttribute('data-phase','orientation')
    expect(await page.evaluate(()=>window.spatialProbe.contexts.length)).toBe(1)
    await page.keyboard.press('Escape'); await expect(game).toHaveAttribute('data-phase','interrupted')
    await page.getByRole('button',{name:'EXIT',exact:true}).last().click()
    await expect.poll(()=>page.evaluate(()=>window.spatialProbe.contexts[0].state)).toBe('closed')
    const stoppedDraws=await page.evaluate(()=>window.spatialProbe.draws)
    await page.getByRole('button',{name:/Spatial Hunt/}).hover()
    expect(await page.evaluate(()=>window.spatialProbe.draws)).toBe(stoppedDraws)
    await expect.poll(async()=>(await readSessions(page)).length).toBe(2)
    expect((await readSessions(page))[0].status).toBe('interrupted')
    expect(errors).toEqual([])
  })
  test('invalidates blackout after pointer-lock loss or a hidden document', async ({page},info) => {
    test.skip(info.project.name!=='desktop','Lifecycle scenario on the main desktop viewport.')
    test.setTimeout(45000)
    await page.goto('/train/spatial-hunt'); await readyHistory(page)
    for(const reason of ['pointer_lock_lost','visibility_hidden']) {
      await page.getByRole('button',{name:/^(START|TRY AGAIN)$/}).click()
      await expect(page.locator('.spatial-hunt')).toHaveAttribute('data-phase',/stimulus|awaiting_response/,{timeout:10000})
      await page.evaluate(reason=>{if(reason==='pointer_lock_lost')document.exitPointerLock();else {Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false})}},reason)
      await expect(page.locator('.spatial-hunt')).toHaveAttribute('data-phase','interrupted')
      await expect.poll(async()=>(await readSessions(page)).filter(s=>s.invalidReason===reason).length).toBe(1)
      await expect.poll(()=>page.evaluate(()=>window.spatialProbe.contexts[0].state)).toBe('suspended')
    }
  })
})
