"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));

// src/usbipd.ts
var import_child_process = require("child_process");
var import_util = require("util");
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
async function runUsbipd(args) {
  const { stdout, stderr } = await execFileAsync(
    "usbipd.exe",
    args
  );
  if (stderr?.trim()) {
    console.log(
      "[usbipd stderr]",
      stderr.trim()
    );
  }
  return stdout;
}
async function listUsbDevices() {
  const output = await runUsbipd(["list"]);
  const devices = [];
  let connected = false;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.trim() === "Connected:") {
      connected = true;
      continue;
    }
    if (line.trim() === "Persisted:") {
      connected = false;
      continue;
    }
    if (!connected) {
      continue;
    }
    if (line.trim() === "" || line.trimStart().startsWith(
      "BUSID"
    )) {
      continue;
    }
    const match = line.match(
      /^\s*(\d+-\d+)\s+([0-9a-fA-F]{4}):([0-9a-fA-F]{4})\s+(.+?)\s{2,}(.+?)\s*$/
    );
    if (!match) {
      continue;
    }
    devices.push({
      busId: match[1],
      vid: match[2].toLowerCase(),
      pid: match[3].toLowerCase(),
      device: match[4].trim(),
      state: match[5].trim()
    });
  }
  return devices;
}
async function attachUsbDevice(busId) {
  await runUsbipd([
    "attach",
    "--wsl",
    "--busid",
    busId
  ]);
}
async function detachUsbDevice(busId) {
  await runUsbipd([
    "detach",
    "--busid",
    busId
  ]);
}
function isAttached(device) {
  return device.state.toLowerCase().includes("attached");
}
function getDeviceStateLabel(device) {
  const state = device.state.toLowerCase();
  if (state.includes("attached")) {
    return "WSL Attached";
  }
  if (state.includes("shared")) {
    return "Shared / Ready";
  }
  return "Windows / Not shared";
}

// src/autoAttachStore.ts
var STORAGE_KEY = "autoAttachDevices";
var AutoAttachStore = class {
  constructor(context) {
    this.context = context;
  }
  context;
  getAll() {
    return this.context.globalState.get(
      STORAGE_KEY,
      []
    );
  }
  async add(device) {
    const devices = this.getAll();
    const exists = devices.some(
      (item) => item.vid === device.vid && item.pid === device.pid
    );
    if (exists) {
      return;
    }
    devices.push(device);
    await this.context.globalState.update(
      STORAGE_KEY,
      devices
    );
  }
  async remove(vid, pid) {
    const devices = this.getAll().filter(
      (item) => !(item.vid === vid && item.pid === pid)
    );
    await this.context.globalState.update(
      STORAGE_KEY,
      devices
    );
  }
  has(vid, pid) {
    return this.getAll().some(
      (item) => item.vid === vid && item.pid === pid
    );
  }
};

