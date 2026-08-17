import * as vscode from 'vscode';

import {
    getDeviceStateLabel,
    isAttached
} from './usbipd';

import {
    AutoAttachStore
} from './autoAttachStore';

import {
    UsbDevice
} from './types';


type TreeNode =
    | SectionNode
    | DeviceNode;


interface SectionNode {
    type: 'section';
    label: string;
    section:
        | 'attached'
        | 'available'
        | 'managed';
}


interface DeviceNode {
    type: 'device';
    device: UsbDevice;
    section:
        | 'attached'
        | 'available'
        | 'managed';
}


export class DeviceTreeProvider
implements vscode.TreeDataProvider<TreeNode> {

    private readonly _onDidChangeTreeData =
        new vscode.EventEmitter<
            TreeNode | undefined | void
        >();

    readonly onDidChangeTreeData =
        this._onDidChangeTreeData.event;


    //
    // usbipd list 결과 cache
    //
    private devices: UsbDevice[] = [];


    constructor(
        private readonly store:
            AutoAttachStore
    ) {
    }


    /**
     * extension.ts에서 읽은 최신 USB 목록을 전달한다.
     *
     * DeviceTreeProvider 자체에서는 usbipd.exe를 호출하지 않는다.
     */
    updateDevices(
        devices: UsbDevice[]
    ): void {
        this.devices = devices;
        this.refresh();
    }


    refresh(): void {
        this._onDidChangeTreeData.fire();
    }


    getTreeItem(
        element: TreeNode
    ): vscode.TreeItem {

        if (element.type === 'section') {
            const item =
                new vscode.TreeItem(
                    element.label,
                    vscode.TreeItemCollapsibleState.Expanded
                );

            item.contextValue =
                'wslUsbSection';

            return item;
        }


        const device =
            element.device;

        const attached =
            isAttached(device);

        const autoAttach =
            this.store.has(
                device.vid,
                device.pid
            );

        const disconnected =
            device.state === 'Disconnected';


        const item =
            new vscode.TreeItem(
                device.device,
                vscode.TreeItemCollapsibleState.None
            );


        item.description =
            disconnected
                ? `${device.vid}:${device.pid} · Disconnected`
                : `${device.vid}:${device.pid}`;


        item.tooltip =
            [
                device.device,

                `VID:PID: ${device.vid}:${device.pid}`,

                device.busId
                    ? `BUSID: ${device.busId}`
                    : 'BUSID: Not connected',

                disconnected
                    ? 'State: Disconnected'
                    : `State: ${getDeviceStateLabel(device)}`,

                `Auto Attach: ${autoAttach ? 'ON' : 'OFF'}`
            ].join('\n');


        //
        // Attached to WSL
        //
        if (
            element.section === 'attached'
        ) {
            item.contextValue =
                autoAttach
                    ? 'attachedAutoDevice'
                    : 'attachedDevice';

            item.iconPath =
                new vscode.ThemeIcon(
                    'vm-active'
                );
        }

        //
        // Available on Windows
        //
        else if (
            element.section === 'available'
        ) {
            item.contextValue =
                autoAttach
                    ? 'availableAutoDevice'
                    : 'availableDevice';

            item.iconPath =
                new vscode.ThemeIcon(
                    'plug'
                );
        }

        //
        // Auto Attach Devices
        //
        else {
            item.contextValue =
                attached
                    ? 'managedAttachedDevice'
                    : 'managedAvailableDevice';

            item.iconPath =
                new vscode.ThemeIcon(
                    disconnected
                        ? 'circle-slash'
                        : attached
                            ? 'vm-active'
                            : 'check'
                );
        }


        return item;
    }


    getChildren(
        element?: TreeNode
    ): TreeNode[] {

        //
        // 중요:
        // 여기서는 usbipd.exe를 호출하지 않는다.
        //
        const devices =
            this.devices;


        //
        // Root sections
        //
        if (!element) {
            return [
                {
                    type: 'section',
                    label: 'Attached to WSL',
                    section: 'attached'
                },

                {
                    type: 'section',
                    label: 'Available on Windows',
                    section: 'available'
                },

                {
                    type: 'section',
                    label: 'Auto Attach Devices',
                    section: 'managed'
                }
            ];
        }


        if (
            element.type !== 'section'
        ) {
            return [];
        }


        switch (
            element.section
        ) {

            //
            // 현재 WSL에 attach된 실제 USB
            //
            case 'attached':

                return devices
                    .filter(isAttached)
                    .map(device => ({
                        type: 'device',
                        device,
                        section: 'attached'
                    }));


            //
            // 현재 Windows 측에서 사용 가능한 USB
            //
            case 'available':

                return devices
                    .filter(
                        device =>
                            !isAttached(device)
                    )
                    .map(device => ({
                        type: 'device',
                        device,
                        section: 'available'
                    }));


            //
            // Auto Attach 등록 목록
            //
            // 현재 USB가 빠져 있어도 표시한다.
            //
            case 'managed': {
                const managedDevices =
                    this.store.getAll();

                return managedDevices.map(
                    managed => {

                        const connectedDevice =
                            devices.find(
                                device =>
                                    device.vid ===
                                        managed.vid &&
                                    device.pid ===
                                        managed.pid
                            );


                        const device:
                            UsbDevice =
                            connectedDevice ?? {
                                busId: '',
                                vid: managed.vid,
                                pid: managed.pid,
                                device:
                                    managed.name,
                                state:
                                    'Disconnected'
                            };


                        return {
                            type: 'device',
                            device,
                            section: 'managed'
                        };
                    }
                );
            }
        }
    }
}