import { BoxGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, WebGLRenderer, type BufferGeometry, type Material, type Object3D } from 'three'
import { scopeVerticalFov, SNIPER_WORLD, sniperGeometry, type ScopeLevel } from './sniperReaction'

const ROOM = { halfWidth: 6, front: 3, height: 3.4 }
const OUTSIDE = { depth: 36, halfWidth: 15, wallHeight: 9 }

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
  private legs: Mesh[] = []
  private arms: Mesh[] = []
  private door = new Group()
  private radius = 0
  private lastFrameKey = ''
  private readonly resizeObserver: ResizeObserver
  private readonly box = new BoxGeometry(1, 1, 1)
  private readonly sphere = new SphereGeometry(1, 20, 14)
  private readonly floorGlow = new PlaneGeometry(1, 1)
  private readonly materials: Record<string, Material> = {
    roomWall: new MeshLambertMaterial({ color: 0x4a3f33 }),
    roomFloor: new MeshLambertMaterial({ color: 0x3a3229 }),
    roomCeiling: new MeshBasicMaterial({ color: 0x2a231c }),
    frame: new MeshLambertMaterial({ color: 0x2a1d14 }),
    wood: new MeshLambertMaterial({ color: 0x7b5232 }),
    sand: new MeshBasicMaterial({ color: 0xd8bb86 }),
    sandDark: new MeshBasicMaterial({ color: 0xb9985f }),
    ground: new MeshBasicMaterial({ color: 0xc7a76f }),
    crate: new MeshBasicMaterial({ color: 0x9a7a45 }),
    glow: new MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: .16, depthWrite: false }),
    cloth: new MeshLambertMaterial({ color: 0x1b2027 }),
    vest: new MeshLambertMaterial({ color: 0xff7251 }),
    skin: new MeshLambertMaterial({ color: 0xd9b18c }),
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
    // Outside lane, lit by the sun: flat bright materials.
    const outsideCenterZ = -d0 - OUTSIDE.depth / 2
    this.slab(this.scene, 'ground', 0, -.05, outsideCenterZ, OUTSIDE.halfWidth * 2, .1, OUTSIDE.depth)
    this.slab(this.scene, 'sand', 0, OUTSIDE.wallHeight / 2, -d0 - OUTSIDE.depth, OUTSIDE.halfWidth * 2, OUTSIDE.wallHeight, .2)
    this.slab(this.scene, 'sandDark', -OUTSIDE.halfWidth, OUTSIDE.wallHeight / 2, outsideCenterZ, .2, OUTSIDE.wallHeight, OUTSIDE.depth)
    this.slab(this.scene, 'sandDark', OUTSIDE.halfWidth, OUTSIDE.wallHeight / 2, outsideCenterZ, .2, OUTSIDE.wallHeight, OUTSIDE.depth)
    // Dust 2 flavour: crates and a low wall at the far end.
    this.slab(this.scene, 'crate', -7.5, .6, -d0 - 28, 1.4, 1.2, 1.4)
    this.slab(this.scene, 'crate', -7.5, 1.5, -d0 - 28, .9, .6, .9)
    this.slab(this.scene, 'crate', 8, .7, -d0 - 30, 2.2, 1.4, 1.6)
    this.slab(this.scene, 'sandDark', 0, .45, -d0 - 33, 8, .9, .6)
    // Light spilling through the doorway onto the dark floor.
    const glow = new Mesh(this.floorGlow, this.materials.glow)
    glow.rotation.x = -Math.PI / 2; glow.position.set(0, .01, -d0 + 3.2); glow.scale.set(2.4, 6.4, 1); this.scene.add(glow)
  }

  // Door wall with an opening of exactly `opening` meters, framed by two open leaves.
  configure(config: { opening: number; radius: number }) {
    if (this.radius === config.radius && (this.door.userData.opening as number | undefined) === config.opening) return
    this.door.clear(); this.door.userData.opening = config.opening
    const { doorDistance: d0, doorHeight } = SNIPER_WORLD
    const half = config.opening / 2, wallHalf = 30
    this.slab(this.door, 'roomWall', -(wallHalf + half) / 2, OUTSIDE.wallHeight / 2, -d0, wallHalf - half, OUTSIDE.wallHeight, .3)
    this.slab(this.door, 'roomWall', (wallHalf + half) / 2, OUTSIDE.wallHeight / 2, -d0, wallHalf - half, OUTSIDE.wallHeight, .3)
    this.slab(this.door, 'roomWall', 0, (doorHeight + OUTSIDE.wallHeight) / 2, -d0, config.opening, OUTSIDE.wallHeight - doorHeight, .3)
    for (const side of [-1, 1]) {
      this.slab(this.door, 'frame', side * (half + .07), doorHeight / 2, -d0 + .16, .14, doorHeight, .12)
      // Leaves swung open toward the player, away from the line of sight through the opening.
      const hinge = new Group()
      hinge.position.set(side * half, 0, -d0 + .17)
      hinge.rotation.y = -side * 70 * Math.PI / 180
      this.slab(hinge, 'wood', side * .4, 1.3, 0, .8, 2.6, .06)
      this.door.add(hinge)
    }
    this.slab(this.door, 'frame', 0, doorHeight + .07, -d0 + .16, config.opening + .28, .14, .12)
    this.setRunnerScale(config.radius)
    this.lastFrameKey = ''
  }

  private setRunnerScale(radius: number) {
    this.radius = radius
    this.runner.scale.setScalar(radius / SNIPER_WORLD.referenceRadius)
  }

  private buildRunner() {
    const group = new Group()
    group.rotation.order = 'YXZ'
    const reference = sniperGeometry(SNIPER_WORLD.referenceRadius)
    // The runner is seen in profile: local +Z is the running direction, so the silhouette width is the hitbox width.
    const depth = reference.bodyHalfWidth * 2, hip = .76
    const limb = (material: string, x: number, y: number, w: number, h: number, d: number, store: Mesh[]) => {
      const mesh = new Mesh(this.box.clone().translate(0, -.5, 0), this.materials[material])
      mesh.position.set(x, y, 0); mesh.scale.set(w, h, d); store.push(mesh); group.add(mesh)
    }
    limb('cloth', -.09, hip, .16, hip, .2, this.legs)
    limb('cloth', .09, hip, .16, hip, .2, this.legs)
    this.slab(group, 'cloth', 0, hip + .35, 0, .26, .7, depth)
    this.slab(group, 'vest', 0, hip + .4, 0, .28, .34, depth + .02)
    limb('cloth', -.17, 1.4, .1, .58, .12, this.arms)
    limb('cloth', .17, 1.4, .1, .58, .12, this.arms)
    const head = new Mesh(this.sphere, this.materials.skin)
    head.scale.setScalar(reference.headRadius); head.position.set(0, reference.headCenter, 0); group.add(head)
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
    const stride = state.fall > 0 ? 0 : Math.sin(now / 95) * .75
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
    this.scene.clear(); this.renderer.dispose()
    // StrictMode replays effects on the same connected canvas; do not poison its next context.
    queueMicrotask(() => { if (!this.canvas.isConnected) this.renderer.forceContextLoss() })
  }
}
