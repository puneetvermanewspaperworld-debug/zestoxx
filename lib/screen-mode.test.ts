import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { screenModeFor } from "./useScreenMode";

describe("which layout the Trade chart page uses", () => {
  it("an upright phone is portrait at every common width", () => {
    for (const [w, h] of [[320, 568], [360, 800], [375, 667], [390, 844], [412, 915], [430, 932], [767, 1024]]) assert.equal(screenModeFor(w, h), "portrait", `${w}x${h}`);
  });
  it("a phone on its side is landscape", () => {
    for (const [w, h] of [[844, 390], [667, 375], [740, 360], [932, 430], [915, 412], [800, 360]]) assert.equal(screenModeFor(w, h), "landscape", `${w}x${h}`);
  });
  it("a tablet or a desktop window keeps the wide layout", () => {
    for (const [w, h] of [[768, 1024], [1024, 768], [1280, 800], [1920, 1080], [1366, 768]]) assert.equal(screenModeFor(w, h), "wide", `${w}x${h}`);
  });
  it("a short but wide desktop window is not a phone", () => {
    assert.equal(screenModeFor(1280, 480), "wide");
    assert.equal(screenModeFor(1100, 450), "wide");
  });
  it("a narrow window is a phone even when it is short (narrow wins over the height rule)", () => {
    assert.equal(screenModeFor(500, 400), "landscape");
    assert.equal(screenModeFor(400, 500), "portrait");
  });
});
