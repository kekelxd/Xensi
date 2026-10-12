import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Gamepad2, RotateCcw, Vibrate } from 'lucide-react'
import { clampAxis, circularityError, rawAxis, type StickPoint } from './gamepadMetrics'
import { selectActiveGamepad, subscribeGamepads, type GamepadSnapshot } from './gamepadInput'
import { useI18n } from './i18n'
import { Controller3D } from './Controller3D'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Segmented, SegmentedItem } from '@/components/ui/segmented'

type StickName = 'left' | 'right'

const EMPTY_SNAPSHOT: GamepadSnapshot = { index: 0, id: '', connected: false, timestamp: 0, axes: [0, 0, 0, 0], buttons: [] }

function StickVisualizer({ name, x, y, points, error }: { name: StickName, x: number, y: number, points: StickPoint[], error: number | null }) {
  const { t } = useI18n()
  const label = name === 'left' ? 'LS' : 'RS'
  return (
    <Card className="min-w-0 gap-3 p-4">
      <div className="flex items-center justify-between gap-2"><Badge variant="secondary" className="font-mono">{label}</Badge><span className="truncate text-xs font-medium text-muted-foreground">{name === 'left' ? t('gamepad.leftStick') : t('gamepad.rightStick')}</span></div>
      <div className="gamepad-stick-scope" aria-label={label}>
        <i className="gamepad-stick-center" />
        <svg viewBox="-1 -1 2 2" aria-hidden="true">
          {points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />}
        </svg>
        <b style={{ '--stick-x': clampAxis(x), '--stick-y': clampAxis(y) } as CSSProperties} />
      </div>
      <dl className="m-0 grid grid-cols-2 gap-2 text-center">
        {([['X', x], ['Y', y]] as const).map(([axis, v]) => <div key={axis} className="grid gap-1"><dt className="font-mono text-[11px] text-muted-foreground">{axis}</dt><dd className="m-0 font-mono text-[13px] tabular-nums text-foreground">{rawAxis(v).toFixed(5)}</dd></div>)}
      </dl>
      <p className="m-0 flex items-center justify-between gap-2 border-0 border-t border-solid border-border pt-3 text-xs text-muted-foreground">{t('gamepad.circularity')} <strong className="font-mono text-[13px] font-medium tabular-nums text-success">{error === null ? '--' : `${error.toFixed(2)}%`}</strong></p>
    </Card>
  )
}

