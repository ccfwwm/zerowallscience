import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zwsSlideCaptureRectangle, adaptUniverSlideCapture } from './adapt-univer-slide-capture.mjs'

test('slide capture maps logical coordinates through zoom and viewport scroll', () => {
  const scene = {
    getMainViewport: () => ({ getViewportScrollByScrollXY: () => ({x: 184, y: 49.5}) }),
    transform: { applyPoint: ({x, y}) => ({x: x * 0.75, y: y * 0.75}) },
  }
  assert.deepEqual(zwsSlideCaptureRectangle(scene, {left: 200, top: 60, width:1600, height:900}), {left:12, top:7.875, width:1200, height:675})
})

test('slide capture adaptation rejects changed upstream anchors instead of silently leaving clipping', () => {
  assert.throws(() => adaptUniverSlideCapture('changed renderer'), /no longer matches/u)
  const result = adaptUniverSlideCapture('let s=pNi(e,t.unitId);await WPi(s,t,o);d=()=>hNi(s,region,1,1);')
  assert.match(result, /await zwsFitSlideScene\(s\)/u)
  assert.match(result, /d=\(\)=>zwsCaptureSlideRegion\(s,/u)
  assert.doesNotMatch(result, /d=\(\)=>hNi/u)
})
