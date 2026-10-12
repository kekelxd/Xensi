import { useEffect, useRef, type CSSProperties } from 'react'
import { clampAxis } from './gamepadMetrics'
import type { GamepadSnapshot } from './gamepadInput'
import './controller3d.css'

const BODY = 'M151 78C192 48 247 55 302 61C337 64 383 64 418 61C473 55 528 48 569 78C621 117 650 181 641 244L619 334C609 377 584 400 558 391C527 381 505 365 476 338H244C215 365 193 381 162 391C136 400 111 377 101 334L79 244C70 181 99 117 151 78Z'
const EDGE_LAYERS = [18, 14, 10, 6, 3]
const value = (gamepad: GamepadSnapshot, index: number) => gamepad.buttons[index]?.value ?? 0
const pressed = (gamepad: GamepadSnapshot, index: number) => Boolean(gamepad.buttons[index]?.pressed || value(gamepad, index) > .5)

function FaceButton({ x, y, label, active, tone }: { x: number; y: number; label: string; active: boolean; tone: 'a' | 'b' | 'x' | 'y' }) {
  return <g transform={`translate(${x} ${y})`}><g className={`pad3d-press pad3d-face pad3d-face-${tone}${active ? ' active' : ''}`}>
    <circle r="20" /><text textAnchor="middle" dominantBaseline="central">{label}</text>
  </g></g>
}

function Stick({ x, y, label, active, axisX, axisY }: { x: number; y: number; label: string; active: boolean; axisX: number; axisY: number }) {
  return <g transform={`translate(${x} ${y})`}><g className={`pad3d-press pad3d-stick${active ? ' active' : ''}`}>
    <circle className="pad3d-stick-well" r="42" />
    <g transform={`translate(${clampAxis(axisX) * 11} ${clampAxis(axisY) * 11})`}>
      <circle className="pad3d-stick-skirt" r="31" />
      <circle className="pad3d-stick-cap" r="27" />
      <text textAnchor="middle" dominantBaseline="central">{label}</text>
    </g>
  </g></g>
}

/**
 * Xbox layout in faux 3D: stacked SVG layers (shell edge, body, controls, sticks) placed at different
 * depths inside a CSS perspective, tilted by the left stick and the pointer. Only `transform` changes,
 * so it stays on the compositor; the pointer tilt writes CSS variables directly (no React re-render).
 */
