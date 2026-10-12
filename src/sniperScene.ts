import { BoxGeometry, CanvasTexture, Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, RepeatWrapping, Scene, Shape, SphereGeometry, SRGBColorSpace, WebGLRenderer, type BufferGeometry, type Material, type Object3D } from 'three'
import { scopeVerticalFov, SNIPER_WORLD, sniperGeometry, type ScopeLevel } from './sniperReaction'

const ROOM = { halfWidth: 6, front: 3, height: 3.4 }
const OUTSIDE = { depth: 34, halfWidth: 15, wallHeight: 14 }
// Pointed-arch double door: both leaves are closed and the runner is only seen through the gap between them.
const DOOR = { leafWidth: 1.15, springHeight: 2.3, apexHeight: 3.5 }

// Studded plank door, drawn once so no image asset is needed.
function woodTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#6e5539'; ctx.fillRect(0, 0, 128, 256)
    for (let x = 0; x < 128; x += 32) {
      ctx.fillStyle = x % 64 ? '#7a6044' : '#654d33'; ctx.fillRect(x, 0, 32, 256)
      ctx.fillStyle = '#2d2318'; ctx.fillRect(x, 0, 2, 256)
    }
    ctx.fillStyle = '#2b2b2b'
    for (const y of [40, 120, 210]) {
      ctx.fillRect(0, y, 128, 14)
      ctx.fillStyle = '#7d7468'
      for (let x = 10; x < 128; x += 26) { ctx.beginPath(); ctx.arc(x, y + 7, 3, 0, Math.PI * 2); ctx.fill() }
      ctx.fillStyle = '#2b2b2b'
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  return texture
}

// Weathered sandstone plaster or paving: speckled base color with faint block seams.
function surfaceTexture(base: [number, number, number], repeatX: number, repeatY: number, block: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = `rgb(${base.join(',')})`; ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 2400; i++) {
      const shade = Math.round((Math.random() - .5) * 34)
      ctx.fillStyle = `rgba(${base.map(channel => Math.max(0, Math.min(255, channel + shade))).join(',')},.55)`
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 3)
    }
    if (block) {
      ctx.strokeStyle = 'rgba(70,56,38,.22)'; ctx.lineWidth = 2
      for (let y = 0, row = 0; y < 256; y += block, row++) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke()
        for (let x = row % 2 ? block : block / 2; x < 256; x += block * 1.6) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + block); ctx.stroke() }
      }
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.colorSpace = SRGBColorSpace
  return texture
}

// Height of the pointed arch at lateral distance x from the center line.
const archHeight = (x: number, halfWidth: number) => DOOR.springHeight + (DOOR.apexHeight - DOOR.springHeight) * (1 - Math.min(1, Math.abs(x) / halfWidth)) ** .85

