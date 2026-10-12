import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { MissionWaves, mountFpsGame } from './fps';

test('three cleared waves complete with ordinary 50 ms frames', () => {
  const mission = new MissionWaves();
  for (const expectedWave of [2, 3, 3]) {
    let advanced = false;
    for (let frame = 0; frame < 40 && !advanced; frame += 1) {
      advanced = mission.update(0.05, 0);
    }
    assert.equal(advanced, true, 'cleared waves must not leave a negative timer stuck');
    assert.equal(mission.wave, expectedWave);
  }
  assert.equal(mission.complete, true);
  assert.equal(mission.update(0.05, 0), false, 'completion is reported only once');
});

test('living enemies stop wave advancement and reset a partial clear countdown', () => {
  const mission = new MissionWaves();
  for (let frame = 0; frame < 20; frame += 1) assert.equal(mission.update(0.05, 0), false);
  for (let frame = 0; frame < 100; frame += 1) assert.equal(mission.update(0.05, 1), false);
  assert.equal(mission.wave, 1);
  for (let frame = 0; frame < 26; frame += 1) assert.equal(mission.update(0.05, 0), false);
  assert.equal(mission.update(0.05, 0), true);
  assert.equal(mission.wave, 2);
});

// This harness observes runtime state and input handlers. It does not verify
// browser rendering, Pointer Lock permissions, layout, or visual crosshair position.
type Input = { key?: string; button?: number; movementX?: number; preventDefault(): void };
type Listener = (event: Input) => void;
class FakeTarget {
  private listeners = new Map<string, Listener[]>();
  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  emit(name: string, values: Partial<Input> = {}) {
    const event = { preventDefault() {}, ...values };
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
}
class FakeClasses {
  private values = new Set<string>();
  add(...names: string[]) { names.forEach(name => this.values.add(name)); }
  remove(...names: string[]) { names.forEach(name => this.values.delete(name)); }
  contains(name: string) { return this.values.has(name); }
  toggle(name: string, force?: boolean) {
    const present = force ?? !this.contains(name);
    if (present) this.add(name); else this.remove(name);
    return present;
  }
}
class FakeElement extends FakeTarget {
  textContent = '';
  className = '';
  hidden = false;
  classList = new FakeClasses();
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  private markup = '';
  private selectors = new Map<string, FakeElement>();
  private attributes = new Map<string, string>();
  get innerHTML() { return this.markup; }
  set innerHTML(value: string) {
    this.markup = value;
    this.selectors.clear();
    for (const match of value.matchAll(/<([\w-]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
      this.selectors.set(`#${match[2]}`, match[1] === 'canvas' ? new FakeCanvas() : new FakeElement());
    }
  }
  querySelector(selector: string) {
    if ((selector === 'strong' || selector === 'span:last-child') && !this.selectors.has(selector)) {
      this.selectors.set(selector, new FakeElement());
    }
    return this.selectors.get(selector) ?? null;
  }
  append(child: FakeElement) { this.children.push(child); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getBoundingClientRect() { return { width: 480, height: 320 }; }
}
class FakeContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  globalAlpha = 1;
  playerPoint: { x: number; y: number } | undefined;
  createLinearGradient() { return { addColorStop() {} }; }
  clearRect() {}
  fillRect() {}
  save() {}
  restore() {}
  translate() {}
  rotate() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  closePath() {}
  fill() {}
  stroke() {}
  arc(x: number, y: number) {
    if (this.fillStyle === '#c7e07a') this.playerPoint = { x, y };
  }
}
class FakeCanvas extends FakeElement {
  width = 240;
  height = 156;
  context = new FakeContext();
  requestPointerLock: (() => unknown) | undefined;
  getContext() { return this.context; }
}
class FakeDocument extends FakeTarget {
  pointerLockElement: FakeCanvas | null = null;
  hidden = false;
  createElement() { return new FakeElement(); }
  exitPointerLock() {
    this.pointerLockElement = null;
    this.emit('pointerlockchange');
  }
}

function mountHarness(t: TestContext) {
  const root = new FakeElement();
  const document = new FakeDocument();
  const window = new FakeTarget();
  const frames: FrameRequestCallback[] = [];
  let now = performance.now();
  const globals: Record<string, unknown> = {
    document, window,
    requestAnimationFrame(callback: FrameRequestCallback) { frames.push(callback); return frames.length; },
  };
  const originals = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  mountFpsGame(root as unknown as HTMLElement);
  const element = (id: string) => {
    const found = root.querySelector(`#${id}`);
    assert.ok(found, `mounted UI is missing #${id}`);
    return found;
  };
  const canvas = element('game-canvas') as FakeCanvas;
  const minimap = element('mini-map') as FakeCanvas;
  canvas.requestPointerLock = () => {
    document.pointerLockElement = canvas;
    document.emit('pointerlockchange');
    return Promise.resolve();
  };
  element('sound-toggle').emit('click');
  const step = (count = 1) => {
    for (let frame = 0; frame < count; frame += 1) {
      const callback = frames.shift();
      assert.ok(callback, 'the game must keep scheduling frames');
      now += 50;
      callback(now);
    }
  };
  const ammo = () => Number(element('ammo-value').innerHTML.match(/^\d+/)?.[0]);
  const state = () => element('mission-state').textContent;
  const dragButton = () => {
    const button = element('start-prompt').children.find(child => child.className === 'drag-start-button');
    assert.ok(button);
    return button;
  };
  return { root, document, window, canvas, minimap, element, step, ammo, state, dragButton };
}

test('rejected mouse lock stays READY and explicit drag mode starts without spending ammo', async t => {
  const game = mountHarness(t);
  game.canvas.requestPointerLock = () => Promise.reject(new DOMException('Blocked by sandbox', 'SecurityError'));
  game.canvas.emit('click');
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(game.state(), 'READY · WAVE 01');
  assert.equal(game.dragButton().hidden, false);
  game.step(30);
  assert.equal(game.element('health-value').textContent, '100');
  assert.equal(game.ammo(), 30);
  game.dragButton().emit('click');
  assert.equal(game.state(), 'ACTIVE · WAVE 01');
  assert.equal(game.ammo(), 30);
  game.canvas.emit('click');
  game.step();
  assert.equal(game.ammo(), 29);
});

test('synchronous lock failure and legacy pointerlockerror expose the same explicit fallback', t => {
  const game = mountHarness(t);
  game.canvas.requestPointerLock = () => { throw new DOMException('No permission', 'SecurityError'); };
  assert.doesNotThrow(() => game.canvas.emit('click'));
  assert.equal(game.state(), 'READY · WAVE 01');
  assert.equal(game.dragButton().hidden, false);
  game.element('restart-button').emit('click');
  game.canvas.requestPointerLock = () => undefined;
  game.canvas.emit('click');
  assert.equal(game.dragButton().hidden, true);
  game.document.emit('pointerlockerror');
  assert.equal(game.dragButton().hidden, false);
  assert.equal(game.state(), 'READY · WAVE 01');
});

test('initial mouse lock does not fire; Escape, blur and hidden pages pause input', t => {
  const game = mountHarness(t);
  game.canvas.emit('click');
  game.step();
  assert.equal(game.state(), 'ACTIVE · WAVE 01');
  assert.equal(game.ammo(), 30);
  game.canvas.emit('click');
  game.step(2);
  assert.equal(game.ammo(), 29);

  const pauses = [
    () => game.window.emit('keydown', { key: 'Escape' }),
    () => game.window.emit('blur'),
    () => { game.document.hidden = true; game.document.emit('visibilitychange'); },
  ];
  for (const pause of pauses) {
    game.window.emit('keydown', { key: 'w' });
    game.step();
    const before = { ...game.minimap.context.playerPoint };
    pause();
    assert.equal(game.state(), 'PAUSED · WAVE 01');
    const ammoBefore = game.ammo();
    game.window.emit('keydown', { key: ' ' });
    game.window.emit('keydown', { key: 'r' });
    game.step(4);
    assert.equal(game.ammo(), ammoBefore);
    assert.equal(game.element('reload-prompt').classList.contains('visible'), false);
    assert.deepEqual(game.minimap.context.playerPoint, before);
    game.document.hidden = false;
    game.canvas.emit('click');
    game.step(4);
    assert.equal(game.state(), 'ACTIVE · WAVE 01');
    assert.equal(game.ammo(), ammoBefore, 'the resume click must not fire');
    assert.deepEqual(game.minimap.context.playerPoint, before, 'held movement must clear on resume');
  }
});

test('redeployment clears an in-progress reload and ammunition renders ten closed pips', t => {
  const game = mountHarness(t);
  game.canvas.emit('click');
  game.canvas.emit('click');
  game.step();
  game.window.emit('keydown', { key: 'r' });
  assert.equal(game.element('reload-prompt').classList.contains('visible'), true);
  game.element('restart-button').emit('click');
  assert.equal(game.state(), 'READY · WAVE 01');
  assert.equal(game.ammo(), 30);
  assert.equal(game.element('reload-prompt').classList.contains('visible'), false);
  const markup = game.element('ammo-pips').innerHTML;
  assert.equal([...markup.matchAll(/<i class="(?:filled)?"><\/i>/g)].length, 10);
  assert.equal(markup.match(/<\/i>/g)?.length, 10);
});