export function GamepadTest({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n()
  const [gamepads, setGamepads] = useState<GamepadSnapshot[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [leftPointsByPad, setLeftPointsByPad] = useState<Record<number, StickPoint[]>>({})
  const [rightPointsByPad, setRightPointsByPad] = useState<Record<number, StickPoint[]>>({})
  const activeIndexRef = useRef(activeIndex)

  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])

  useEffect(() => {
    let signature = ''
    return subscribeGamepads((next) => {
      // Browsers bump `timestamp` only on new input: skip identical frames so the page (and the 3D layout) stays idle.
      const nextSignature = next.map((gamepad) => `${gamepad.index}:${gamepad.connected}:${gamepad.timestamp}`).join('|')
      if (nextSignature === signature) return
      signature = nextSignature
      setGamepads(next)
      const selected = selectActiveGamepad(next, activeIndexRef.current)
      if (selected && selected.index !== activeIndexRef.current) setActiveIndex(selected.index)
      if (selected) {
        const left = { x: rawAxis(selected.axes[0]), y: rawAxis(selected.axes[1]) }
        const right = { x: rawAxis(selected.axes[2]), y: rawAxis(selected.axes[3]) }
        if (Math.hypot(left.x, left.y) > .08) setLeftPointsByPad((points) => ({ ...points, [selected.index]: [...(points[selected.index] ?? []).slice(-799), left] }))
        if (Math.hypot(right.x, right.y) > .08) setRightPointsByPad((points) => ({ ...points, [selected.index]: [...(points[selected.index] ?? []).slice(-799), right] }))
      }
    })
  }, [])

  const active = gamepads.find((gamepad) => gamepad.index === activeIndex) ?? gamepads[0] ?? EMPTY_SNAPSHOT
  const leftX = rawAxis(active.axes[0])
  const leftY = rawAxis(active.axes[1])
  const rightX = rawAxis(active.axes[2])
  const rightY = rawAxis(active.axes[3])
  const leftPoints = leftPointsByPad[active.index] ?? []
  const rightPoints = rightPointsByPad[active.index] ?? []
  const leftError = circularityError(leftPoints)
  const rightError = circularityError(rightPoints)
  const pressedCount = active.buttons.filter((button) => button.pressed || button.value > .5).length

  const rumble = async () => {
    const original = navigator.getGamepads?.()[active.index] as (Gamepad & { vibrationActuator?: { playEffect?: (effect: 'dual-rumble', params: { duration: number, startDelay: number, strongMagnitude: number, weakMagnitude: number }) => Promise<unknown> } }) | null
    await original?.vibrationActuator?.playEffect?.('dual-rumble', { duration: 300, startDelay: 0, strongMagnitude: .8, weakMagnitude: .45 })
  }

  const info = [[t('gamepad.index'), String(active.index)], [t('gamepad.timestamp'), `${active.timestamp.toFixed(2)} ms`]] as const
  return (
    <section className={embedded ? 'gamepad-embedded' : 'gamepad-workspace'}>
      {!embedded && <header className="gamepad-heading">
        <Badge variant="outline" className="mx-auto"><Gamepad2 /> {t('gamepad.diagnostics')}</Badge>
        <h1>{t('gamepad.title')}</h1>
        <p>{t('gamepad.subtitle')}</p>
      </header>}

      {!gamepads.length ? <Card className="mx-auto mt-6 grid min-h-[300px] w-full max-w-[680px] place-content-center justify-items-center gap-2 p-8 text-center">
        <span className="mb-2 grid size-12 place-items-center rounded-xl border border-solid border-border bg-black/30 text-primary"><Gamepad2 className="size-6" /></span>
        <strong className="font-heading text-lg font-semibold text-foreground">{t('gamepad.waitingTitle')}</strong>
        <span className="max-w-[360px] text-sm leading-relaxed text-muted-foreground">{t('gamepad.waitingDescription')}</span>
      </Card> : <div className="mx-auto grid w-full max-w-[1050px] gap-3">
        {gamepads.length > 1 && <Segmented className="mx-auto" aria-label={t('gamepad.connectedControllers')}>
          {gamepads.map((gamepad) => <SegmentedItem key={gamepad.index} active={active.index === gamepad.index} onClick={() => setActiveIndex(gamepad.index)}>{t('gamepad.controller')} {gamepad.index + 1}</SegmentedItem>)}
        </Segmented>}

        <Card className="flex-row flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 text-left">
          <div className="grid min-w-0 flex-1 basis-[220px] gap-1"><span className="text-xs font-medium text-muted-foreground">{t('gamepad.controller')}</span><strong className="truncate text-sm font-semibold text-foreground" title={active.id}>{active.id || t('gamepad.unknown')}</strong></div>
          {info.map(([term, detail]) => <div key={term} className="grid gap-1"><span className="text-xs font-medium text-muted-foreground">{term}</span><strong className="font-mono text-[13px] font-medium tabular-nums text-foreground">{detail}</strong></div>)}
          <Badge variant="success" className="gap-2"><i className="size-1.5 rounded-full bg-success" />{t('gamepad.connected')}</Badge>
          <Button variant="outline" size="sm" className="max-sm:w-full" onClick={() => { void rumble() }} disabled={!active.connected}><Vibrate /> {t('gamepad.rumble')}</Button>
        </Card>

        <div className="gamepad-diagnostics-grid w-full">
          <Card className="gamepad-controller-shell justify-center gap-2 overflow-hidden p-4">
            <Controller3D gamepad={active} leftX={leftX} leftY={leftY} label={t('gamepad.layoutLabel')} />
            <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">{t('gamepad.pressed')} <Badge variant={pressedCount ? 'default' : 'outline'} className="font-mono tabular-nums">{pressedCount} / {active.buttons.length}</Badge></p>
          </Card>

          <div className="gamepad-sticks-grid">
            <StickVisualizer name="left" x={leftX} y={leftY} points={leftPoints} error={leftError} />
            <StickVisualizer name="right" x={rightX} y={rightY} points={rightPoints} error={rightError} />
          </div>
        </div>

        <Card className="gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="m-0 flex items-center gap-2 font-heading text-sm font-semibold text-foreground"><Gamepad2 className="size-4 text-primary" /> {t('gamepad.rawAxes')}</h2><Button variant="outline" size="sm" onClick={() => { setLeftPointsByPad({}); setRightPointsByPad({}) }}><RotateCcw /> {t('gamepad.resetPath')}</Button></div>
          <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">{active.axes.map((axis, index) => <div key={index} className="grid gap-1 rounded-lg border border-solid border-border bg-black/25 px-3 py-2.5 text-center"><dt className="font-mono text-[11px] text-muted-foreground">AXIS {index}</dt><dd className="m-0 font-mono text-[13px] tabular-nums text-foreground">{rawAxis(axis).toFixed(5)}</dd></div>)}</dl>
        </Card>
      </div>}
    </section>
  )
}