// First-person Dust 2 style double doors: a dark room, a narrow bright doorway and a runner crossing the lane behind it.
export class SniperViewport {
  readonly renderer: WebGLRenderer
  readonly camera = new PerspectiveCamera(scopeVerticalFov(0), 1, .05, 120)
  readonly scene = new Scene()
  yaw = 0
  pitch = 0
  private kickPitch = 0
  private kickedAt = -1e9
  private runner: Group
  private legs: Object3D[] = []
  private arms: Object3D[] = []
  private door = new Group()
  private radius = 0
  private lastFrameKey = ''
  private readonly resizeObserver: ResizeObserver
  private readonly box = new BoxGeometry(1, 1, 1)
  private readonly sphere = new SphereGeometry(1, 20, 14)
  private readonly floorGlow = new PlaneGeometry(1, 1)
  private readonly woodMap = woodTexture()
  private readonly surfaceMaps = [
    surfaceTexture([204, 184, 148], 8, 3.5, 64),   // far wall
    surfaceTexture([184, 162, 126], 9, 3.5, 64),   // side walls
    surfaceTexture([158, 146, 126], 8, 9, 64),     // ground paving
  ]
  private readonly materials: Record<string, Material> = {
    roomWall: new MeshLambertMaterial({ color: 0x4a3f33 }),
    roomFloor: new MeshLambertMaterial({ color: 0x3a3229 }),
    roomCeiling: new MeshBasicMaterial({ color: 0x2a231c }),
    frame: new MeshLambertMaterial({ color: 0x2a1d14 }),
    stone: new MeshLambertMaterial({ color: 0x8d8574 }),
    door: new MeshLambertMaterial({ map: this.woodMap }),
    farWall: new MeshBasicMaterial({ map: this.surfaceMaps[0] }),
    sideWall: new MeshBasicMaterial({ map: this.surfaceMaps[1] }),
    ground: new MeshBasicMaterial({ map: this.surfaceMaps[2] }),
    dumpster: new MeshBasicMaterial({ color: 0x6f6b61 }),
    dumpsterLid: new MeshBasicMaterial({ color: 0x57544c }),
    glow: new MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: .16, depthWrite: false }),
    cloth: new MeshLambertMaterial({ color: 0x1d2026 }),
    pants: new MeshLambertMaterial({ color: 0x23262d }),
    olive: new MeshLambertMaterial({ color: 0x5a5a3c }),
    oliveDark: new MeshLambertMaterial({ color: 0x45452e }),
    boot: new MeshLambertMaterial({ color: 0x7a6a4a }),
    glove: new MeshLambertMaterial({ color: 0x111317 }),
    helmet: new MeshLambertMaterial({ color: 0x15171c }),
    balaclava: new MeshLambertMaterial({ color: 0x0f1115 }),
    goggle: new MeshLambertMaterial({ color: 0x2c3138 }),
    skin: new MeshLambertMaterial({ color: 0xd9a47c }),
  }

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    this.scene.background = new Color(0x8fb4cf)
    this.camera.position.set(0, SNIPER_WORLD.eyeHeight, 0)
    this.camera.rotation.order = 'YXZ'
    this.scene.add(new HemisphereLight(0xfff2da, 0x4a4036, 2.4))
    const sun = new DirectionalLight(0xffffff, 1.2)
    sun.position.set(-4, 8, -3); this.scene.add(sun)
    this.buildStatic()
    this.scene.add(this.door)
    this.runner = this.buildRunner()
    this.runner.visible = false
    this.scene.add(this.runner)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  private slab(parent: Object3D, material: string, x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new Mesh(this.box, this.materials[material])
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh)
    return mesh
  }

  private buildStatic() {
    const { doorDistance: d0 } = SNIPER_WORLD
    const roomDepth = d0 + ROOM.front, roomCenterZ = (ROOM.front - d0) / 2
    // Player room: dark, enclosed, so the doorway reads as a bright slot.
    this.slab(this.scene, 'roomFloor', 0, -.05, roomCenterZ, ROOM.halfWidth * 2, .1, roomDepth)
    this.slab(this.scene, 'roomCeiling', 0, ROOM.height + .05, roomCenterZ, ROOM.halfWidth * 2, .1, roomDepth)
    this.slab(this.scene, 'roomWall', -ROOM.halfWidth, ROOM.height / 2, roomCenterZ, .1, ROOM.height, roomDepth)
    this.slab(this.scene, 'roomWall', ROOM.halfWidth, ROOM.height / 2, roomCenterZ, .1, ROOM.height, roomDepth)
    this.slab(this.scene, 'roomWall', 0, ROOM.height / 2, ROOM.front, ROOM.halfWidth * 2, ROOM.height, .1)
    // Outside lane, lit by the sun: flat bright materials, sandstone walls like the real map.
    const outsideCenterZ = -d0 - OUTSIDE.depth / 2
    this.slab(this.scene, 'ground', 0, -.05, outsideCenterZ, OUTSIDE.halfWidth * 2, .1, OUTSIDE.depth)
    this.slab(this.scene, 'farWall', 0, OUTSIDE.wallHeight / 2, -d0 - OUTSIDE.depth, OUTSIDE.halfWidth * 2, OUTSIDE.wallHeight, .2)
    this.slab(this.scene, 'sideWall', -OUTSIDE.halfWidth, OUTSIDE.wallHeight / 2, outsideCenterZ, .2, OUTSIDE.wallHeight, OUTSIDE.depth)
    this.slab(this.scene, 'sideWall', OUTSIDE.halfWidth, OUTSIDE.wallHeight / 2, outsideCenterZ, .2, OUTSIDE.wallHeight, OUTSIDE.depth)
    // A dumpster by the right edge of the lane.
    this.slab(this.scene, 'dumpster', 2.7, .65, -d0 - 27, 2.2, 1.3, 1.2)
    this.slab(this.scene, 'dumpsterLid', 2.7, 1.34, -d0 - 27, 2.3, .1, 1.3)
    // Light spilling through the doorway onto the dark floor.
    const glow = new Mesh(this.floorGlow, this.materials.glow)
    glow.rotation.x = -Math.PI / 2; glow.position.set(0, .01, -d0 + 3.2); glow.scale.set(2.4, 6.4, 1); this.scene.add(glow)
  }

  // Stone wall with a pointed-arch hole, filled by two closed plank leaves that leave a gap of exactly `opening` meters.
  configure(config: { opening: number; radius: number }) {
    if (this.radius === config.radius && (this.door.userData.opening as number | undefined) === config.opening) return
    this.door.traverse(object => { if (object instanceof Mesh && object.geometry !== this.box) object.geometry.dispose() })
    this.door.clear(); this.door.userData.opening = config.opening
    const { doorDistance: d0 } = SNIPER_WORLD
    const gap = config.opening / 2, hole = gap + DOOR.leafWidth, steps = 14
    const arch = (from: number, to: number) => Array.from({ length: steps + 1 }, (_, i) => { const x = from + (to - from) * i / steps; return [x, archHeight(x, hole)] as const })
    const wall = new Shape()
    wall.moveTo(-30, 0); wall.lineTo(30, 0); wall.lineTo(30, OUTSIDE.wallHeight); wall.lineTo(-30, OUTSIDE.wallHeight); wall.lineTo(-30, 0)
    const opening = new Shape()
    opening.moveTo(-hole, 0); opening.lineTo(hole, 0)
    for (const [x, y] of arch(hole, -hole)) opening.lineTo(x, y)
    wall.holes.push(opening)
    const wallMesh = new Mesh(new ExtrudeGeometry(wall, { depth: .3, bevelEnabled: false }), this.materials.stone)
    wallMesh.position.z = -d0 - .15; this.door.add(wallMesh)
    this.woodMap.repeat.set(1 / DOOR.leafWidth, 1 / DOOR.apexHeight)
    for (const side of [-1, 1]) {
      const leaf = new Shape()
      leaf.moveTo(side * gap, 0); leaf.lineTo(side * hole, 0)
      for (const [x, y] of arch(side * hole, side * gap)) leaf.lineTo(x, y)
      const mesh = new Mesh(new ExtrudeGeometry(leaf, { depth: .1, bevelEnabled: false }), this.materials.door)
      mesh.position.z = -d0 - .05; this.door.add(mesh)
    }
    this.setRunnerScale(config.radius)
    this.lastFrameKey = ''
  }

  private setRunnerScale(radius: number) {
    this.radius = radius
    this.runner.scale.setScalar(radius / SNIPER_WORLD.referenceRadius)
  }

  // Low-poly tactical operator: black helmet and balaclava, goggles, olive vest, tan boots.
  // Seen in profile: local +Z is the running direction, so the silhouette width is the hitbox width.
  private buildRunner() {
    const group = new Group()
    group.rotation.order = 'YXZ'
    const reference = sniperGeometry(SNIPER_WORLD.referenceRadius)
    const depth = reference.bodyHalfWidth * 2, hip = .72, front = depth / 2
    const swing = (store: Object3D[], x: number, y: number) => {
      const pivot = new Group(); pivot.position.set(x, y, 0); group.add(pivot); store.push(pivot)
      return pivot
    }
    for (const side of [-1, 1]) {
      const leg = swing(this.legs, side * .09, hip)
      this.slab(leg, 'pants', 0, -.25, 0, .16, .5, .17)
      this.slab(leg, 'olive', 0, -.27, front * .12, .19, .15, .17)           // knee pad
      this.slab(leg, 'boot', 0, -.6, .04, .17, .22, .27)                      // boot, toe forward
      const arm = swing(this.arms, side * .17, hip + .68)
      this.slab(arm, 'cloth', 0, -.18, 0, .11, .38, .14)
      this.slab(arm, 'glove', 0, -.42, 0, .12, .12, .15)
    }
    this.slab(group, 'cloth', 0, hip + .37, 0, .27, .7, depth * .9)           // torso, up to the shoulders
    this.slab(group, 'olive', 0, hip + .38, 0, .3, .58, depth)                // plate carrier
    for (const z of [-.1, 0, .1]) this.slab(group, 'oliveDark', .17, hip + .22, z, .05, .14, .09) // pouches, near side
    for (const z of [-.1, 0, .1]) this.slab(group, 'oliveDark', -.17, hip + .22, z, .05, .14, .09)
    this.slab(group, 'oliveDark', 0, hip + .42, -front - .04, .22, .32, .08)    // back panel
    this.slab(group, 'cloth', 0, hip + .02, 0, .29, .06, depth * .92)         // belt
    this.slab(group, 'balaclava', 0, reference.bodyTop - .02, 0, .13, .12, .13)             // neck
    const head = new Mesh(this.sphere, this.materials.balaclava)
    head.scale.setScalar(reference.headRadius); head.position.set(0, reference.headCenter, 0); group.add(head)
    const hr = reference.headRadius, hy = reference.headCenter
    const helmet = new Mesh(this.sphere, this.materials.helmet)
    helmet.scale.set(hr * 1.18, hr * .95, hr * 1.2); helmet.position.set(0, hy + hr * .32, -hr * .05); group.add(helmet)
    this.slab(group, 'goggle', 0, hy + hr * .22, hr * .98, hr * 1.5, hr * .5, hr * .22)      // goggles on the brow
    this.slab(group, 'skin', 0, hy - hr * .05, hr * .93, hr * 1.05, hr * .2, hr * .12)       // eye strip
    for (const side of [-1, 1]) this.slab(group, 'olive', side * hr * 1.05, hy, -hr * .1, hr * .35, hr * .8, hr * .7) // ear defenders
    return group
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect()
    if (!width || !height) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.lastFrameKey = ''
    this.render(0)
  }

  setAim(yaw: number, pitch: number) { this.yaw = yaw; this.pitch = pitch }
  setScope(level: ScopeLevel) {
    this.camera.fov = scopeVerticalFov(level)
    this.camera.updateProjectionMatrix()
  }
  // Visual recoil only: the logical aim never moves.
  kick(now: number) { this.kickedAt = now }

  setRunner(state: { visible: boolean; x: number; z: number; fall: number }, direction: number, now: number) {
    this.runner.visible = state.visible
    if (!state.visible) return
    this.runner.position.set(state.x, 0, -state.z)
    this.runner.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2
    this.runner.rotation.x = -state.fall * Math.PI / 2
    const stride = state.fall > 0 ? 0 : Math.sin(now / 95) * .5
    this.legs[0].rotation.x = stride; this.legs[1].rotation.x = -stride
    this.arms[0].rotation.x = -stride * .8; this.arms[1].rotation.x = stride * .8
  }

  render(now: number) {
    const age = (now - this.kickedAt) / 1000
    this.kickPitch = age >= 0 && age < .45 ? .035 * Math.exp(-age * 9) * Math.cos(age * 6) : 0
    // A still scene (waiting for the runner, aim not moving) needs no new frame.
    const runner = this.runner
    const key = [this.yaw, this.pitch + this.kickPitch, this.camera.fov, this.camera.aspect, runner.visible, runner.position.x, runner.position.z, runner.rotation.x, runner.visible ? this.legs[0].rotation.x : 0].join('|')
    if (key === this.lastFrameKey) return
    this.lastFrameKey = key
    this.camera.rotation.set(this.pitch + this.kickPitch, -this.yaw, 0, 'YXZ')
    this.camera.updateMatrixWorld()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.resizeObserver.disconnect()
    const geometries = new Set<BufferGeometry>([this.box, this.sphere, this.floorGlow])
    this.scene.traverse(object => { if (object instanceof Mesh) geometries.add(object.geometry) })
    geometries.forEach(geometry => geometry.dispose())
    Object.values(this.materials).forEach(material => material.dispose())
    this.woodMap.dispose(); this.surfaceMaps.forEach(map => map.dispose())
    this.scene.clear(); this.renderer.dispose()
    // StrictMode replays effects on the same connected canvas; do not poison its next context.
    queueMicrotask(() => { if (!this.canvas.isConnected) this.renderer.forceContextLoss() })
  }
}