export function Controller3D({ gamepad, leftX, leftY, label }: { gamepad: GamepadSnapshot; leftX: number; leftY: number; label: string }) {
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = stage.current
    if (!node || !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return
    let frame = 0, px = 0, py = 0
    const apply = () => { frame = 0; node.style.setProperty('--pad-px', px.toFixed(3)); node.style.setProperty('--pad-py', py.toFixed(3)) }
    const move = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect()
      px = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1))
      py = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1))
      if (!frame) frame = requestAnimationFrame(apply)
    }
    const leave = () => { px = 0; py = 0; if (!frame) frame = requestAnimationFrame(apply) }
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerleave', leave)
    return () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerleave', leave); cancelAnimationFrame(frame) }
  }, [])

  const tilt = { '--pad-sx': clampAxis(leftX).toFixed(3), '--pad-sy': clampAxis(leftY).toFixed(3) } as CSSProperties
  const lt = value(gamepad, 6), rt = value(gamepad, 7)
  return <div ref={stage} className="pad3d-stage" role="img" aria-label={label}>
    <div className="pad3d" style={tilt}>
      <div className="pad3d-shadow" aria-hidden="true" />
      {EDGE_LAYERS.map((depth) => <svg key={depth} className="pad3d-layer pad3d-edge" style={{ '--z': `${-depth}px` } as CSSProperties} viewBox="0 0 720 430" aria-hidden="true"><path d={BODY} /></svg>)}
      <svg className="pad3d-layer pad3d-triggers" viewBox="0 0 720 430" aria-hidden="true">
        {([[104, 'LT', lt], [486, 'RT', rt]] as const).map(([x, name, amount]) => <g key={name} className={amount > .05 ? 'active' : ''}>
          <rect className="pad3d-trigger" x={x} y="22" width="130" height="31" rx="12" />
          <rect className="pad3d-trigger-fill" x={x} y="22" width={130 * amount} height="31" rx="12" />
          <text x={x + 65} y="42" textAnchor="middle">{name}</text>
        </g>)}
      </svg>
      <svg className="pad3d-layer pad3d-body" viewBox="0 0 720 430" aria-hidden="true">
        <defs>
          <linearGradient id="pad3d-body" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#2c3541" /><stop offset=".55" stopColor="#161c25" /><stop offset="1" stopColor="#0c1016" /></linearGradient>
          <radialGradient id="pad3d-sheen" cx="34%" cy="18%" r="70%"><stop stopColor="#fff" stopOpacity=".16" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /></radialGradient>
        </defs>
        <path className="pad3d-shell" d={BODY} />
        <path className="pad3d-sheen" d={BODY} />
        <path className="pad3d-seam" d="M158 80C205 98 221 115 231 139M562 80C515 98 499 115 489 139" />
      </svg>
      <svg className="pad3d-layer pad3d-controls" viewBox="0 0 720 430" aria-hidden="true">
        {([[126, 'LB', 4], [468, 'RB', 5]] as const).map(([x, name, index]) => <g key={name} className={`pad3d-bumper${pressed(gamepad, index) ? ' active' : ''}`}>
          <rect x={x} y="62" width="126" height="24" rx="10" /><text x={x + 63} y="78" textAnchor="middle">{name}</text>
        </g>)}
        <g transform="translate(360 111)"><g className={`pad3d-press pad3d-home${pressed(gamepad, 16) ? ' active' : ''}`}><circle r="19" /><circle className="pad3d-home-mark" r="8" /></g></g>
        {([[329, 8, 'view'], [391, 9, 'menu']] as const).map(([x, index, name]) => <g key={name} transform={`translate(${x} 154)`}><g className={`pad3d-press pad3d-menu${pressed(gamepad, index) ? ' active' : ''}`}>
          <rect x="-16" y="-9.5" width="32" height="19" rx="8" />
          {name === 'view' ? <><rect className="pad3d-glyph" x="-6" y="-4" width="7" height="6" rx="1" /><rect className="pad3d-glyph" x="-2" y="-1" width="7" height="6" rx="1" /></> : <path className="pad3d-glyph" d="M-6 -3.5H6M-6 0H6M-6 3.5H6" />}
        </g></g>)}
        <g className="pad3d-dpad" transform="translate(273 267)">
          <circle className="pad3d-dpad-well" r="54" />
          {([[12, 'M-17 -51H17V-17H-17Z'], [14, 'M-51 -17H-17V17H-51Z'], [15, 'M17 -17H51V17H17Z'], [13, 'M-17 17H17V51H-17Z']] as const).map(([index, d]) => <path key={index} className={`pad3d-press${pressed(gamepad, index) ? ' active' : ''}`} d={d} />)}
          <path className="pad3d-dpad-hub" d="M-17 -17H17V17H-17Z" />
        </g>
        <FaceButton x={535} y={132} label="Y" tone="y" active={pressed(gamepad, 3)} />
        <FaceButton x={503} y={164} label="X" tone="x" active={pressed(gamepad, 2)} />
        <FaceButton x={567} y={164} label="B" tone="b" active={pressed(gamepad, 1)} />
        <FaceButton x={535} y={196} label="A" tone="a" active={pressed(gamepad, 0)} />
      </svg>
      <svg className="pad3d-layer pad3d-sticks" viewBox="0 0 720 430" aria-hidden="true">
        <Stick x={220} y={172} label="L3" active={pressed(gamepad, 10)} axisX={leftX} axisY={leftY} />
        <Stick x={445} y={262} label="R3" active={pressed(gamepad, 11)} axisX={gamepad.axes[2] ?? 0} axisY={gamepad.axes[3] ?? 0} />
      </svg>
    </div>
  </div>
}
