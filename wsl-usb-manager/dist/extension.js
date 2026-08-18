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
var vscode4 = __toESM(require("vscode"));

// src/services/usbipdService.ts
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var USBIPD_EXECUTABLE = "usbipd.exe";
var UsbipdService = class {
  /**
   * 현재 Windows에 연결된 USB 장치 목록을 반환한다.
   *
   * usbipd.exe list 출력 중 Connected 섹션만 파싱한다.
   */
  async listDevices() {
    const {
      stdout
    } = await this.execute([
      "list"
    ]);
    return this.parseDeviceList(
      stdout
    );
  }
  /**
   * 지정한 BUSID 장치를 WSL에 Attach한다.
   */
  async attach(busId) {
    if (!busId) {
      throw new Error(
        "BUSID is required for attach."
      );
    }
    await this.execute([
      "attach",
      "--wsl",
      "--busid",
      busId
    ]);
  }
  /**
   * 지정한 BUSID 장치를 WSL에서 Detach한다.
   */
  async detach(busId) {
    if (!busId) {
      throw new Error(
        "BUSID is required for detach."
      );
    }
    await this.execute([
      "detach",
      "--busid",
      busId
    ]);
  }
  /**
   * usbipd.exe를 실행한다.
   */
  async execute(args) {
    try {
      const result = await execFileAsync(
        USBIPD_EXECUTABLE,
        args,
        {
          windowsHide: true
        }
      );
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? ""
      };
    } catch (error) {
      throw this.createExecutionError(
        args,
        error
      );
    }
  }
  /**
   * usbipd.exe list 출력을 UsbDevice[]로 변환한다.
   */
  parseDeviceList(output) {
    const devices = [];
    const lines = output.split(
      /\r?\n/
    );
    let insideConnectedSection = false;
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (line.trim() === "Connected:") {
        insideConnectedSection = true;
        continue;
      }
      if (line.trim() === "Persisted:") {
        break;
      }
      if (!insideConnectedSection) {
        continue;
      }
      const device = this.parseDeviceLine(
        line
      );
      if (device) {
        devices.push(
          device
        );
      }
    }
    return devices;
  }
  /**
   * Connected 섹션의 한 줄을 UsbDevice로 변환한다.
   *
   * 예상 형식:
   *
   * BUSID  VID:PID    DEVICE    STATE
   */
  parseDeviceLine(line) {
    const match = line.match(
      /^\s*(\S+)\s+([0-9A-Fa-f]{4}):([0-9A-Fa-f]{4})\s+(.+?)\s{2,}(.+?)\s*$/
    );
    if (!match) {
      return void 0;
    }
    const [
      ,
      busId,
      vid,
      pid,
      device,
      state
    ] = match;
    return {
      busId,
      vid: vid.toLowerCase(),
      pid: pid.toLowerCase(),
      device: device.trim(),
      state: state.trim()
    };
  }
  /**
   * usbipd.exe 실행 오류를 사람이 읽기 쉬운 Error로 변환한다.
   */
  createExecutionError(args, error) {
    if (error && typeof error === "object") {
      const candidate = error;
      const stderr = candidate.stderr?.trim();
      const message = stderr || candidate.message || "Unknown usbipd error.";
      return new Error(
        `usbipd.exe ${args.join(" ")} failed: ${message}`
      );
    }
    return new Error(
      `usbipd.exe ${args.join(" ")} failed: ${String(error)}`
    );
  }
};

