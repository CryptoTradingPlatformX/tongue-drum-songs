import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

function param() {
  return {
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  };
}

function install(initialState = "suspended", withSession = true) {
  const order: string[] = [];
  let state = initialState;
  const listeners: Record<string, Listener> = {};
  const element = {
    paused: true,
    loop: false,
    src: "",
    playsInline: false,
    preload: "",
    hidden: false,
    attrs: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    },
    play() {
      order.push("html-play");
      this.paused = false;
      return Promise.resolve();
    },
  };

  function node(source: boolean) {
    return {
      connect() {},
      start() {
        if (source) order.push("start");
      },
      stop() {},
      gain: param(),
      frequency: param(),
      Q: param(),
      type: "",
      buffer: null as AudioBuffer | null,
    };
  }

  class FakeContext {
    sampleRate = 8000;
    currentTime = 2;
    destination = {};
    get state() {
      return state;
    }
    resume() {
      order.push("resume");
      return Promise.resolve().then(() => {
        order.push("resume-resolved");
      });
    }
    createGain() {
      return node(false);
    }
    createBiquadFilter() {
      return node(false);
    }
    createOscillator() {
      return node(true);
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(8) };
    }
    createBufferSource() {
      return node(true);
    }
  }

  const documentStub = {
    visibilityState: "visible",
    body: { appendChild: () => order.push("append") },
    createElement: () => {
      order.push("element");
      return element;
    },
    addEventListener: (type: string, fn: Listener) => {
      listeners[`document:${type}`] = fn;
    },
  };
  const navigatorStub = withSession ? { audioSession: { type: "auto" } } : {};
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("navigator", navigatorStub);
  vi.stubGlobal("window", {
    AudioContext: FakeContext,
    addEventListener: (type: string, fn: Listener) => {
      listeners[`window:${type}`] = fn;
    },
  });
  return {
    order,
    element,
    listeners,
    navigatorStub,
    documentStub,
    setState: (next: string) => {
      state = next;
    },
  };
}

async function loadAudio() {
  vi.resetModules();
  return import("./audio");
}

describe("iOS audio unlock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sets the playback session and starts one silent looping element inside the tap", async () => {
    const env = install();
    const { unlockAudio } = await loadAudio();
    unlockAudio();
    expect(env.navigatorStub.audioSession?.type).toBe("playback");
    expect(env.element.attrs.playsinline).toBe("");
    expect(env.element.playsInline).toBe(true);
    expect(env.element.loop).toBe(true);
    expect(env.element.hidden).toBe(true);
    expect(env.element.src.startsWith("data:audio/wav;base64,")).toBe(true);
    expect(env.order.filter((item) => item === "html-play")).toEqual(["html-play"]);
    expect(env.order).toContain("append");

    unlockAudio();
    expect(env.order.filter((item) => item === "element")).toEqual(["element"]);
    expect(env.order.filter((item) => item === "html-play")).toEqual(["html-play"]);
  });

  it("still unlocks when navigator.audioSession is missing", async () => {
    const env = install("suspended", false);
    const { unlockAudio } = await loadAudio();
    expect(() => unlockAudio()).not.toThrow();
    expect(env.order).toContain("html-play");
    expect(env.order).toContain("resume");
  });

  it("starts the tone in the same turn, without waiting for resume", async () => {
    const env = install("interrupted");
    const { unlockAudio, playTongue } = await loadAudio();
    unlockAudio();
    playTongue(69);
    const started = env.order.indexOf("start");
    expect(started).toBeGreaterThan(env.order.indexOf("resume"));
    expect(env.order.slice(0, started)).not.toContain("resume-resolved");
    expect(env.order.filter((item) => item === "start").length).toBeGreaterThan(0);
    await Promise.resolve();
    expect(env.order).toContain("resume-resolved");
  });

  it("resumes a suspended or interrupted context before each note, and leaves a running or closed one", async () => {
    const suspended = install("suspended");
    const audio = await loadAudio();
    audio.playTongue(60);
    expect(suspended.order[0]).toBe("resume");

    vi.resetModules();
    const interrupted = install("interrupted");
    const again = await loadAudio();
    again.playTongue(60);
    expect(interrupted.order[0]).toBe("resume");

    vi.resetModules();
    const running = install("running");
    const live = await loadAudio();
    live.playTongue(60);
    expect(running.order).not.toContain("resume");
    expect(running.order).toContain("start");

    vi.resetModules();
    const closed = install("closed");
    const done = await loadAudio();
    done.playTongue(60);
    expect(closed.order).not.toContain("resume");
  });

  it("resumes an interrupted context when the page is shown again", async () => {
    const env = install("suspended");
    const { unlockAudio } = await loadAudio();
    unlockAudio();
    env.setState("interrupted");
    env.order.length = 0;

    env.documentStub.visibilityState = "hidden";
    env.listeners["document:visibilitychange"]();
    expect(env.order).not.toContain("resume");

    env.documentStub.visibilityState = "visible";
    env.listeners["document:visibilitychange"]();
    env.listeners["window:pageshow"]();
    expect(env.order.filter((item) => item === "resume")).toEqual(["resume", "resume"]);
  });
});