// src/extension.ts
var store;
var autoAttachTimer;
var autoAttachRunning = false;
var autoAttachedBusIds = /* @__PURE__ */ new Set();
function activate(context) {
  console.log(
    "WSL USB Manager activated",
    "platform:",
    process.platform,
    "remoteName:",
    vscode.env.remoteName
  );
  store = new AutoAttachStore(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "wslUsbManager.showDevices",
      showDevices
    ),
    vscode.commands.registerCommand(
      "wslUsbManager.showAttachedDevices",
      showAttachedDevices
    ),
    vscode.commands.registerCommand(
      "wslUsbManager.attachDevice",
      attachDevice
    ),
    vscode.commands.registerCommand(
      "wslUsbManager.detachDevice",
      detachDevice
    ),
    vscode.commands.registerCommand(
      "wslUsbManager.manageAutoAttach",
      manageAutoAttach
    )
  );
  startAutoAttachMonitor();
}
async function showDevices() {
  try {
    const devices = await listUsbDevices();
    if (devices.length === 0) {
      vscode.window.showInformationMessage(
        "No USB devices found."
      );
      return;
    }
    const selected = await vscode.window.showQuickPick(
      devices.map((device) => {
        const autoAttach = store.has(
          device.vid,
          device.pid
        );
        return {
          label: isAttached(device) ? `$(vm) ${device.vid}:${device.pid}` : `$(debug-disconnect) ${device.vid}:${device.pid}`,
          description: device.device,
          detail: `${device.busId} | ${getDeviceStateLabel(device)} | Auto Attach ${autoAttach ? "\u2713" : "\u2717"}`,
          device
        };
      }),
      {
        placeHolder: "USB devices"
      }
    );
    if (!selected) {
      return;
    }
  } catch (error) {
    showError(error);
  }
}
async function attachDevice() {
  try {
    const devices = await listUsbDevices();
    const candidates = devices.filter(
      (device) => !isAttached(device)
    );
    const selected = await vscode.window.showQuickPick(
      candidates.map(
        (device) => ({
          label: `${device.vid}:${device.pid}`,
          description: device.device,
          detail: `${device.busId} | ${device.state}`,
          device
        })
      ),
      {
        placeHolder: "Attach USB device to WSL"
      }
    );
    if (!selected) {
      return;
    }
    await attachUsbDevice(
      selected.device.busId
    );
    vscode.window.showInformationMessage(
      `Attached ${selected.device.device}`
    );
  } catch (error) {
    showError(error);
  }
}
async function detachDevice() {
  try {
    const devices = await listUsbDevices();
    const candidates = devices.filter(isAttached);
    const selected = await vscode.window.showQuickPick(
      candidates.map(
        (device) => ({
          label: `${device.vid}:${device.pid}`,
          description: device.device,
          detail: selectedState(device),
          device
        })
      ),
      {
        placeHolder: "Detach USB device from WSL"
      }
    );
    if (!selected) {
      return;
    }
    await detachUsbDevice(
      selected.device.busId
    );
    vscode.window.showInformationMessage(
      `Detached ${selected.device.device}`
    );
  } catch (error) {
    showError(error);
  }
}
async function manageAutoAttach() {
  try {
    const devices = await listUsbDevices();
    if (devices.length === 0) {
      vscode.window.showInformationMessage(
        "No USB devices found."
      );
      return;
    }
    const selected = await vscode.window.showQuickPick(
      devices.map((device2) => {
        const enabled2 = store.has(
          device2.vid,
          device2.pid
        );
        return {
          label: enabled2 ? `$(check) ${device2.vid}:${device2.pid}` : `$(circle-outline) ${device2.vid}:${device2.pid}`,
          description: device2.device,
          detail: `${device2.busId} | ${getDeviceStateLabel(device2)} | Auto Attach ${enabled2 ? "ON" : "OFF"}`,
          device: device2
        };
      }),
      {
        placeHolder: "Select a device to toggle Auto Attach"
      }
    );
    if (!selected) {
      return;
    }
    const device = selected.device;
    const enabled = store.has(
      device.vid,
      device.pid
    );
    if (enabled) {
      await store.remove(
        device.vid,
        device.pid
      );
      vscode.window.showInformationMessage(
        `Auto Attach disabled: ${device.vid}:${device.pid}`
      );
    } else {
      await store.add({
        vid: device.vid,
        pid: device.pid,
        name: device.device
      });
      vscode.window.showInformationMessage(
        `Auto Attach enabled: ${device.vid}:${device.pid}`
      );
    }
  } catch (error) {
    showError(error);
  }
}
async function showAttachedDevices() {
  try {
    const devices = await listUsbDevices();
    const attached = devices.filter(
      (device) => isAttached(device)
    );
    if (attached.length === 0) {
      vscode.window.showInformationMessage(
        "No USB devices are attached to WSL."
      );
      return;
    }
    await vscode.window.showQuickPick(
      attached.map((device) => ({
        label: `${device.vid}:${device.pid}`,
        description: device.device,
        detail: `${device.busId} | WSL Attached`,
        device
      })),
      {
        placeHolder: "USB devices attached to WSL"
      }
    );
  } catch (error) {
    showError(error);
  }
}
function selectedState(device) {
  return `${device.busId} | ${device.state}`;
}
function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  vscode.window.showErrorMessage(
    `WSL USB Manager: ${message}`
  );
}
async function deactivate() {
  if (autoAttachTimer) {
    clearInterval(autoAttachTimer);
    autoAttachTimer = void 0;
  }
  await detachAutoAttachedDevices();
}
function startAutoAttachMonitor() {
  if (autoAttachTimer) {
    clearInterval(autoAttachTimer);
  }
  autoAttachTimer = setInterval(
    () => {
      void processAutoAttach();
    },
    1e3
  );
  void processAutoAttach();
}
async function processAutoAttach() {
  if (autoAttachRunning) {
    return;
  }
  autoAttachRunning = true;
  try {
    const devices = await listUsbDevices();
    const currentBusIds = new Set(
      devices.map(
        (device) => device.busId
      )
    );
    for (const busId of Array.from(autoAttachedBusIds)) {
      if (!currentBusIds.has(busId)) {
        autoAttachedBusIds.delete(
          busId
        );
      }
    }
    const autoDevices = store.getAll();
    for (const device of devices) {
      const matched = autoDevices.some(
        (rule) => rule.vid.toLowerCase() === device.vid.toLowerCase() && rule.pid.toLowerCase() === device.pid.toLowerCase()
      );
      if (!matched) {
        continue;
      }
      if (isAttached(device)) {
        continue;
      }
      if (!device.state.toLowerCase().includes("shared")) {
        continue;
      }
      try {
        console.log(
          `[WSL USB] Auto attaching ${device.vid}:${device.pid} BUSID=${device.busId}`
        );
        await attachUsbDevice(
          device.busId
        );
        autoAttachedBusIds.add(
          device.busId
        );
        console.log(
          `[WSL USB] Attached ${device.vid}:${device.pid} BUSID=${device.busId}`
        );
      } catch (error) {
        console.error(
          `[WSL USB] Auto attach failed ${device.vid}:${device.pid}`,
          error
        );
      }
    }
  } catch (error) {
    console.error(
      "[WSL USB] Auto attach scan failed",
      error
    );
  } finally {
    autoAttachRunning = false;
  }
}
async function detachAutoAttachedDevices() {
  const busIds = Array.from(autoAttachedBusIds);
  for (const busId of busIds) {
    try {
      console.log(
        `[WSL USB] Detaching managed device BUSID=${busId}`
      );
      await detachUsbDevice(
        busId
      );
      autoAttachedBusIds.delete(
        busId
      );
      console.log(
        `[WSL USB] Detached BUSID=${busId}`
      );
    } catch (error) {
      console.error(
        `[WSL USB] Failed to detach BUSID=${busId}`,
        error
      );
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
