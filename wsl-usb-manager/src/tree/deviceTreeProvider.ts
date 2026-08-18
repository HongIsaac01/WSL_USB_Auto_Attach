import * as vscode from 'vscode';

import {
    UsbDevice
} from '../models/usbDevice';

import {
    AutoAttachStore
} from '../stores/autoAttachStore';

import {
    DeviceAliasStore
} from '../stores/deviceAliasStore';


export type DeviceSection =
    | 'attached'
    | 'available'
    | 'managed';


export type DeviceTreeNode =
    | SectionNode
    | DeviceNode;


export interface SectionNode {
    type: 'section';
    label: string;
    section: DeviceSection;
}


export interface DeviceNode {
    type: 'device';
    device: UsbDevice;
    section: DeviceSection;
}


export class DeviceTreeProvider
implements vscode.TreeDataProvider<DeviceTreeNode> {

    private readonly onDidChangeTreeDataEmitter =
        new vscode.EventEmitter<
            DeviceTreeNode | undefined | void
        >();

    readonly onDidChangeTreeData =
        this.onDidChangeTreeDataEmitter.event;


    /**
     * 현재 USB 장치 목록.
     *
     * DeviceTreeProvider는 usbipd.exe를 직접 호출하지 않는다.
     * 외부 Service에서 전달받은 상태만 렌더링한다.
     */
    private devices: UsbDevice[] = [];


    constructor(
        private readonly autoAttachStore: AutoAttachStore,
        private readonly aliasStore: DeviceAliasStore
    ) {
    }


    /**
     * 최신 USB 장치 목록으로 TreeView cache를 갱신한다.
     */
    updateDevices(
        devices: UsbDevice[]
    ): void {
        this.devices = [...devices];
        this.refresh();
    }


    /**
     * 현재 cache는 유지하고 TreeView만 다시 렌더링한다.
     *
     * Alias 또는 Auto Attach 설정 변경처럼
     * USB 목록 자체가 변하지 않은 경우 사용한다.
     */
    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }


    getTreeItem(
        element: DeviceTreeNode
    ): vscode.TreeItem {

        if (element.type === 'section') {
            return this.createSectionTreeItem(
                element
            );
        }

        return this.createDeviceTreeItem(
            element
        );
    }


    getChildren(
        element?: DeviceTreeNode
    ): DeviceTreeNode[] {

        if (!element) {
            return this.getRootSections();
        }

        if (element.type !== 'section') {
            return [];
        }

        switch (element.section) {
            case 'attached':
                return this.getAttachedNodes();

            case 'available':
                return this.getAvailableNodes();

            case 'managed':
                return this.getManagedNodes();
        }
    }


    /**
     * Root section 목록.
     */
    private getRootSections():
    SectionNode[] {

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


    /**
     * 현재 WSL에 Attach된 장치.
     */
    private getAttachedNodes():
    DeviceNode[] {

        return this.devices
            .filter(
                device =>
                    this.isAttached(device)
            )
            .map(
                device => ({
                    type: 'device',
                    device,
                    section: 'attached'
                })
            );
    }


    /**
     * Windows 측에서 사용 가능한 장치.
     */
    private getAvailableNodes():
    DeviceNode[] {

        return this.devices
            .filter(
                device =>
                    !this.isAttached(device)
            )
            .map(
                device => ({
                    type: 'device',
                    device,
                    section: 'available'
                })
            );
    }


    /**
     * Auto Attach 등록 장치.
     *
     * 실제 USB 연결 여부와 상관없이 표시한다.
     */
    private getManagedNodes():
    DeviceNode[] {

        const managedDevices =
            this.autoAttachStore.getAll();

        return managedDevices.map(
            managed => {

                const connectedDevice =
                    this.devices.find(
                        device =>
                            this.isSameDevice(
                                device,
                                managed.vid,
                                managed.pid
                            )
                    );

                const device: UsbDevice =
                    connectedDevice ?? {
                        busId: '',
                        vid: managed.vid,
                        pid: managed.pid,
                        device: managed.name,
                        state: 'Disconnected'
                    };

                return {
                    type: 'device',
                    device,
                    section: 'managed'
                };
            }
        );
    }


    /**
     * Section TreeItem 생성.
     */
    private createSectionTreeItem(
        node: SectionNode
    ): vscode.TreeItem {

        const item =
            new vscode.TreeItem(
                node.label,
                vscode.TreeItemCollapsibleState.Expanded
            );

        item.contextValue =
            'wslUsbSection';

        return item;
    }


    /**
     * USB Device TreeItem 생성.
     */
    private createDeviceTreeItem(
        node: DeviceNode
    ): vscode.TreeItem {

        const device =
            node.device;

        const attached =
            this.isAttached(device);

        const disconnected =
            this.isDisconnected(device);

        const autoAttach =
            this.autoAttachStore.has(
                device.vid,
                device.pid
            );

        const alias =
            this.aliasStore.get(
                device.vid,
                device.pid
            );

        const item =
            new vscode.TreeItem(
                alias ?? device.device,
                vscode.TreeItemCollapsibleState.None
            );

        item.description =
            disconnected
                ? `${device.vid}:${device.pid} · Disconnected`
                : `${device.vid}:${device.pid}`;

        item.tooltip =
            this.createTooltip(
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
    private createTooltip(
        device: UsbDevice,
        alias: string | undefined,
        autoAttach: boolean,
        disconnected: boolean
    ): string {

        return [
            alias
                ? `Name: ${alias}`
                : undefined,

            `Device: ${device.device}`,
            `VID:PID: ${device.vid}:${device.pid}`,

            device.busId
                ? `BUSID: ${device.busId}`
                : 'BUSID: Not connected',

            disconnected
                ? 'State: Disconnected'
                : `State: ${this.getStateLabel(device)}`,

            `Auto Attach: ${autoAttach ? 'ON' : 'OFF'}`
        ]
            .filter(
                (value): value is string =>
                    value !== undefined
            )
            .join('\n');
    }


    /**
     * Section에 따라 icon/contextValue를 설정한다.
     */
    private applyDevicePresentation(
        item: vscode.TreeItem,
        section: DeviceSection,
        attached: boolean,
        autoAttach: boolean,
        disconnected: boolean
    ): void {

        switch (section) {
            case 'attached':
                item.contextValue =
                    autoAttach
                        ? 'attachedAutoDevice'
                        : 'attachedDevice';

                item.iconPath =
                    new vscode.ThemeIcon(
                        'vm-active'
                    );

                return;


            case 'available':
                item.contextValue =
                    autoAttach
                        ? 'availableAutoDevice'
                        : 'availableDevice';

                item.iconPath =
                    new vscode.ThemeIcon(
                        'plug'
                    );

                return;


            case 'managed':
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

                return;
        }
    }


    /**
     * 현재 WSL에 Attach되어 있는지 확인한다.
     */
    private isAttached(
        device: UsbDevice
    ): boolean {

        return device.state
            .toLowerCase()
            .includes('attached');
    }


    /**
     * 물리적으로 연결되지 않은 Managed Device인지 확인한다.
     */
    private isDisconnected(
        device: UsbDevice
    ): boolean {

        return device.state === 'Disconnected';
    }


    /**
     * VID:PID가 같은 장치인지 확인한다.
     */
    private isSameDevice(
        device: UsbDevice,
        vid: string,
        pid: string
    ): boolean {

        return (
            device.vid.toLowerCase() ===
                vid.toLowerCase() &&
            device.pid.toLowerCase() ===
                pid.toLowerCase()
        );
    }


    /**
     * TreeView용 상태 문자열.
     */
    private getStateLabel(
        device: UsbDevice
    ): string {

        const state =
            device.state.toLowerCase();

        if (state.includes('attached')) {
            return 'WSL Attached';
        }

        if (state.includes('shared')) {
            return 'Shared / Ready';
        }

        return 'Windows / Not shared';
    }
}