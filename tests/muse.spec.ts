import { test, expect } from "vitest";
import { museExecutableNames } from "../src/host/muse.js";

test("Windows detection includes muse.exe", () => {
  expect(museExecutableNames("win32")).toEqual([
    "muse.exe",
    "muse.cmd",
    "muse.bat",
    "muse",
  ]);
  expect(museExecutableNames("darwin")).toEqual(["muse"]);
  expect(museExecutableNames("linux")).toEqual(["muse"]);
});