// src/services/usbDeviceService.ts
var UsbDeviceService = class {
  constructor(usbipdService, onDevicesChanged) {
    this.usbipdService = usbipdService;
    this.onDevicesChanged = onDevicesChanged;
  }
  usbipdService;
  onDevicesChanged;
  /**
   * 마지막으로 확인된 USB 장치 목록.
   */
  devices = [];
  /**
   * 이전 USB 상태 snapshot.
   *
   * 장치 상태가 실제로 바뀐 경우에만
   * UI 등에 변경을 알리기 위해 사용한다.
   */
  lastSnapshot = "";
  /**
   * usbipd.exe에서 최신 USB 상태를 읽는다.
   *
   * 상태가 이전과 달라진 경우에만
   * onDevicesChanged callback을 호출한다.
   */
  async refresh() {
    const devices = await this.usbipdService.listDevices();
    const snapshot = this.createSnapshot(
      devices
    );
    this.devices = [...devices];
    if (snapshot !== this.lastSnapshot) {
      this.lastSnapshot = snapshot;
      this.onDevicesChanged?.(
        [...this.devices]
      );
    }
    return [
      ...this.devices
    ];
  }
  /**
   * 현재 cache된 전체 USB 장치 목록을 반환한다.
   *
   * usbipd.exe를 새로 호출하지 않는다.
   */
  getDevices() {
    return [
      ...this.devices
    ];
  }
  /**
   * 현재 cache에서 WSL에 Attach된 장치만 반환한다.
   */
  getAttachedDevices() {
    return this.devices.filter(
      (device) => this.isAttached(
        device
      )
    ).map(
      (device) => ({
        ...device
      })
    );
  }
  /**
   * 현재 cache에서 Windows 측 사용 가능 장치만 반환한다.
   */
  getAvailableDevices() {
    return this.devices.filter(
      (device) => !this.isAttached(
        device
      )
    ).map(
      (device) => ({
        ...device
      })
    );
  }
  /**
   * USB 장치를 WSL에 Attach한다.
   *
   * refreshAfter가 true이면
   * Attach 후 최신 USB 상태를 다시 읽는다.
   *
   * Auto Attach loop에서는 여러 장치를 처리한 후
   * 한 번만 refresh하기 위해 false를 사용할 수 있다.
   */
  async attach(device, refreshAfter = true) {
    if (!device.busId) {
      throw new Error(
        "Cannot attach device without BUSID."
      );
    }
    await this.usbipdService.attach(
      device.busId
    );
    if (refreshAfter) {
      await this.refresh();
    }
  }
  /**
   * USB 장치를 WSL에서 Detach한다.
   */
  async detach(device, refreshAfter = true) {
    if (!device.busId) {
      throw new Error(
        "Cannot detach device without BUSID."
      );
    }
    await this.detachByBusId(
      device.busId,
      refreshAfter
    );
  }
  /**
   * BUSID 기준으로 USB 장치를 Detach한다.
   *
   * AutoAttachService가 Extension 종료 시
   * 자신이 Attach한 BUSID만 해제할 때 사용한다.
   */
  async detachByBusId(busId, refreshAfter = true) {
    if (!busId) {
      throw new Error(
        "Cannot detach device without BUSID."
      );
    }
    await this.usbipdService.detach(
      busId
    );
    if (refreshAfter) {
      await this.refresh();
    }
  }
  /**
   * 장치가 현재 WSL에 Attach되어 있는지 확인한다.
   */
  isAttached(device) {
    return device.state.toLowerCase().includes("attached");
  }
  /**
   * UI에 표시할 장치 상태 문자열을 반환한다.
   */
  getStateLabel(device) {
    const state = device.state.toLowerCase();
    if (state.includes(
      "attached"
    )) {
      return "WSL Attached";
    }
    if (state.includes(
      "shared"
    )) {
      return "Shared / Ready";
    }
    return "Windows / Not shared";
  }
  /**
   * 장치 목록 비교용 snapshot을 생성한다.
   *
   * 장치의 물리적/usbipd 상태만 비교한다.
   */
  createSnapshot(devices) {
    return devices.map(
      (device) => [
        device.busId,
        device.vid,
        device.pid,
        device.device,
        device.state
      ].join("|")
    ).sort().join("\n");
  }
};

