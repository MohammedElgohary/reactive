import { describe, it, expect, beforeEach } from "vitest";
import {
  registerState,
  getStateNames,
  buildScope,
  unregisterState,
  clearRegistry,
} from "../registry";

beforeEach(() => clearRegistry());

describe("registerState", () => {
  it("registers a state under a name", () => {
    const state = { count: 0 };
    registerState("counter", state);
    expect(buildScope().counter).toBe(state);
  });

  it("overwrites existing state with warning", () => {
    const s1 = { count: 0 };
    const s2 = { count: 99 };
    registerState("counter", s1);
    registerState("counter", s2);
    expect(buildScope().counter).toBe(s2);
  });

  it("registers multiple states independently", () => {
    const counter = { count: 0 };
    const user = { name: "Ali" };
    registerState("counter", counter);
    registerState("user", user);
    const scope = buildScope();
    expect(scope.counter).toBe(counter);
    expect(scope.user).toBe(user);
  });
});

describe("getStateNames", () => {
  it("returns empty array when registry is empty", () => {
    expect(getStateNames()).toEqual([]);
  });

  it("returns all registered names", () => {
    registerState("a", {});
    registerState("b", {});
    expect(getStateNames()).toContain("a");
    expect(getStateNames()).toContain("b");
    expect(getStateNames()).toHaveLength(2);
  });
});

describe("buildScope", () => {
  it("returns empty object when registry is empty", () => {
    expect(buildScope()).toEqual({});
  });

  it("builds scope with all registered states", () => {
    const counter = { count: 5 };
    const user = { name: "Ali" };
    registerState("counter", counter);
    registerState("user", user);
    const scope = buildScope();
    expect(scope.counter).toBe(counter);
    expect(scope.user).toBe(user);
  });

  it("scope object is a plain object not the registry itself", () => {
    registerState("counter", { count: 0 });
    const scope = buildScope();
    expect(Object.keys(scope)).toEqual(["counter"]);
  });
});

describe("unregisterState", () => {
  it("removes a registered state", () => {
    registerState("counter", { count: 0 });
    unregisterState("counter");
    expect(buildScope().counter).toBeUndefined();
    expect(getStateNames()).not.toContain("counter");
  });

  it("does not throw when unregistering unknown name", () => {
    expect(() => unregisterState("nonexistent")).not.toThrow();
  });
});

describe("clearRegistry", () => {
  it("removes all registered states", () => {
    registerState("a", {});
    registerState("b", {});
    clearRegistry();
    expect(getStateNames()).toHaveLength(0);
  });
});
