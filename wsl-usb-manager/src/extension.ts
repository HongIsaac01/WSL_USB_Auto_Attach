import * as vscode from 'vscode';

import {
    UsbipdService
} from './services/usbipdService';

import {
    UsbDeviceService
} from './services/usbDeviceService';

import {
    AutoAttachService
} from './services/autoAttachService';

import {
    AutoAttachStore
} from './stores/autoAttachStore';

import {
    DeviceAliasStore
} from './stores/deviceAliasStore';

import {
    DeviceTreeProvider
} from './tree/deviceTreeProvider';

import {
    registerDeviceCommands
} from './commands/deviceCommands';

import {
    registerAutoAttachCommands
} from './commands/autoAttachCommands';


let autoAttachService:
    AutoAttachService | undefined;


/**
 * WSL USB Manager Extension 활성화.
 */
export function activate(
    context: vscode.ExtensionContext
): void {

    console.log(
        'WSL USB Manager activated',
        'platform:',
        process.platform,
        'remoteName:',
        vscode.env.remoteName
    );


    //
    // Stores
    //
    const autoAttachStore =
        new AutoAttachStore(
            context
        );

    const aliasStore =
        new DeviceAliasStore(
            context
        );


    //
    // TreeView
    //
    const treeProvider =
        new DeviceTreeProvider(
            autoAttachStore,
            aliasStore
        );


    //
    // Services
    //
    const usbipdService =
        new UsbipdService();

    const deviceService =
        new UsbDeviceService(
            usbipdService,
            devices => {
                treeProvider.updateDevices(
                    devices
                );
            }
        );

    autoAttachService =
        new AutoAttachService(
            deviceService,
            autoAttachStore
        );


    //
    // Commands
    //
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


    //
    // TreeView 등록
    //
    const treeView =
        vscode.window.createTreeView(
            'wslUsbManager.devicesView',
            {
                treeDataProvider:
                    treeProvider,

                showCollapseAll:
                    true
            }
        );

    context.subscriptions.push(
        treeView
    );


    //
    // Auto Attach monitoring 시작
    //
    autoAttachService.start();
}


/**
 * WSL USB Manager Extension 종료.
 *
 * AutoAttachService가 현재 Extension session에서
 * 자동으로 Attach한 장치만 Detach한다.
 */
export async function deactivate():
Promise<void> {

    if (!autoAttachService) {
        return;
    }

    await autoAttachService.stop();

    autoAttachService =
        undefined;
}