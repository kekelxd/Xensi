import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { mockCloud, login } from './fixtures/accountCloud'
import type { Access, Room, Request } from '../src/squad/service'
// Radix Select: open the combobox, then pick the option from the portal listbox.
async function choose(page: Page, scope: Page | Locator, label: string, option: string) {
  await scope.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
const roomId = '40000000-0000-4000-8000-000000000001'
const requestId = '50000000-0000-4000-8000-000000000001'
function room(): Room { return { id: roomId, game_id: 'valorant', platform: 'pc', crossplay: false, region: 'br', game_mode: 'competitive', rank_info: 'gold', microphone_required: true, status: 'open', slots: 1, nickname: 'Host XENSI', avatar_id: 'dog-happy', created_at: new Date().toISOString(), expires_at: new Date(Date.now()+1800000).toISOString(), reserved_until: null } }
async function fixture(context: BrowserContext) {
  await mockCloud(context)
  const state = {
    access: { eligible: true, enabled: true, email_confirmed: true, moderator: false, creation_enabled: true, publication_restricted: false, suspended: false } as Access,
    room: room(), rooms: [] as Room[], requests: [] as Request[], host: false, fail: false, requested: false, calls: [] as { action: string; payload: Record<string, unknown> }[],
  }
  await context.route('**/rest/v1/rpc/xensi_lfg', async route => {
    const { action, payload } = route.request().postDataJSON()
    state.calls.push({action,payload})
    const respond = (data: unknown) => route.fulfill({ json: data })
    if(state.fail) return route.fulfill({status:503,json:{message:'Network failure'}})
    if(action==='access') return respond(state.access)
    if(action==='notifications' || action==='blocks') return respond([])
    if(action==='list') return respond(state.rooms)
    if(action==='mine') return respond(state.host ? [state.room] : [])
    if(action==='requests') return respond(state.requests)
    if(action==='host_contact') return respond({nickname:'Host XENSI',discord_username:'host.secret',reserved_until:state.room.reserved_until})
    if(action==='create'){state.host=true; state.room=room();return respond({id:roomId})}
    if(action==='request'){state.requested=true;return respond({})}
    if(action==='accept'){state.room.status='reserved';state.room.reserved_until=new Date(Date.now()+600000).toISOString();state.requests[0].status='accepted'}
    if(action==='confirm'){state.room.status='closed';state.requests[0].status='joined'}
    if(action==='decline') state.requests[0].status='declined'
    if(action==='withdraw') state.requests[0].status='withdrawn'
    if(action==='release'){state.room.status='open';state.requests[0].status='cancelled'}
    if(action==='mod_list') return respond({reports:[{id:'report1',nickname:'Reported player',category:'spam',status:'pending',created_at:new Date().toISOString()}],actions:[],blocks:[],restrictions:[],creation_enabled:true})
    return respond({})
  })
  return state
}
test.describe('Squad Finder', () => {
  test.beforeEach(async ({context}) => { await context.addInitScript(() => { if (!localStorage.getItem('sensi-locale')) localStorage.setItem('sensi-locale','pt') }) })
  test('guest sees a login gate and existing tools stay accessible', async ({page}) => {
    await page.goto('/squad')
    await expect(page.getByRole('heading',{name:'Acesso ao Squad Finder'})).toBeVisible()
    await expect(page.getByText('18+', {exact:true})).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Entrar na conta XENSI'})).toBeVisible()
    await page.goto('/convert'); await expect(page.getByRole('main')).toBeVisible()
    await page.goto('/squad'); await page.getByRole('button',{name:'Entrar na conta XENSI'}).click(); await expect(page).toHaveURL(/login/)
  })
  test('verified email does not bypass account authorization or release gates', async ({page,context}) => {
    const state=await fixture(context); state.access.eligible=false
    await login(page);await page.goto('/squad')
    await expect(page.getByText('Sua conta ainda não está autorizada', {exact:false})).toBeVisible()
    expect(state.calls.some(c=>c.action==='list')).toBe(false)
    state.access.enabled=false;await page.getByRole('button',{name:'Atualizar',exact:true}).click()
    await expect(page.getByText('O Squad Finder está em preparação.', {exact:false})).toBeVisible()
  })
  test('create validates Discord, game platforms, focus and server failure recovery', async ({page,context},info) => {
    const state=await fixture(context);await login(page);await page.goto('/squad')
    await page.getByRole('button',{name:'Criar sala',exact:true}).click()
    const dialog=page.getByRole('dialog')
    await dialog.getByRole('radio',{name:/^Counter-Strike 2/}).click()
    await expect(dialog.getByRole('radio',{name:/^Counter-Strike 2/})).toBeChecked()
    await page.screenshot({path:`test-results/squad-create-${info.project.name}.png`,animations:'disabled'})
    await dialog.getByRole('combobox',{name:'Plataforma',exact:true}).click()
    await expect(page.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Escape');await expect(dialog).toBeVisible()
    await dialog.getByRole('button',{name:'Publicar sala'}).click();await expect(dialog.getByRole('textbox',{name:'Usuário Discord'})).toBeFocused()
    await dialog.getByRole('textbox',{name:'Usuário Discord'}).fill('host.username')
    state.fail=true;await dialog.getByRole('button',{name:'Publicar sala'}).click();await expect(dialog.getByRole('alert')).toBeVisible()
    await expect(dialog.getByRole('textbox',{name:'Usuário Discord'})).toHaveValue('host.username')
    state.fail=false;await dialog.getByRole('button',{name:'Publicar sala'}).click();await expect(dialog).not.toBeVisible()
    await page.getByRole('button',{name:'Minha Sala',exact:true}).click();await expect(page.getByText('1 vaga disponível')).toBeVisible()
  })
  test('request requires disclosure consent and never gets host contact before approval', async ({page,context},info) => {
    const state=await fixture(context);state.rooms=[state.room];await login(page);await page.goto('/squad')
    await expect(page.getByText('host.secret')).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Solicitar entrada'})).toBeVisible()
    await page.screenshot({path:`test-results/squad-list-${info.project.name}.png`,animations:'disabled',fullPage:true})
    await page.getByRole('button',{name:'Solicitar entrada'}).click()
    const dialog=page.getByRole('dialog')
    await expect(dialog.getByText('Seu nickname XENSI e usuário Discord serão compartilhados', {exact:false})).toBeVisible()
    await expect(dialog.getByRole('textbox')).toHaveCount(1)
    await page.screenshot({path:`test-results/squad-request-${info.project.name}.png`,animations:'disabled'})
    await dialog.getByRole('textbox',{name:'Usuário Discord'}).fill('guest.username')
    await expect(dialog.getByRole('button',{name:'Solicitar entrada'})).toBeDisabled()
    await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Solicitar entrada'}).click()
    await expect(dialog).not.toBeVisible();expect(state.requested).toBe(true);expect(state.calls.some(c=>c.action==='host_contact')).toBe(false)
  })
  test('host approval reserves the slot; confirmation closes room', async ({page,context}) => {
    const state=await fixture(context);state.host=true
    state.requests=[{id:requestId,room_id:roomId,status:'pending',requested_at:new Date().toISOString(),platform:'pc',nickname:'Applicant XENSI',avatar_id:null,room:state.room,discord_username:'applicant.private'}]
    await login(page);await page.goto('/squad/my-room')
    await expect(page.getByText('applicant.private')).toBeVisible()
    await page.getByRole('button',{name:'Aceitar',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Aceitar',exact:true}).click()
    await expect(page.getByRole('heading',{name:'Aguardando a entrada do jogador'})).toBeVisible()
    await page.getByRole('button',{name:'Confirmar entrada'}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirmar entrada'}).click()
    await expect(page.getByText('Entrada confirmada',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Confirmar entrada'})).toHaveCount(0)
  })
  test('approved contact is fetched on demand and cleared on logout', async ({page,context}) => {
    const state=await fixture(context);state.room.status='reserved';state.room.reserved_until=new Date(Date.now()+600000).toISOString()
    state.requests=[{id:requestId,room_id:roomId,status:'accepted',requested_at:new Date().toISOString(),platform:'pc',nickname:'Account A',avatar_id:null,room:state.room,discord_username:null}]
    await login(page);await page.goto('/squad/requests')
    await expect(page.getByText('host.secret')).toHaveCount(0)
    await page.getByRole('button',{name:'Consultar Discord do anfitrião'}).click();await expect(page.getByText('host.secret')).toBeVisible()
    expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('host.secret')
    await page.locator('.xensi-user-trigger').click();await page.getByRole('menuitem',{name:'Sair',exact:true}).click()
    await page.goto('/squad/requests');await expect(page.getByText('host.secret')).toHaveCount(0)
  })
  test('empty, failure, keyboard dialog dismissal, English and reduced motion', async ({page,context}) => {
    const state=await fixture(context);await page.emulateMedia({reducedMotion:'reduce'});await login(page);await page.goto('/squad')
    await expect(page.getByText('Nenhuma sala por aqui.')).toBeVisible()
    await page.getByRole('button',{name:'Criar sala',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Criar sala',exact:true})).toBeFocused()
    state.fail=true;await page.getByRole('button',{name:'Atualizar',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible()
    state.fail=false;await page.getByRole('button',{name:'Atualizar',exact:true}).click();await expect(page.getByText('Nenhuma sala por aqui.')).toBeVisible()
    await page.evaluate(()=>localStorage.setItem('sensi-locale','en'));await page.reload();await expect(page.getByRole('heading',{name:'Find a Squad',exact:true})).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  })
  test('moderation is hidden for ordinary users and records explicit decisions', async ({page,context}) => {
    const state=await fixture(context);await login(page);await page.goto('/squad/moderation')
    await expect(page.getByRole('button',{name:'Moderação',exact:true})).toHaveCount(0)
    state.access.moderator=true;await page.getByRole('button',{name:'Atualizar',exact:true}).click()
    await expect(page.getByText('Reported player')).toBeVisible()
    await page.getByRole('button',{name:'Suspender módulo'}).click();await page.getByRole('dialog').getByRole('button',{name:'Suspender módulo',exact:true}).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    expect(state.calls.some(c=>c.action==='mod_decide'&&c.payload.decision==='suspend')).toBe(true)
  })
  test('reports and blocks require an explicit decision, filters stay in the URL', async ({page,context}) => {
    const state=await fixture(context);state.rooms=[state.room];await login(page);await page.goto('/squad')
    await page.getByRole('radio',{name:/^Valorant/}).click()
    await expect(page).toHaveURL(/game=valorant/)
    await page.getByRole('button',{name:'Denunciar',exact:true}).click()
    await choose(page,page.getByRole('dialog'),'Categoria','Compartilhamento indevido de dados')
    await page.getByRole('dialog').getByRole('button',{name:'Denunciar',exact:true}).click()
    await expect(page.getByText('Denúncia registrada.')).toBeVisible()
    expect(state.calls.some(c=>c.action==='report'&&c.payload.category==='privacy')).toBe(true)
    await page.getByRole('button',{name:'Bloquear usuário'}).click()
    await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click()
    expect(state.calls.some(c=>c.action==='block')).toBe(false)
  })
  test('switching accounts never carries an approved contact into another account', async ({page,context}) => {
    const state=await fixture(context);state.room.status='reserved';state.room.reserved_until=new Date(Date.now()+600000).toISOString()
    state.requests=[{id:requestId,room_id:roomId,status:'accepted',requested_at:new Date().toISOString(),platform:'pc',nickname:'Account A',avatar_id:null,room:state.room,discord_username:null}]
    await login(page);await page.goto('/squad/requests')
    await page.getByRole('button',{name:'Consultar Discord do anfitrião'}).click();await expect(page.getByText('host.secret')).toBeVisible()
    await page.locator('.xensi-user-trigger').click();await page.getByRole('menuitem',{name:'Sair',exact:true}).click()
    state.requests=[];await login(page,'b@example.invalid');await page.goto('/squad/requests')
    await expect(page.getByText('Nenhuma solicitação por aqui.')).toBeVisible();await expect(page.getByText('host.secret')).toHaveCount(0)
  })
})