// src/services/autoAttachService.ts
var AUTO_ATTACH_POLL_INTERVAL_MS = 1e3;
var AutoAttachService = class {
  constructor(deviceService, autoAttachStore) {
    this.deviceService = deviceService;
    this.autoAttachStore = autoAttachStore;
  }
  deviceService;
  autoAttachStore;
  timer;
  running = false;
  /**
   * 현재 Extension session에서
   * Auto Attach로 붙인 BUSID.
   *
   * Extension 종료 시 이 장치들만 Detach한다.
   */
  ownedBusIds = /* @__PURE__ */ new Set();
  /**
   * 사용자가 수동 Detach한 장치.
   *
   * 장치가 물리적으로 제거될 때까지
   * Auto Attach를 일시적으로 막는다.
   */
  suppressedDeviceKeys = /* @__PURE__ */ new Set();
  /**
   * Auto Attach monitoring을 시작한다.
   */
  start() {
    if (this.timer) {
      clearInterval(
        this.timer
      );
    }
    this.timer = setInterval(
      () => {
        void this.process();
      },
      AUTO_ATTACH_POLL_INTERVAL_MS
    );
    void this.process();
  }
  /**
   * Auto Attach monitoring을 종료하고,
   * 이 Service가 Auto Attach한 장치를 Detach한다.
   */
  async stop() {
    if (this.timer) {
      clearInterval(
        this.timer
      );
      this.timer = void 0;
    }
    await this.detachOwnedDevices();
  }
  /**
   * 사용자가 장치를 직접 Detach했을 때 호출한다.
   *
   * 장치가 현재 물리적으로 연결되어 있는 동안
   * Auto Attach를 일시 정지한다.
   */
  suppress(device) {
    this.suppressedDeviceKeys.add(
      this.createDeviceKey(
        device.vid,
        device.pid
      )
    );
  }
  /**
   * 사용자가 장치를 직접 Attach했을 때 호출한다.
   *
   * 기존 Auto Attach suppression을 해제한다.
   */
  clearSuppression(device) {
    this.suppressedDeviceKeys.delete(
      this.createDeviceKey(
        device.vid,
        device.pid
      )
    );
  }
  /**
   * 해당 장치에 대한 Auto Attach ownership을 해제한다.
   *
   * 사용자가 수동 Detach한 장치는
   * Extension 종료 시 다시 Detach할 필요가 없다.
   */
  releaseOwnership(device) {
    if (!device.busId) {
      return;
    }
    this.ownedBusIds.delete(
      device.busId
    );
  }
  /**
   * Auto Attach 한 번의 scan/process cycle.
   */
  async process() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      const devices = await this.deviceService.refresh();
      this.cleanupOwnedBusIds(
        devices
      );
      this.cleanupSuppression(
        devices
      );
      const autoAttachDevices = this.autoAttachStore.getAll();
      let deviceStateChanged = false;
      for (const device of devices) {
        if (!this.isAutoAttachEnabled(
          device,
          autoAttachDevices
        )) {
          continue;
        }
        if (this.isSuppressed(
          device
        )) {
          continue;
        }
        if (this.deviceService.isAttached(device)) {
          continue;
        }
        if (!this.isShared(device)) {
          continue;
        }
        try {
          console.log(
            `[WSL USB] Auto attaching ${device.vid}:${device.pid} BUSID=${device.busId}`
          );
          await this.deviceService.attach(
            device,
            false
          );
          this.ownedBusIds.add(
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
      if (deviceStateChanged) {
        await this.deviceService.refresh();
      }
    } catch (error) {
      console.error(
        "[WSL USB] Auto attach scan failed",
        error
      );
    } finally {
      this.running = false;
    }
  }
  /**
   * 현재 연결에서 사라진 BUSID를
   * ownership 목록에서 제거한다.
   */
  cleanupOwnedBusIds(devices) {
    const currentBusIds = new Set(
      devices.map(
        (device) => device.busId
      )
    );
    for (const busId of Array.from(
      this.ownedBusIds
    )) {
      if (!currentBusIds.has(
        busId
      )) {
        this.ownedBusIds.delete(
          busId
        );
      }
    }
  }
  /**
   * 수동 Detach 후 장치가 실제로 제거되면
   * suppression을 자동 해제한다.
   *
   * 이후 재연결 시 Auto Attach가 다시 동작한다.
   */
  cleanupSuppression(devices) {
    const currentDeviceKeys = new Set(
      devices.map(
        (device) => this.createDeviceKey(
          device.vid,
          device.pid
        )
      )
    );
    for (const key of Array.from(
      this.suppressedDeviceKeys
    )) {
      if (!currentDeviceKeys.has(
        key
      )) {
        this.suppressedDeviceKeys.delete(
          key
        );
      }
    }
  }
  /**
   * Auto Attach 등록 장치인지 확인한다.
   */
  isAutoAttachEnabled(device, autoAttachDevices) {
    return autoAttachDevices.some(
      (rule) => rule.vid.toLowerCase() === device.vid.toLowerCase() && rule.pid.toLowerCase() === device.pid.toLowerCase()
    );
  }
  /**
   * 현재 session에서 Auto Attach가
   * 일시 중지된 장치인지 확인한다.
   */
  isSuppressed(device) {
    return this.suppressedDeviceKeys.has(
      this.createDeviceKey(
        device.vid,
        device.pid
      )
    );
  }
  /**
   * usbipd attach가 가능한 Shared 상태인지 확인한다.
   */
  isShared(device) {
    return device.state.toLowerCase().includes("shared");
  }
  /**
   * Extension session 종료 시
   * Auto Attach로 붙인 장치만 Detach한다.
   */
  async detachOwnedDevices() {
    const busIds = Array.from(
      this.ownedBusIds
    );
    for (const busId of busIds) {
      try {
        console.log(
          `[WSL USB] Detaching managed device BUSID=${busId}`
        );
        await this.deviceService.detachByBusId(
          busId,
          false
        );
        this.ownedBusIds.delete(
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
    if (busIds.length > 0) {
      try {
        await this.deviceService.refresh();
      } catch {
      }
    }
  }
  /**
   * VID:PID 기반 Device Key.
   */
  createDeviceKey(vid, pid) {
    return `${vid.toLowerCase()}:${pid.toLowerCase()}`;
  }
};

// src/stores/autoAttachStore.ts
var STORAGE_KEY = "autoAttachDevices";
var AutoAttachStore = class {
  constructor(context) {
    this.context = context;
  }
  context;
  /**
   * 등록된 모든 Auto Attach 장치를 반환한다.
   */
  getAll() {
    return this.context.globalState.get(
      STORAGE_KEY,
      []
    );
  }
  /**
   * VID:PID가 Auto Attach 목록에 등록되어 있는지 확인한다.
   */
  has(vid, pid) {
    return this.getAll().some(
      (device) => this.isSameDevice(
        device,
        vid,
        pid
      )
    );
  }
  /**
   * Auto Attach 장치를 등록한다.
   *
   * 같은 VID:PID가 이미 등록되어 있으면
   * 아무 작업도 하지 않는다.
   */
  async add(device) {
    const devices = this.getAll();
    const exists = devices.some(
      (item) => this.isSameDevice(
        item,
        device.vid,
        device.pid
      )
    );
    if (exists) {
      return;
    }
    const updatedDevices = [
      ...devices,
      device
    ];
    await this.save(
      updatedDevices
    );
  }
  /**
   * VID:PID에 해당하는 Auto Attach 장치를 삭제한다.
   */
  async remove(vid, pid) {
    const devices = this.getAll().filter(
      (device) => !this.isSameDevice(
        device,
        vid,
        pid
      )
    );
    await this.save(
      devices
    );
  }
  /**
   * Auto Attach 장치 목록을 저장한다.
   */
  async save(devices) {
    await this.context.globalState.update(
      STORAGE_KEY,
      devices
    );
  }
  /**
   * VID:PID 기준으로 같은 장치 종류인지 비교한다.
   */
  isSameDevice(device, vid, pid) {
    return device.vid.toLowerCase() === vid.toLowerCase() && device.pid.toLowerCase() === pid.toLowerCase();
  }
};

// src/stores/deviceAliasStore.ts
var STORAGE_KEY2 = "deviceAliases";
var DeviceAliasStore = class {
  constructor(context) {
    this.context = context;
  }
  context;
  /**
   * VID:PID 조합을 저장용 key로 변환한다.
   */
  createKey(vid, pid) {
    return `${vid.toLowerCase()}:${pid.toLowerCase()}`;
  }
  /**
   * 저장된 별칭을 반환한다.
   *
   * 별칭이 등록되어 있지 않으면 undefined를 반환한다.
   */
  get(vid, pid) {
    const aliases = this.getAll();
    return aliases[this.createKey(
      vid,
      pid
    )];
  }
  /**
   * 장치 별칭을 저장한다.
   */
  async set(vid, pid, alias) {
    const aliases = {
      ...this.getAll()
    };
    aliases[this.createKey(
      vid,
      pid
    )] = alias;
    await this.save(
      aliases
    );
  }
  /**
   * 저장된 장치 별칭을 삭제한다.
   */
  async remove(vid, pid) {
    const aliases = {
      ...this.getAll()
    };
    delete aliases[this.createKey(
      vid,
      pid
    )];
    await this.save(
      aliases
    );
  }
  /**
   * 전체 alias map을 읽는다.
   */
  getAll() {
    return this.context.globalState.get(
      STORAGE_KEY2,
      {}
    );
  }
  /**
   * 전체 alias map을 저장한다.
   */
  async save(aliases) {
    await this.context.globalState.update(
      STORAGE_KEY2,
      aliases
    );
  }
};

// src/tree/deviceTreeProvider.ts
var vscode = __toESM(require("vscode"));
var DeviceTreeProvider = class {
  constructor(autoAttachStore, aliasStore) {
    this.autoAttachStore = autoAttachStore;
    this.aliasStore = aliasStore;
  }
  autoAttachStore;
  aliasStore;
  onDidChangeTreeDataEmitter = new vscode.EventEmitter();
  onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  /**
   * 현재 USB 장치 목록.
   *
   * DeviceTreeProvider는 usbipd.exe를 직접 호출하지 않는다.
   * 외부 Service에서 전달받은 상태만 렌더링한다.
   */
  devices = [];
  /**
   * 최신 USB 장치 목록으로 TreeView cache를 갱신한다.
   */
  updateDevices(devices) {
    this.devices = [...devices];
    this.refresh();
  }
  /**
   * 현재 cache는 유지하고 TreeView만 다시 렌더링한다.
   *
   * Alias 또는 Auto Attach 설정 변경처럼
   * USB 목록 자체가 변하지 않은 경우 사용한다.
   */
  refresh() {
    this.onDidChangeTreeDataEmitter.fire();
  }
  getTreeItem(element) {
    if (element.type === "section") {
      return this.createSectionTreeItem(
        element
      );
    }
    return this.createDeviceTreeItem(
      element
    );
  }
  getChildren(element) {
    if (!element) {
      return this.getRootSections();
    }
    if (element.type !== "section") {
      return [];
    }
    switch (element.section) {
      case "attached":
        return this.getAttachedNodes();
      case "available":
        return this.getAvailableNodes();
      case "managed":
        return this.getManagedNodes();
    }
  }
  /**
   * Root section 목록.
   */
  getRootSections() {
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
  /**
   * 현재 WSL에 Attach된 장치.
   */
  getAttachedNodes() {
    return this.devices.filter(
      (device) => this.isAttached(device)
    ).map(
      (device) => ({
        type: "device",
        device,
        section: "attached"
      })
    );
  }
  /**
   * Windows 측에서 사용 가능한 장치.
   */
  getAvailableNodes() {
    return this.devices.filter(
      (device) => !this.isAttached(device)
    ).map(
      (device) => ({
        type: "device",
        device,
        section: "available"
      })
    );
  }
  /**
   * Auto Attach 등록 장치.
   *
   * 실제 USB 연결 여부와 상관없이 표시한다.
   */
  getManagedNodes() {
    const managedDevices = this.autoAttachStore.getAll();
    return managedDevices.map(
      (managed) => {
        const connectedDevice = this.devices.find(
          (device2) => this.isSameDevice(
            device2,
            managed.vid,
            managed.pid
          )
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
  /**
   * Section TreeItem 생성.
   */
  createSectionTreeItem(node) {
    const item = new vscode.TreeItem(
      node.label,
      vscode.TreeItemCollapsibleState.Expanded
    );
    item.contextValue = "wslUsbSection";
    return item;
  }
  /**
   * USB Device TreeItem 생성.
   */
  createDeviceTreeItem(node) {
    const device = node.device;
    const attached = this.isAttached(device);
    const disconnected = this.isDisconnected(device);
    const autoAttach = this.autoAttachStore.has(
      device.vid,
      device.pid
    );
    const alias = this.aliasStore.get(
      device.vid,
      device.pid
    );
    const item = new vscode.TreeItem(
      alias ?? device.device,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = disconnected ? `${device.vid}:${device.pid} \xB7 Disconnected` : `${device.vid}:${device.pid}`;
    item.tooltip = this.createTooltip(
      device,
      alias,
      autoAttach,
      disconnected
    );
    this.applyDevicePresentation(
      item,
      node.section,
      attached,
      autoAttach,
      disconnected
    );
    return item;
  }
  /**
   * Device tooltip 생성.
   */
  createTooltip(device, alias, autoAttach, disconnected) {
    return [
      alias ? `Name: ${alias}` : void 0,
      `Device: ${device.device}`,
      `VID:PID: ${device.vid}:${device.pid}`,
      device.busId ? `BUSID: ${device.busId}` : "BUSID: Not connected",
      disconnected ? "State: Disconnected" : `State: ${this.getStateLabel(device)}`,
      `Auto Attach: ${autoAttach ? "ON" : "OFF"}`
    ].filter(
      (value) => value !== void 0
    ).join("\n");
  }
  /**
   * Section에 따라 icon/contextValue를 설정한다.
   */
  applyDevicePresentation(item, section, attached, autoAttach, disconnected) {
    switch (section) {
      case "attached":
        item.contextValue = autoAttach ? "attachedAutoDevice" : "attachedDevice";
        item.iconPath = new vscode.ThemeIcon(
          "vm-active"
        );
        return;
      case "available":
        item.contextValue = autoAttach ? "availableAutoDevice" : "availableDevice";
        item.iconPath = new vscode.ThemeIcon(
          "plug"
        );
        return;
      case "managed":
        item.contextValue = attached ? "managedAttachedDevice" : "managedAvailableDevice";
        item.iconPath = new vscode.ThemeIcon(
          disconnected ? "circle-slash" : attached ? "vm-active" : "check"
        );
        return;
    }
  }
  /**
   * 현재 WSL에 Attach되어 있는지 확인한다.
   */
  isAttached(device) {
    return device.state.toLowerCase().includes("attached");
  }
  /**
   * 물리적으로 연결되지 않은 Managed Device인지 확인한다.
   */
  isDisconnected(device) {
    return device.state === "Disconnected";
  }
  /**
   * VID:PID가 같은 장치인지 확인한다.
   */
  isSameDevice(device, vid, pid) {
    return device.vid.toLowerCase() === vid.toLowerCase() && device.pid.toLowerCase() === pid.toLowerCase();
  }
  /**
   * TreeView용 상태 문자열.
   */
  getStateLabel(device) {
    const state = device.state.toLowerCase();
    if (state.includes("attached")) {
      return "WSL Attached";
    }
    if (state.includes("shared")) {
      return "Shared / Ready";
    }
    return "Windows / Not shared";
  }
};

// src/commands/deviceCommands.ts
var vscode2 = __toESM(require("vscode"));
function registerDeviceCommands(context, deviceService, autoAttachService2, autoAttachStore, aliasStore, treeProvider) {
  context.subscriptions.push(
    vscode2.commands.registerCommand(
      "wslUsbManager.showDevices",
      () => showDevices(
        deviceService,
        autoAttachStore
      )
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.showAttachedDevices",
      () => showAttachedDevices(
        deviceService
      )
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.attachDevice",
      () => attachDevice(
        deviceService,
        autoAttachService2
      )
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.detachDevice",
      () => detachDevice(
        deviceService,
        autoAttachService2
      )
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.treeAttach",
      (node) => attachTreeDevice(
        node,
        deviceService,
        autoAttachService2
      )
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.treeDetach",
      (node) => detachTreeDevice(
        node,
        deviceService,
        autoAttachService2
      )
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.refresh",
      () => refreshDevices(
        deviceService
      )
    ),
    vscode2.commands.registerCommand(
      "wslUsbManager.renameDevice",
      (node) => renameTreeDevice(
        node,
        aliasStore,
        treeProvider
      )
    )
  );
}
async function showDevices(deviceService, autoAttachStore) {
  try {
    const devices = await deviceService.refresh();
    if (devices.length === 0) {
      vscode2.window.showInformationMessage(
        "No USB devices found."
      );
      return;
    }
    await vscode2.window.showQuickPick(
      devices.map((device) => {
        const autoAttach = autoAttachStore.has(
          device.vid,
          device.pid
        );
        return {
          label: deviceService.isAttached(device) ? `$(vm) ${device.vid}:${device.pid}` : `$(debug-disconnect) ${device.vid}:${device.pid}`,
          description: device.device,
          detail: `${device.busId} | ${deviceService.getStateLabel(device)} | Auto Attach ${autoAttach ? "\u2713" : "\u2717"}`,
          device
        };
      }),
      {
        placeHolder: "USB devices"
      }
    );
  } catch (error) {
    showError(error);
  }
}
async function showAttachedDevices(deviceService) {
  try {
    const devices = await deviceService.refresh();
    const attachedDevices = devices.filter(
      (device) => deviceService.isAttached(
        device
      )
    );
    if (attachedDevices.length === 0) {
      vscode2.window.showInformationMessage(
        "No USB devices are attached to WSL."
      );
      return;
    }
    await vscode2.window.showQuickPick(
      attachedDevices.map(
        (device) => ({
          label: `${device.vid}:${device.pid}`,
          description: device.device,
          detail: `${device.busId} | ${deviceService.getStateLabel(device)}`,
          device
        })
      ),
      {
        placeHolder: "USB devices attached to WSL"
      }
    );
  } catch (error) {
    showError(error);
  }
}
async function attachDevice(deviceService, autoAttachService2) {
  try {
    const devices = await deviceService.refresh();
    const availableDevices = devices.filter(
      (device) => !deviceService.isAttached(
        device
      )
    );
    if (availableDevices.length === 0) {
      vscode2.window.showInformationMessage(
        "No USB devices are available to attach."
      );
      return;
    }
    const selected = await vscode2.window.showQuickPick(
      availableDevices.map(
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
    await attachSelectedDevice(
      selected.device,
      deviceService,
      autoAttachService2
    );
    vscode2.window.showInformationMessage(
      `Attached ${selected.device.device}`
    );
  } catch (error) {
    showError(error);
  }
}
async function detachDevice(deviceService, autoAttachService2) {
  try {
    const devices = await deviceService.refresh();
    const attachedDevices = devices.filter(
      (device) => deviceService.isAttached(
        device
      )
    );
    if (attachedDevices.length === 0) {
      vscode2.window.showInformationMessage(
        "No USB devices are attached to WSL."
      );
      return;
    }
    const selected = await vscode2.window.showQuickPick(
      attachedDevices.map(
        (device) => ({
          label: `${device.vid}:${device.pid}`,
          description: device.device,
          detail: `${device.busId} | ${device.state}`,
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
    await detachSelectedDevice(
      selected.device,
      deviceService,
      autoAttachService2
    );
    vscode2.window.showInformationMessage(
      `Detached ${selected.device.device}`
    );
  } catch (error) {
    showError(error);
  }
}
async function attachTreeDevice(node, deviceService, autoAttachService2) {
  try {
    await attachSelectedDevice(
      node.device,
      deviceService,
      autoAttachService2
    );
    vscode2.window.showInformationMessage(
      `Attached ${node.device.device} to WSL`
    );
  } catch (error) {
    showError(error);
  }
}
async function detachTreeDevice(node, deviceService, autoAttachService2) {
  try {
    await detachSelectedDevice(
      node.device,
      deviceService,
      autoAttachService2
    );
    vscode2.window.showInformationMessage(
      `Detached ${node.device.device}`
    );
  } catch (error) {
    showError(error);
  }
}
async function attachSelectedDevice(device, deviceService, autoAttachService2) {
  autoAttachService2.clearSuppression(
    device
  );
  await deviceService.attach(
    device
  );
}
async function detachSelectedDevice(device, deviceService, autoAttachService2) {
  autoAttachService2.suppress(
    device
  );
  autoAttachService2.releaseOwnership(
    device
  );
  await deviceService.detach(
    device
  );
}
async function refreshDevices(deviceService) {
  try {
    await deviceService.refresh();
  } catch (error) {
    showError(error);
  }
}
async function renameTreeDevice(node, aliasStore, treeProvider) {
  try {
    const device = node.device;
    const currentAlias = aliasStore.get(
      device.vid,
      device.pid
    );
    const alias = await vscode2.window.showInputBox({
      title: "USB Device Alias",
      prompt: "Enter a name for this USB device",
      value: currentAlias ?? device.device,
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
      device.vid,
      device.pid,
      trimmed
    );
    treeProvider.refresh();
  } catch (error) {
    showError(error);
  }
}
function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  vscode2.window.showErrorMessage(
    `WSL USB Manager: ${message}`
  );
}

// src/commands/autoAttachCommands.ts
var vscode3 = __toESM(require("vscode"));
function registerAutoAttachCommands(context, deviceService, autoAttachStore, treeProvider) {
  context.subscriptions.push(
    vscode3.commands.registerCommand(
      "wslUsbManager.manageAutoAttach",
      () => manageAutoAttach(
        deviceService,
        autoAttachStore,
        treeProvider
      )
    ),
    vscode3.commands.registerCommand(
      "wslUsbManager.treeEnableAutoAttach",
      (node) => enableTreeAutoAttach(
        node,
        autoAttachStore,
        treeProvider
      )
    ),
    vscode3.commands.registerCommand(
      "wslUsbManager.treeDisableAutoAttach",
      (node) => disableTreeAutoAttach(
        node,
        autoAttachStore,
        treeProvider
      )
    )
  );
}
async function manageAutoAttach(deviceService, autoAttachStore, treeProvider) {
  try {
    const devices = await deviceService.refresh();
    if (devices.length === 0) {
      vscode3.window.showInformationMessage(
        "No USB devices found."
      );
      return;
    }
    const selected = await vscode3.window.showQuickPick(
      devices.map((device2) => {
        const enabled2 = autoAttachStore.has(
          device2.vid,
          device2.pid
        );
        return {
          label: enabled2 ? `$(check) ${device2.vid}:${device2.pid}` : `$(circle-outline) ${device2.vid}:${device2.pid}`,
          description: device2.device,
          detail: `${device2.busId} | ${deviceService.getStateLabel(device2)} | Auto Attach ${enabled2 ? "ON" : "OFF"}`,
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
    const enabled = autoAttachStore.has(
      device.vid,
      device.pid
    );
    if (enabled) {
      await autoAttachStore.remove(
        device.vid,
        device.pid
      );
      treeProvider.refresh();
      vscode3.window.showInformationMessage(
        `Auto Attach disabled: ${device.vid}:${device.pid}`
      );
      return;
    }
    await autoAttachStore.add({
      vid: device.vid,
      pid: device.pid,
      name: device.device
    });
    treeProvider.refresh();
    vscode3.window.showInformationMessage(
      `Auto Attach enabled: ${device.vid}:${device.pid}`
    );
  } catch (error) {
    showError2(error);
  }
}
async function enableTreeAutoAttach(node, autoAttachStore, treeProvider) {
  try {
    await autoAttachStore.add({
      vid: node.device.vid,
      pid: node.device.pid,
      name: node.device.device
    });
    treeProvider.refresh();
  } catch (error) {
    showError2(error);
  }
}
async function disableTreeAutoAttach(node, autoAttachStore, treeProvider) {
  try {
    await autoAttachStore.remove(
      node.device.vid,
      node.device.pid
    );
    treeProvider.refresh();
  } catch (error) {
    showError2(error);
  }
}
function showError2(error) {
  const message = error instanceof Error ? error.message : String(error);
  vscode3.window.showErrorMessage(
    `WSL USB Manager: ${message}`
  );
}

// src/extension.ts
var autoAttachService;
function activate(context) {
  console.log(
    "WSL USB Manager activated",
    "platform:",
    process.platform,
    "remoteName:",
    vscode4.env.remoteName
  );
  const autoAttachStore = new AutoAttachStore(
    context
  );
  const aliasStore = new DeviceAliasStore(
    context
  );
  const treeProvider = new DeviceTreeProvider(
    autoAttachStore,
    aliasStore
  );
  const usbipdService = new UsbipdService();
  const deviceService = new UsbDeviceService(
    usbipdService,
    (devices) => {
      treeProvider.updateDevices(
        devices
      );
    }
  );
  autoAttachService = new AutoAttachService(
    deviceService,
    autoAttachStore
  );
  registerDeviceCommands(
    context,
    deviceService,
    autoAttachService,
    autoAttachStore,
    aliasStore,
    treeProvider
  );
  registerAutoAttachCommands(
    context,
    deviceService,
    autoAttachStore,
    treeProvider
  );
  const treeView = vscode4.window.createTreeView(
    "wslUsbManager.devicesView",
    {
      treeDataProvider: treeProvider,
      showCollapseAll: true
    }
  );
  context.subscriptions.push(
    treeView
  );
  autoAttachService.start();
}
async function deactivate() {
  if (!autoAttachService) {
    return;
  }
  await autoAttachService.stop();
  autoAttachService = void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
