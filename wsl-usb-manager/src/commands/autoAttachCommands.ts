import * as vscode from 'vscode';

import {
    UsbDeviceService
} from '../services/usbDeviceService';

import {
    AutoAttachStore
} from '../stores/autoAttachStore';

import {
    DeviceTreeProvider,
    DeviceNode
} from '../tree/deviceTreeProvider';


export function registerAutoAttachCommands(
    context: vscode.ExtensionContext,
    deviceService: UsbDeviceService,
    autoAttachStore: AutoAttachStore,
    treeProvider: DeviceTreeProvider
): void {

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'wslUsbManager.manageAutoAttach',
            () =>
                manageAutoAttach(
                    deviceService,
                    autoAttachStore,
                    treeProvider
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.treeEnableAutoAttach',
            (node: DeviceNode) =>
                enableTreeAutoAttach(
                    node,
                    autoAttachStore,
                    treeProvider
                )
        ),

        vscode.commands.registerCommand(
            'wslUsbManager.treeDisableAutoAttach',
            (node: DeviceNode) =>
                disableTreeAutoAttach(
                    node,
                    autoAttachStore,
                    treeProvider
                )
        )
    );
}


/**
 * QuickPick을 통해 Auto Attach 등록 상태를 변경한다.
 */
async function manageAutoAttach(
    deviceService: UsbDeviceService,
    autoAttachStore: AutoAttachStore,
    treeProvider: DeviceTreeProvider
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

        const selected =
            await vscode.window.showQuickPick(
                devices.map(device => {

                    const enabled =
                        autoAttachStore.has(
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
                            `${deviceService.getStateLabel(device)} | ` +
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
            autoAttachStore.has(
                device.vid,
                device.pid
            );

        if (enabled) {
            await autoAttachStore.remove(
                device.vid,
                device.pid
            );

            treeProvider.refresh();

            vscode.window.showInformationMessage(
                `Auto Attach disabled: ` +
                `${device.vid}:${device.pid}`
            );

            return;
        }

        await autoAttachStore.add({
            vid: device.vid,
            pid: device.pid,
            name: device.device
        });

        treeProvider.refresh();

        vscode.window.showInformationMessage(
            `Auto Attach enabled: ` +
            `${device.vid}:${device.pid}`
        );

    } catch (error) {
        showError(error);
    }
}


/**
 * TreeView 장치를 Auto Attach 목록에 등록한다.
 */
async function enableTreeAutoAttach(
    node: DeviceNode,
    autoAttachStore: AutoAttachStore,
    treeProvider: DeviceTreeProvider
): Promise<void> {

    try {
        await autoAttachStore.add({
            vid: node.device.vid,
            pid: node.device.pid,
            name: node.device.device
        });

        treeProvider.refresh();

    } catch (error) {
        showError(error);
    }
}


/**
 * TreeView 장치를 Auto Attach 목록에서 제거한다.
 */
async function disableTreeAutoAttach(
    node: DeviceNode,
    autoAttachStore: AutoAttachStore,
    treeProvider: DeviceTreeProvider
): Promise<void> {

    try {
        await autoAttachStore.remove(
            node.device.vid,
            node.device.pid
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