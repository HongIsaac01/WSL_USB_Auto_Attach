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
var vscode2 = __toESM(require("vscode"));

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

// src/deviceTreeProvider.ts
var vscode = __toESM(require("vscode"));
var DeviceTreeProvider = class {
  constructor(store2, aliasStore2) {
    this.store = store2;
    this.aliasStore = aliasStore2;
  }
  store;
  aliasStore;
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  //
  // usbipd list 결과 cache
  //
  devices = [];
  /**
   * extension.ts에서 읽은 최신 USB 목록을 전달한다.
   *
   * DeviceTreeProvider 자체에서는 usbipd.exe를 호출하지 않는다.
   */
  updateDevices(devices) {
    this.devices = devices;
    this.refresh();
  }
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    if (element.type === "section") {
      const item2 = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item2.contextValue = "wslUsbSection";
      return item2;
    }
    const device = element.device;
    const attached = isAttached(device);
    const autoAttach = this.store.has(
      device.vid,
      device.pid
    );
    const disconnected = device.state === "Disconnected";
    const alias = this.aliasStore.get(
      device.vid,
      device.pid
    );
    const item = new vscode.TreeItem(
      alias ?? device.device,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = disconnected ? `${device.vid}:${device.pid} \xB7 Disconnected` : `${device.vid}:${device.pid}`;
    item.tooltip = [
      alias ? `Name: ${alias}` : void 0,
      `Device: ${device.device}`,
      `VID:PID: ${device.vid}:${device.pid}`,
      device.busId ? `BUSID: ${device.busId}` : "BUSID: Not connected",
      disconnected ? "State: Disconnected" : `State: ${getDeviceStateLabel(device)}`,
      `Auto Attach: ${autoAttach ? "ON" : "OFF"}`
    ].filter(Boolean).join("\n");
    if (element.section === "attached") {
      item.contextValue = autoAttach ? "attachedAutoDevice" : "attachedDevice";
      item.iconPath = new vscode.ThemeIcon(
        "vm-active"
      );
    } else if (element.section === "available") {
      item.contextValue = autoAttach ? "availableAutoDevice" : "availableDevice";
      item.iconPath = new vscode.ThemeIcon(
        "plug"
      );
    } else {
      item.contextValue = attached ? "managedAttachedDevice" : "managedAvailableDevice";
      item.iconPath = new vscode.ThemeIcon(
        disconnected ? "circle-slash" : attached ? "vm-active" : "check"
      );
    }
    return item;
  }
  getChildren(element) {
    const devices = this.devices;
    if (!element) {
      return [
        {
          type: "section",
          label: "Attached to WSL",
          section: "attached"
        },
        {
          type: "section",
          label: "Available on Windows",
          section: "available"
        },
        {
          type: "section",
          label: "Auto Attach Devices",
          section: "managed"
        }
      ];
    }
    if (element.type !== "section") {
      return [];
    }
    switch (element.section) {
      //
      // 현재 WSL에 attach된 실제 USB
      //
      case "attached":
        return devices.filter(isAttached).map((device) => ({
          type: "device",
          device,
          section: "attached"
        }));
      //
      // 현재 Windows 측에서 사용 가능한 USB
      //
      case "available":
        return devices.filter(
          (device) => !isAttached(device)
        ).map((device) => ({
          type: "device",
          device,
          section: "available"
        }));
      //
      // Auto Attach 등록 목록
      //
      // 현재 USB가 빠져 있어도 표시한다.
      //
      case "managed": {
        const managedDevices = this.store.getAll();
        return managedDevices.map(
          (managed) => {
            const connectedDevice = devices.find(
              (device2) => device2.vid === managed.vid && device2.pid === managed.pid
            );
            const device = connectedDevice ?? {
              busId: "",
              vid: managed.vid,
              pid: managed.pid,
              device: managed.name,
              state: "Disconnected"
            };
            return {
              type: "device",
              device,
              section: "managed"
            };
          }
        );
      }
    }
  }
};

