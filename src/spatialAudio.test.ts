import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpatialAudio } from './spatialAudio'

const param=()=>({value:0})
class Context {
  state='suspended'; currentTime=1; sampleRate=48000; destination={}
  listener={positionX:param(),positionY:param(),positionZ:param(),forwardX:param(),forwardY:param(),forwardZ:param(),upX:param(),upY:param(),upZ:param()}
  panner={panningModel:'equalpower',distanceModel:'inverse',refDistance:1,rolloffFactor:1,positionX:param(),positionY:param(),positionZ:param(),connect:vi.fn(),disconnect:vi.fn()}
  gain={gain:param(),connect:vi.fn(),disconnect:vi.fn()}
  sources:ReturnType<Context['createBufferSource']>[]=[]
  createPanner(){return this.panner} createGain(){return this.gain}
  createBuffer(_channels:number,length:number){const samples=new Float32Array(length);return {getChannelData:()=>samples}}
  createBufferSource(): {buffer:unknown;connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;onended:null|(()=>void)} {
    const source={buffer:null,connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};this.sources.push(source);return source
  }
  resume=vi.fn(async()=>{this.state='running'})
  suspend=vi.fn(async()=>{this.state='suspended'})
  close=vi.fn(async()=>{this.state='closed'})
}
afterEach(()=>vi.unstubAllGlobals())
describe('Spatial Audio procedural HRTF resource lifecycle',()=>{
  it('schedules three deterministic enveloped pulses with conservative gain and matching coordinates',async()=>{
    vi.stubGlobal('AudioContext',Context)
    const audio=new SpatialAudio(), context=audio.context as unknown as Context
    expect(context.state).toBe('suspended');expect(context.panner.panningModel).toBe('HRTF');expect(context.gain.gain.value).toBe(.12)
    await audio.resume();expect(audio.cue({x:1,y:0,z:0})).toBe(1.03)
    expect(context.sources.map(s=>s.start.mock.calls[0][0])).toEqual([1.03,1.28,1.53])
    expect(context.panner.positionX.value).toBe(6);expect(context.panner.positionY.value).toBe(1.65)
    expect(context.sources[0].buffer).toBe(context.sources[2].buffer)
    const samples=(context.sources[0].buffer as AudioBuffer).getChannelData(0)
    expect(samples.length).toBe(5760);expect(Math.abs(samples[0])).toBe(0);expect(Math.abs(samples.at(-1)!)).toBeLessThan(.00001)
    expect(new Set(samples).size).toBeGreaterThan(5000)
    audio.updateListener({x:1,y:0,z:0},{x:0,y:1,z:0});expect(context.listener.forwardX.value).toBe(1);expect(context.listener.upY.value).toBe(1)
    audio.cue({x:0,y:0,z:1});expect(context.panner.positionZ.value).toBe(6)
    for(const source of context.sources.slice(0,3)){expect(source.stop).toHaveBeenCalledTimes(1);expect(source.disconnect).toHaveBeenCalledTimes(1)}
    await audio.suspend();expect(context.state).toBe('suspended')
    for(const source of context.sources)expect(source.stop).toHaveBeenCalledTimes(1)
    audio.dispose();expect(context.close).toHaveBeenCalledTimes(1);expect(context.panner.disconnect).toHaveBeenCalledTimes(1)
  })
})
