import * as vscode from 'vscode';
import { UsbDevice } from './types';

import {
    attachUsbDevice,
    detachUsbDevice,
    getDeviceStateLabel,
    isAttached,
    listUsbDevices
} from './usbipd';

import {
    AutoAttachStore
} from './autoAttachStore';

import {
    DeviceTreeProvider
} from './deviceTreeProvider';

let store: AutoAttachStore;
let autoAttachTimer: NodeJS.Timeout | undefined;
let autoAttachRunning = false;

const autoAttachedBusIds = new Set<string>();
const autoAttachSuppressed = new Set<string>();

let treeProvider: DeviceTreeProvider;
let lastDeviceSnapshot = '';

function getDeviceKey(
    vid: string,
    pid: string
): string {
    return `${vid.toLowerCase()}:${pid.toLowerCase()}`;
}

export function activate(
    context: vscode.ExtensionContext
) {
    console.log(
        'WSL USB Manager activated',
        'platform:',
        process.platform,
        'remoteName:',
        vscode.env.remoteName
    );

    store =
        new AutoAttachStore(context);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'wslUsbManager.showDevices',
            showDevices
        ),
        vscode.commands.registerCommand(
            'wslUsbManager.showAttachedDevices',
            showAttachedDevices
        ),
        vscode.commands.registerCommand(
            'wslUsbManager.attachDevice',
            attachDevice
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.detachDevice',
            detachDevice
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.manageAutoAttach',
            manageAutoAttach
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.treeAttach',
            attachTreeDevice
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.treeDetach',
            detachTreeDevice
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.treeEnableAutoAttach',
            enableTreeAutoAttach
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.treeDisableAutoAttach',
            disableTreeAutoAttach
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.refresh',
            async () => {
                try {
                    await refreshUsbDevices();
                } catch (error) {
                    showError(error);
                }
            }
        )
    );

    treeProvider =
        new DeviceTreeProvider(store);

    const treeView =
        vscode.window.createTreeView(
            'wslUsbManager.devicesView',
            {
                treeDataProvider: treeProvider,
                showCollapseAll: true
            }
        );

    context.subscriptions.push(treeView);
    // 반드시 TreeProvider 생성 이후
    startAutoAttachMonitor();
}

async function showDevices():
Promise<void> {
    try {
        const devices =
            await listUsbDevices();

        if (devices.length === 0) {
            vscode.window.showInformationMessage(
                'No USB devices found.'
            );

            return;
        }

        const selected =
            await vscode.window.showQuickPick(
                devices.map(device => {
                    const autoAttach =
                        store.has(
                            device.vid,
                            device.pid
                        );

                    return {
                        label:
                            isAttached(device)
                                ? `$(vm) ${device.vid}:${device.pid}`
                                : `$(debug-disconnect) ${device.vid}:${device.pid}`,

                        description:
                            device.device,

                        detail:
                            `${device.busId} | ` +
                            `${getDeviceStateLabel(device)} | ` +
                            `Auto Attach ${autoAttach ? '✓' : '✗'}`,

                        device
                    };
                }),
                {
                    placeHolder:
                        'USB devices'
                }
            );

        if (!selected) {
            return;
        }

    } catch (error) {
        showError(error);
    }
}

