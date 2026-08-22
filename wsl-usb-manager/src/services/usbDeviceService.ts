import {
    UsbDevice
} from '../models/usbDevice';

import {
    UsbipdService
} from './usbipdService';


export type DevicesChangedHandler =
    (devices: UsbDevice[]) => void;


export class UsbDeviceService {

    /**
     * 마지막으로 확인된 USB 장치 목록.
     */
    private devices: UsbDevice[] = [];


    /**
     * 이전 USB 상태 snapshot.
     *
     * 장치 상태가 실제로 바뀐 경우에만
     * UI 등에 변경을 알리기 위해 사용한다.
     */
    private lastSnapshot = '';


    constructor(
        private readonly usbipdService:
            UsbipdService,

        private readonly onDevicesChanged?:
            DevicesChangedHandler
    ) {
    }


    /**
     * usbipd.exe에서 최신 USB 상태를 읽는다.
     *
     * 상태가 이전과 달라진 경우에만
     * onDevicesChanged callback을 호출한다.
     */
    async refresh():
    Promise<UsbDevice[]> {

        const devices =
            await this.usbipdService
                .listDevices();

        const snapshot =
            this.createSnapshot(
                devices
            );

        this.devices =
            [...devices];

        if (
            snapshot !==
            this.lastSnapshot
        ) {
            this.lastSnapshot =
                snapshot;

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
    getDevices():
    UsbDevice[] {

        return [
            ...this.devices
        ];
    }


    /**
     * 현재 cache에서 WSL에 Attach된 장치만 반환한다.
     */
    getAttachedDevices():
    UsbDevice[] {

        return this.devices
            .filter(
                device =>
                    this.isAttached(
                        device
                    )
            )
            .map(
                device => ({
                    ...device
                })
            );
    }


    /**
     * 현재 cache에서 Windows 측 사용 가능 장치만 반환한다.
     */
    getAvailableDevices():
    UsbDevice[] {

        return this.devices
            .filter(
                device =>
                    !this.isAttached(
                        device
                    )
            )
            .map(
                device => ({
                    ...device
                })
            );
    }

    /**
     * USB 장치를 WSL에 Attach한다.
     *
     * 장치가 Shared 상태가 아니면
     * Windows 관리자 권한으로 bind를 먼저 수행한 뒤 Attach한다.
     */
    async attach(
        device: UsbDevice,
        refreshAfter = true
    ): Promise<void> {

        if (!device.busId) {
            throw new Error(
                'Cannot attach device without BUSID.'
            );
        }

        console.log(
            `[WSL USB] Attach request ` +
            `BUSID=${device.busId} ` +
            `STATE=${device.state}`
        );

        if (
            !this.isAttached(device) &&
            !this.isShared(device)
        ) {
            console.log(
                `[WSL USB] Binding ` +
                `BUSID=${device.busId}`
            );

            await this.usbipdService.bind(
                device.busId
            );
        }

        console.log(
            `[WSL USB] Attaching ` +
            `BUSID=${device.busId}`
        );

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
    async detach(
        device: UsbDevice,
        refreshAfter = true
    ): Promise<void> {

        if (!device.busId) {
            throw new Error(
                'Cannot detach device without BUSID.'
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
    async detachByBusId(
        busId: string,
        refreshAfter = true
    ): Promise<void> {

        if (!busId) {
            throw new Error(
                'Cannot detach device without BUSID.'
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
    isAttached(
        device: UsbDevice
    ): boolean {

        return device.state
            .toLowerCase()
            .includes('attached');
    }


    /**
     * UI에 표시할 장치 상태 문자열을 반환한다.
     */
    getStateLabel(
        device: UsbDevice
    ): string {

        const state =
            device.state
                .trim()
                .toLowerCase();

        if (
            state.includes(
                'attached'
            )
        ) {
            return 'WSL Attached';
        }

        if (
            state === 'shared'
        ) {
            return 'Shared / Ready';
        }

        return 'Windows / Not shared';
    }


    /**
     * 장치 목록 비교용 snapshot을 생성한다.
     *
     * 장치의 물리적/usbipd 상태만 비교한다.
     */
    private createSnapshot(
        devices: UsbDevice[]
    ): string {

        return devices
            .map(
                device =>
                    [
                        device.busId,
                        device.vid,
                        device.pid,
                        device.device,
                        device.state
                    ].join('|')
            )
            .sort()
            .join('\n');
    }
    
    /**
     * 장치가 현재 Windows에서 Shared 상태인지 확인한다.
     */
    isShared(
        device: UsbDevice
    ): boolean {

        return (
            device.state
                .trim()
                .toLowerCase() ===
            'shared'
        );
    }
}