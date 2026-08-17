import * as vscode from 'vscode';

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

let store: AutoAttachStore;
let autoAttachTimer: NodeJS.Timeout | undefined;
let autoAttachRunning = false;
const autoAttachedBusIds = new Set<string>();

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
        )
    );
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

        await attachUsbDevice(
            selected.device.busId
        );

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

        await detachUsbDevice(
            selected.device.busId
        );

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
        const devices = await listUsbDevices();const currentBusIds =
    new Set(
        devices.map(
            device => device.busId
        )
    );

    for (
        const busId
        of Array.from(autoAttachedBusIds)
    ) {
        if (!currentBusIds.has(busId)) {
            autoAttachedBusIds.delete(
                busId
            );
        }
    }

    const autoDevices = store.getAll();

        for (const device of devices) {
            const matched = autoDevices.some(
                rule =>
                    rule.vid.toLowerCase() === device.vid.toLowerCase() &&
                    rule.pid.toLowerCase() === device.pid.toLowerCase()
            );

            if (!matched) {
                continue;
            }

            // 이미 WSL에 붙어 있으면 건드리지 않음
            if (isAttached(device)) {
                continue;
            }

            // usbipd attach는 Shared 상태여야 정상 수행됨
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