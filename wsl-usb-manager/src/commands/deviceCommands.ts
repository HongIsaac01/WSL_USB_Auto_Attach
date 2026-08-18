import * as vscode from 'vscode';

import {
    UsbDevice
} from '../models/usbDevice';

import {
    UsbDeviceService
} from '../services/usbDeviceService';

import {
    AutoAttachService
} from '../services/autoAttachService';

import {
    AutoAttachStore
} from '../stores/autoAttachStore';

import {
    DeviceAliasStore
} from '../stores/deviceAliasStore';

import {
    DeviceNode,
    DeviceTreeProvider
} from '../tree/deviceTreeProvider';


export function registerDeviceCommands(
    context: vscode.ExtensionContext,
    deviceService: UsbDeviceService,
    autoAttachService: AutoAttachService,
    autoAttachStore: AutoAttachStore,
    aliasStore: DeviceAliasStore,
    treeProvider: DeviceTreeProvider
): void {

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'wslUsbManager.showDevices',
            () =>
                showDevices(
                    deviceService,
                    autoAttachStore
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.showAttachedDevices',
            () =>
                showAttachedDevices(
                    deviceService
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.attachDevice',
            () =>
                attachDevice(
                    deviceService,
                    autoAttachService
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.detachDevice',
            () =>
                detachDevice(
                    deviceService,
                    autoAttachService
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.treeAttach',
            (node: DeviceNode) =>
                attachTreeDevice(
                    node,
                    deviceService,
                    autoAttachService
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.treeDetach',
            (node: DeviceNode) =>
                detachTreeDevice(
                    node,
                    deviceService,
                    autoAttachService
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.refresh',
            () =>
                refreshDevices(
                    deviceService
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.renameDevice',
            (node: DeviceNode) =>
                renameTreeDevice(
                    node,
                    aliasStore,
                    treeProvider
                )
        )
    );
}


/**
 * 현재 인식된 모든 USB 장치를 QuickPick으로 표시한다.
 */
async function showDevices(
    deviceService: UsbDeviceService,
    autoAttachStore: AutoAttachStore
): Promise<void> {

    try {
        const devices =
            await deviceService.refresh();

        if (devices.length === 0) {
            vscode.window.showInformationMessage(
                'No USB devices found.'
            );

            return;
        }

        await vscode.window.showQuickPick(
            devices.map(device => {

                const autoAttach =
                    autoAttachStore.has(
                        device.vid,
                        device.pid
                    );

                return {
                    label:
                        deviceService.isAttached(device)
                            ? `$(vm) ${device.vid}:${device.pid}`
                            : `$(debug-disconnect) ${device.vid}:${device.pid}`,

                    description:
                        device.device,

                    detail:
                        `${device.busId} | ` +
                        `${deviceService.getStateLabel(device)} | ` +
                        `Auto Attach ${autoAttach ? '✓' : '✗'}`,

                    device
                };
            }),
            {
                placeHolder:
                    'USB devices'
            }
        );

    } catch (error) {
        showError(error);
    }
}


/**
 * 현재 WSL에 Attach된 USB 장치를 표시한다.
 */
async function showAttachedDevices(
    deviceService: UsbDeviceService
): Promise<void> {

    try {
        const devices =
            await deviceService.refresh();

        const attachedDevices =
            devices.filter(
                device =>
                    deviceService.isAttached(
                        device
                    )
            );

        if (attachedDevices.length === 0) {
            vscode.window.showInformationMessage(
                'No USB devices are attached to WSL.'
            );

            return;
        }

        await vscode.window.showQuickPick(
            attachedDevices.map(
                device => ({
                    label:
                        `${device.vid}:${device.pid}`,

                    description:
                        device.device,

                    detail:
                        `${device.busId} | ` +
                        `${deviceService.getStateLabel(device)}`,

                    device
                })
            ),
            {
                placeHolder:
                    'USB devices attached to WSL'
            }
        );

    } catch (error) {
        showError(error);
    }
}


/**
 * QuickPick에서 장치를 선택하여 WSL에 Attach한다.
 */
async function attachDevice(
    deviceService: UsbDeviceService,
    autoAttachService: AutoAttachService
): Promise<void> {

    try {
        const devices =
            await deviceService.refresh();

        const availableDevices =
            devices.filter(
                device =>
                    !deviceService.isAttached(
                        device
                    )
            );

        if (availableDevices.length === 0) {
            vscode.window.showInformationMessage(
                'No USB devices are available to attach.'
            );

            return;
        }

        const selected =
            await vscode.window.showQuickPick(
                availableDevices.map(
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

        await attachSelectedDevice(
            selected.device,
            deviceService,
            autoAttachService
        );

        vscode.window.showInformationMessage(
            `Attached ${selected.device.device}`
        );

    } catch (error) {
        showError(error);
    }
}


/**
 * QuickPick에서 장치를 선택하여 WSL에서 Detach한다.
 */
async function detachDevice(
    deviceService: UsbDeviceService,
    autoAttachService: AutoAttachService
): Promise<void> {

    try {
        const devices =
            await deviceService.refresh();

        const attachedDevices =
            devices.filter(
                device =>
                    deviceService.isAttached(
                        device
                    )
            );

        if (attachedDevices.length === 0) {
            vscode.window.showInformationMessage(
                'No USB devices are attached to WSL.'
            );

            return;
        }

        const selected =
            await vscode.window.showQuickPick(
                attachedDevices.map(
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
                        'Detach USB device from WSL'
                }
            );

        if (!selected) {
            return;
        }

        await detachSelectedDevice(
            selected.device,
            deviceService,
            autoAttachService
        );

        vscode.window.showInformationMessage(
            `Detached ${selected.device.device}`
        );

    } catch (error) {
        showError(error);
    }
}


/**
 * TreeView에서 선택한 USB 장치를 WSL에 Attach한다.
 */
async function attachTreeDevice(
    node: DeviceNode,
    deviceService: UsbDeviceService,
    autoAttachService: AutoAttachService
): Promise<void> {

    try {
        await attachSelectedDevice(
            node.device,
            deviceService,
            autoAttachService
        );

        vscode.window.showInformationMessage(
            `Attached ${node.device.device} to WSL`
        );

    } catch (error) {
        showError(error);
    }
}


/**
 * TreeView에서 선택한 USB 장치를 WSL에서 Detach한다.
 */
async function detachTreeDevice(
    node: DeviceNode,
    deviceService: UsbDeviceService,
    autoAttachService: AutoAttachService
): Promise<void> {

    try {
        await detachSelectedDevice(
            node.device,
            deviceService,
            autoAttachService
        );

        vscode.window.showInformationMessage(
            `Detached ${node.device.device}`
        );

    } catch (error) {
        showError(error);
    }
}


/**
 * Attach 공통 처리.
 *
 * 사용자가 명시적으로 Attach했으므로
 * 기존 Auto Attach suppression을 해제한다.
 */
async function attachSelectedDevice(
    device: UsbDevice,
    deviceService: UsbDeviceService,
    autoAttachService: AutoAttachService
): Promise<void> {

    autoAttachService.clearSuppression(
        device
    );

    await deviceService.attach(
        device
    );
}


/**
 * Detach 공통 처리.
 *
 * Auto Attach가 활성화된 장치를 사용자가 직접 Detach한 경우에도
 * 현재 연결 세션에서는 다시 자동 Attach하지 않도록 suppression한다.
 */
async function detachSelectedDevice(
    device: UsbDevice,
    deviceService: UsbDeviceService,
    autoAttachService: AutoAttachService
): Promise<void> {

    autoAttachService.suppress(
        device
    );

    autoAttachService.releaseOwnership(
        device
    );

    await deviceService.detach(
        device
    );
}


/**
 * 실제 USB 상태를 다시 조회한다.
 */
async function refreshDevices(
    deviceService: UsbDeviceService
): Promise<void> {

    try {
        await deviceService.refresh();

    } catch (error) {
        showError(error);
    }
}


/**
 * TreeView 장치에 사용자 별칭을 지정한다.
 */
async function renameTreeDevice(
    node: DeviceNode,
    aliasStore: DeviceAliasStore,
    treeProvider: DeviceTreeProvider
): Promise<void> {

    try {
        const device =
            node.device;

        const currentAlias =
            aliasStore.get(
                device.vid,
                device.pid
            );

        const alias =
            await vscode.window.showInputBox({
                title:
                    'USB Device Alias',

                prompt:
                    'Enter a name for this USB device',

                value:
                    currentAlias ??
                    device.device,

                placeHolder:
                    'e.g. NU Board'
            });

        if (alias === undefined) {
            return;
        }

        const trimmed =
            alias.trim();

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


/**
 * Command 실행 오류를 사용자에게 표시한다.
 */
function showError(
    error: unknown
): void {

    const message =
        error instanceof Error
            ? error.message
            : String(error);

    vscode.window.showErrorMessage(
        `WSL USB Manager: ${message}`
    );
}