async function attachDevice():
Promise<void> {
    try {
        const devices =
            await listUsbDevices();

        const candidates =
            devices.filter(
                device =>
                    !isAttached(device)
            );

        const selected =
            await vscode.window.showQuickPick(
                candidates.map(
                    device => ({
                        label:
                            `${device.vid}:${device.pid}`,
                        description:
                            device.device,
                        detail:
                            `${device.busId} | ${device.state}`,
                        device
                    })
                ),
                {
                    placeHolder:
                        'Attach USB device to WSL'
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
        vscode.window
            .showInformationMessage(
                `Attached ${selected.device.device}`
            );

    } catch (error) {
        showError(error);
    }
}

async function detachDevice():
Promise<void> {
    try {
        const devices =
            await listUsbDevices();

        const candidates =
            devices.filter(isAttached);

        const selected =
            await vscode.window.showQuickPick(
                candidates.map(
                    device => ({
                        label:
                            `${device.vid}:${device.pid}`,
                        description:
                            device.device,
                        detail:
                            selectedState(device),
                        device
                    })
                ),
                {
                    placeHolder:
                        'Detach USB device from WSL'
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

        vscode.window
            .showInformationMessage(
                `Detached ${selected.device.device}`
            );

    } catch (error) {
        showError(error);
    }
}

async function manageAutoAttach():
Promise<void> {
    try {
        const devices =
            await listUsbDevices();

        if (devices.length === 0) {
            vscode.window.showInformationMessage(
                'No USB devices found.'
            );

            return;
        }

        const selected =
            await vscode.window.showQuickPick(
                devices.map(device => {
                    const enabled =
                        store.has(
                            device.vid,
                            device.pid
                        );

                    return {
                        label:
                            enabled
                                ? `$(check) ${device.vid}:${device.pid}`
                                : `$(circle-outline) ${device.vid}:${device.pid}`,

                        description:
                            device.device,

                        detail:
                            `${device.busId} | ` +
                            `${getDeviceStateLabel(device)} | ` +
                            `Auto Attach ${enabled ? 'ON' : 'OFF'}`,

                        device
                    };
                }),
                {
                    placeHolder:
                        'Select a device to toggle Auto Attach'
                }
            );

        if (!selected) {
            return;
        }

        const device =
            selected.device;

        const enabled =
            store.has(
                device.vid,
                device.pid
            );

        if (enabled) {
            await store.remove(
                device.vid,
                device.pid
            );

            treeProvider.refresh();

            vscode.window.showInformationMessage(
                `Auto Attach disabled: ${device.vid}:${device.pid}`
            );
        } else {
            await store.add({
                vid: device.vid,
                pid: device.pid,
                name: device.device
            });
            treeProvider.refresh();
            vscode.window.showInformationMessage(
                `Auto Attach enabled: ${device.vid}:${device.pid}`
            );
        }

    } catch (error) {
        showError(error);
    }
}

async function showAttachedDevices(): Promise<void> {
    try {
        const devices = await listUsbDevices();

        const attached = devices.filter(
            device => isAttached(device)
        );

        if (attached.length === 0) {
            vscode.window.showInformationMessage(
                'No USB devices are attached to WSL.'
            );
            return;
        }

        await vscode.window.showQuickPick(
            attached.map(device => ({
                label: `${device.vid}:${device.pid}`,
                description: device.device,
                detail: `${device.busId} | WSL Attached`,
                device
            })),
            {
                placeHolder: 'USB devices attached to WSL'
            }
        );

    } catch (error) {
        showError(error);
    }
}

function selectedState(
    device: {
        busId: string;
        state: string;
    }
): string {
    return `${device.busId} | ${device.state}`;
}

function showError(
    error: unknown
): void {
    const message =
        error instanceof Error
            ? error.message
            : String(error);

    vscode.window
        .showErrorMessage(
            `WSL USB Manager: ${message}`
        );
}

export async function deactivate(): Promise<void> {
    if (autoAttachTimer) {
        clearInterval(autoAttachTimer);
        autoAttachTimer = undefined;
    }

    await detachAutoAttachedDevices();
}

function startAutoAttachMonitor(): void {
    if (autoAttachTimer) {
        clearInterval(autoAttachTimer);
    }

    autoAttachTimer = setInterval(
        () => {
            void processAutoAttach();
        },
        1000
    );

    // Extension 시작 직후 한 번 실행
    void processAutoAttach();
}

async function processAutoAttach(): Promise<void> {
    if (autoAttachRunning) {
        return;
    }

    autoAttachRunning = true;

    try {
        const devices = await listUsbDevices();

        const currentBusIds = new Set(
            devices.map(device => device.busId)
        );

        for (const busId of Array.from(autoAttachedBusIds)) {
            if (!currentBusIds.has(busId)) {
                autoAttachedBusIds.delete(busId);
            }
        }

        const autoDevices = store.getAll();
        let deviceStateChanged = false;

        for (const device of devices) {
            const matched = autoDevices.some(
                rule =>
                    rule.vid.toLowerCase() === device.vid.toLowerCase() &&
                    rule.pid.toLowerCase() === device.pid.toLowerCase()
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

            // 이미 WSL에 붙어 있으면 건드리지 않음
            if (isAttached(device)) {
                continue;
            }

            // Auto Attach는 Shared 상태에서만 수행
            if (
                !device.state
                    .toLowerCase()
                    .includes('shared')
            ) {
                continue;
            }

            try {
                console.log(
                    `[WSL USB] Auto attaching ` +
                    `${device.vid}:${device.pid} ` +
                    `BUSID=${device.busId}`
                );

                await attachUsbDevice(
                    device.busId
                );

                autoAttachedBusIds.add(
                    device.busId
                );

                deviceStateChanged = true;

                console.log(
                    `[WSL USB] Attached ` +
                    `${device.vid}:${device.pid} ` +
                    `BUSID=${device.busId}`
                );

            } catch (error) {
                console.error(
                    `[WSL USB] Auto attach failed ` +
                    `${device.vid}:${device.pid}`,
                    error
                );
            }
        }

        // 실제 Attach가 발생했을 때만 usbipd list를 다시 실행한다.
        const latestDevices =
            deviceStateChanged
                ? await listUsbDevices()
                : devices;

        const snapshot =
            createDeviceSnapshot(
                latestDevices
            );

        // 실제 USB 상태가 변했을 때만 TreeView 갱신
        if (snapshot !== lastDeviceSnapshot) {
            lastDeviceSnapshot = snapshot;

            treeProvider.updateDevices(
                latestDevices
            );
        }

    } catch (error) {
        console.error(
            '[WSL USB] Auto attach scan failed',
            error
        );

    } finally {
        autoAttachRunning = false;
    }
}

async function detachAutoAttachedDevices():
Promise<void> {
    const busIds =
        Array.from(autoAttachedBusIds);

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

function createDeviceSnapshot(
    devices: UsbDevice[]
): string {
    return devices
        .map(device =>
            [
                device.busId,
                device.vid,
                device.pid,
                device.state,
                store.has(device.vid, device.pid)
                    ? 'auto'
                    : 'manual'
            ].join('|')
        )
        .sort()
        .join('\n');
}

async function refreshUsbDevices():
Promise<UsbDevice[]> {
    const devices =
        await listUsbDevices();

    treeProvider.updateDevices(
        devices
    );

    return devices;
}

async function attachTreeDevice(
    node: any
): Promise<void> {
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

        vscode.window.showInformationMessage(
            `Attached ${node.device.device} to WSL`
        );

    } catch (error) {
        showError(error);
    }
}

async function detachTreeDevice(
    node: any
): Promise<void> {
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

        vscode.window.showInformationMessage(
            `Detached ${node.device.device}`
        );

    } catch (error) {
        showError(error);
    }
}

async function enableTreeAutoAttach(
    node: any
): Promise<void> {
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

async function disableTreeAutoAttach(
    node: any
): Promise<void> {
    if (!node?.device) {
        return;
    }

    await store.remove(
        node.device.vid,
        node.device.pid
    );

    treeProvider.refresh();
}