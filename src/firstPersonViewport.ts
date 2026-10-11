import { BoxGeometry, Color, DirectionalLight, GridHelper, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, Scene, SphereGeometry, Vector3, WebGLRenderer } from 'three'
import { getDegreesPerCount } from './aimModel'
import type { GameConfig } from './games'
import { sanitizePointerMovement } from './pointerInput'
import { SPATIAL_HUNT_RULES, verticalFov, type Direction3 } from './spatialHunt'

export class FirstPersonViewport {
  readonly renderer: WebGLRenderer
  readonly camera = new PerspectiveCamera(60, 1, .05, 80)
  readonly scene = new Scene()
  readonly markers = new Group()
  yaw = 0
  pitch = 0
  private readonly forward = new Vector3()
  private readonly up = new Vector3()
  private readonly box = new BoxGeometry(1, 1, 1)
  private readonly sphere = new SphereGeometry(.16, 16, 10)
  private readonly materials = [new MeshLambertMaterial({ color: 0x454b4d }), new MeshLambertMaterial({ color: 0x798181 }), new MeshBasicMaterial({ color: 0xff7251 }), new MeshBasicMaterial({ color: 0x8dfbd3, wireframe: true })]
  private readonly source = new Mesh(this.sphere, this.materials[2])
  private readonly response = new Mesh(this.sphere, this.materials[3])
  private readonly grid = new GridHelper(20, 20, 0x515c5c, 0x303a3b)
  private readonly resizeObserver: ResizeObserver
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    this.scene.background = new Color(0x13191c)
    this.camera.position.set(0, SPATIAL_HUNT_RULES.eyeHeight, 0)
    this.camera.rotation.order = 'YXZ'
    this.scene.add(new HemisphereLight(0xeaf1ec, 0x313a3f, 2))
    const light = new DirectionalLight(0xffffff, 1.5)
    light.position.set(-3, 8, 1); this.scene.add(light)
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, material = 0) => {
      const mesh = new Mesh(this.box, this.materials[material])
      mesh.position.set(x, y, z); mesh.scale.set(w, h, d); this.scene.add(mesh)
    }
    box(0, -.12, 0, 20, .2, 20)
    box(0, 2, -10, 20, 4, .2); box(0, 2, 10, 20, 4, .2)
    box(-10, 2, 0, .2, 4, 20); box(10, 2, 0, .2, 4, 20)
    box(-4, 1.6, -5, .8, 3.2, .8, 1)
    box(4, .55, -4, 2.4, 1.1, 1.4, 1)
    box(2, 1.1, 5, 2.8, 2.2, .25, 1)
    box(-5, .7, 3, 1.6, 1.4, 2, 1)
    box(-4, 2.6, -5.42, .65, .08, .04, 2)
    box(0, .04, -8, 3, .04, .07, 2)
    box(6, 2.8, 0, .08, .4, 2, 1)
    this.grid.position.y = .002; this.scene.add(this.grid)
    this.markers.add(this.source, this.response); this.markers.visible = false; this.scene.add(this.markers)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
  }
  resize() {
    const { width, height } = this.canvas.getBoundingClientRect()
    if (!width || !height) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.fov = verticalFov(SPATIAL_HUNT_RULES.horizontalFov, this.camera.aspect)
    this.camera.updateProjectionMatrix()
    this.render()
  }
  move(event: Pick<MouseEvent, 'movementX' | 'movementY'>, game: GameConfig, sensitivity: number, elapsedSinceLock: number) {
    const gain = getDegreesPerCount(game, sensitivity)
    if (gain === null) return
    const movement = sanitizePointerMovement({ ...event, movementX: event.movementX, movementY: event.movementY, gain: gain * Math.PI / 180,
      width: this.canvas.clientWidth, height: this.canvas.clientHeight, elapsedSinceLock })
    if (!movement) return
    this.yaw = (this.yaw + movement.x) % (Math.PI * 2)
    this.pitch = Math.max(-85 * Math.PI / 180, Math.min(85 * Math.PI / 180, this.pitch - movement.y))
    this.updateCamera()
  }
  private updateCamera() { this.camera.rotation.set(this.pitch, -this.yaw, 0, 'YXZ'); this.camera.updateMatrixWorld() }
  orientation() {
    this.updateCamera()
    this.camera.getWorldDirection(this.forward)
    this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion)
    return { yaw: this.yaw, pitch: this.pitch, forward: { x: this.forward.x, y: this.forward.y, z: this.forward.z }, up: { x: this.up.x, y: this.up.y, z: this.up.z } }
  }
  reveal(source: Direction3, response: Direction3 | null) {
    const position = (mesh: Mesh, direction: Direction3) => mesh.position.set(direction.x * 6, SPATIAL_HUNT_RULES.eyeHeight + direction.y * 6, direction.z * 6)
    position(this.source, source)
    this.response.visible = response !== null
    if (response) position(this.response, response)
    this.markers.visible = true
  }
  render() { this.updateCamera(); this.renderer.render(this.scene, this.camera) }
  dispose() {
    this.resizeObserver.disconnect()
    this.box.dispose(); this.sphere.dispose(); this.materials.forEach(material => material.dispose())
    this.grid.geometry.dispose()
    const materials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]
    materials.forEach(material => material.dispose())
    this.scene.clear(); this.renderer.dispose()
    // StrictMode replays effects on the same connected canvas; do not poison its next context.
    queueMicrotask(() => { if (!this.canvas.isConnected) this.renderer.forceContextLoss() })
  }
}