// src/deviceAliasStore.ts
var STORAGE_KEY2 = "deviceAliases";
var DeviceAliasStore = class {
  constructor(context) {
    this.context = context;
  }
  context;
  makeKey(vid, pid) {
    return `${vid.toLowerCase()}:${pid.toLowerCase()}`;
  }
  get(vid, pid) {
    const aliases = this.context.globalState.get(
      STORAGE_KEY2,
      {}
    );
    return aliases[this.makeKey(vid, pid)];
  }
  async set(vid, pid, alias) {
    const aliases = {
      ...this.context.globalState.get(
        STORAGE_KEY2,
        {}
      )
    };
    aliases[this.makeKey(vid, pid)] = alias;
    await this.context.globalState.update(
      STORAGE_KEY2,
      aliases
    );
  }
  async remove(vid, pid) {
    const aliases = {
      ...this.context.globalState.get(
        STORAGE_KEY2,
        {}
      )
    };
    delete aliases[this.makeKey(vid, pid)];
    await this.context.globalState.update(
      STORAGE_KEY2,
      aliases
    );
  }
};

// src/extension.ts
var aliasStore;
var store;
var autoAttachTimer;
var autoAttachRunning = false;
var autoAttachedBusIds = /* @__PURE__ */ new Set();
var autoAttachSuppressed = /* @__PURE__ */ new Set();
var treeProvider;
var lastDeviceSnapshot = "";
function getDeviceKey(vid, pid) {
  return `${vid.toLowerCase()}:${pid.toLowerCase()}`;
}
function activate(context) {
  console.log(
    "WSL USB Manager activated",
    "platform:",
    process.platform,
    "remoteName:",
    vscode2.env.remoteName
  );
  store = new AutoAttachStore(context);
  aliasStore = new DeviceAliasStore(context);
  treeProvider = new DeviceTreeProvider(
    store,
    aliasStore
  );
  context.subscriptions.push(
    vscode2.commands.registerCommand(
      "wslUsbManager.showDevices",
      showDevices
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.showAttachedDevices",
      showAttachedDevices
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.attachDevice",
      attachDevice
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.detachDevice",
      detachDevice
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.manageAutoAttach",
      manageAutoAttach
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.treeAttach",
      attachTreeDevice
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.treeDetach",
      detachTreeDevice
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.treeEnableAutoAttach",
      enableTreeAutoAttach
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.treeDisableAutoAttach",
      disableTreeAutoAttach
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.refresh",
      async () => {
        try {
          await refreshUsbDevices();
        } catch (error) {
          showError(error);
        }
      }
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.renameDevice",
      renameTreeDevice
    )
  );
  const treeView = vscode2.window.createTreeView(
    "wslUsbManager.devicesView",
    {
      treeDataProvider: treeProvider,
      showCollapseAll: true
    }
  );
  context.subscriptions.push(treeView);
  startAutoAttachMonitor();
}
async function showDevices() {
  try {
    const devices = await listUsbDevices();
    if (devices.length === 0) {
      vscode2.window.showInformationMessage(
        "No USB devices found."
      );
      return;
    }
    const selected = await vscode2.window.showQuickPick(
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
    const selected = await vscode2.window.showQuickPick(
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
    autoAttachSuppressed.delete(
      getDeviceKey(
        selected.device.vid,
        selected.device.pid
      )
    );
    await attachUsbDevice(
      selected.device.busId
    );
    await refreshUsbDevices();
    vscode2.window.showInformationMessage(
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
    const selected = await vscode2.window.showQuickPick(
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
    autoAttachSuppressed.add(
      getDeviceKey(
        selected.device.vid,
        selected.device.pid
      )
    );
    autoAttachedBusIds.delete(
      selected.device.busId
    );
    await detachUsbDevice(
      selected.device.busId
    );
    await refreshUsbDevices();
    vscode2.window.showInformationMessage(
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
      vscode2.window.showInformationMessage(
        "No USB devices found."
      );
      return;
    }
    const selected = await vscode2.window.showQuickPick(
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
      treeProvider.refresh();
      vscode2.window.showInformationMessage(
        `Auto Attach disabled: ${device.vid}:${device.pid}`
      );
    } else {
      await store.add({
        vid: device.vid,
        pid: device.pid,
        name: device.device
      });
      treeProvider.refresh();
      vscode2.window.showInformationMessage(
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
      vscode2.window.showInformationMessage(
        "No USB devices are attached to WSL."
      );
      return;
    }
    await vscode2.window.showQuickPick(
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
  vscode2.window.showErrorMessage(
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
      devices.map((device) => device.busId)
    );
    for (const busId of Array.from(autoAttachedBusIds)) {
      if (!currentBusIds.has(busId)) {
        autoAttachedBusIds.delete(busId);
      }
    }
    const currentDeviceKeys = new Set(
      devices.map(
        (device) => getDeviceKey(
          device.vid,
          device.pid
        )
      )
    );
    for (const key of Array.from(autoAttachSuppressed)) {
      if (!currentDeviceKeys.has(key)) {
        autoAttachSuppressed.delete(key);
      }
    }
    const autoDevices = store.getAll();
    let deviceStateChanged = false;
    for (const device of devices) {
      const matched = autoDevices.some(
        (rule) => rule.vid.toLowerCase() === device.vid.toLowerCase() && rule.pid.toLowerCase() === device.pid.toLowerCase()
      );
      if (!matched) {
        continue;
      }
      const key = getDeviceKey(
        device.vid,
        device.pid
      );
      if (autoAttachSuppressed.has(key)) {
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
        deviceStateChanged = true;
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
    const latestDevices = deviceStateChanged ? await listUsbDevices() : devices;
    const snapshot = createDeviceSnapshot(
      latestDevices
    );
    if (snapshot !== lastDeviceSnapshot) {
      lastDeviceSnapshot = snapshot;
      treeProvider.updateDevices(
        latestDevices
      );
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
      treeProvider.refresh();
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
function createDeviceSnapshot(devices) {
  return devices.map(
    (device) => [
      device.busId,
      device.vid,
      device.pid,
      device.state,
      store.has(device.vid, device.pid) ? "auto" : "manual"
    ].join("|")
  ).sort().join("\n");
}
async function refreshUsbDevices() {
  const devices = await listUsbDevices();
  treeProvider.updateDevices(
    devices
  );
  return devices;
}
async function attachTreeDevice(node) {
  try {
    if (!node?.device) {
      return;
    }
    autoAttachSuppressed.delete(
      getDeviceKey(
        node.device.vid,
        node.device.pid
      )
    );
    await attachUsbDevice(
      node.device.busId
    );
    await refreshUsbDevices();
    vscode2.window.showInformationMessage(
      `Attached ${node.device.device} to WSL`
    );
  } catch (error) {
    showError(error);
  }
}
async function detachTreeDevice(node) {
  try {
    if (!node?.device) {
      return;
    }
    autoAttachSuppressed.add(
      getDeviceKey(
        node.device.vid,
        node.device.pid
      )
    );
    autoAttachedBusIds.delete(
      node.device.busId
    );
    await detachUsbDevice(
      node.device.busId
    );
    await refreshUsbDevices();
    vscode2.window.showInformationMessage(
      `Detached ${node.device.device}`
    );
  } catch (error) {
    showError(error);
  }
}
async function enableTreeAutoAttach(node) {
  if (!node?.device) {
    return;
  }
  await store.add({
    vid: node.device.vid,
    pid: node.device.pid,
    name: node.device.device
  });
  treeProvider.refresh();
}
async function disableTreeAutoAttach(node) {
  if (!node?.device) {
    return;
  }
  await store.remove(
    node.device.vid,
    node.device.pid
  );
  treeProvider.refresh();
}
async function renameTreeDevice(node) {
  if (!node?.device) {
    return;
  }
  const currentAlias = aliasStore.get(
    node.device.vid,
    node.device.pid
  );
  const alias = await vscode2.window.showInputBox({
    title: "USB Device Alias",
    prompt: "Enter a name for this USB device",
    value: currentAlias ?? node.device.device,
    placeHolder: "e.g. NU Board"
  });
  if (alias === void 0) {
    return;
  }
  const trimmed = alias.trim();
  if (!trimmed) {
    return;
  }
  await aliasStore.set(
    node.device.vid,
    node.device.pid,
    trimmed
  );
  treeProvider.refresh();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
