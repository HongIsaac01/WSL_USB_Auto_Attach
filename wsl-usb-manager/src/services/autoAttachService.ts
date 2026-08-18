import {
    UsbDevice
} from '../models/usbDevice';

import {
    AutoAttachStore
} from '../stores/autoAttachStore';

import {
    UsbDeviceService
} from './usbDeviceService';


const AUTO_ATTACH_POLL_INTERVAL_MS =
    1000;


export class AutoAttachService {

    private timer:
        NodeJS.Timeout | undefined;

    private running =
        false;

    /**
     * 현재 Extension session에서
     * Auto Attach로 붙인 BUSID.
     *
     * Extension 종료 시 이 장치들만 Detach한다.
     */
    private readonly ownedBusIds =
        new Set<string>();

    /**
     * 사용자가 수동 Detach한 장치.
     *
     * 장치가 물리적으로 제거될 때까지
     * Auto Attach를 일시적으로 막는다.
     */
    private readonly suppressedDeviceKeys =
        new Set<string>();


    constructor(
        private readonly deviceService:
            UsbDeviceService,

        private readonly autoAttachStore:
            AutoAttachStore
    ) {
    }


    /**
     * Auto Attach monitoring을 시작한다.
     */
    start(): void {

        if (this.timer) {
            clearInterval(
                this.timer
            );
        }

        this.timer =
            setInterval(
                () => {
                    void this.process();
                },
                AUTO_ATTACH_POLL_INTERVAL_MS
            );

        // Extension 활성화 직후 한 번 실행
        void this.process();
    }


    /**
     * Auto Attach monitoring을 종료하고,
     * 이 Service가 Auto Attach한 장치를 Detach한다.
     */
    async stop():
    Promise<void> {

        if (this.timer) {
            clearInterval(
                this.timer
            );

            this.timer =
                undefined;
        }

        await this.detachOwnedDevices();
    }


    /**
     * 사용자가 장치를 직접 Detach했을 때 호출한다.
     *
     * 장치가 현재 물리적으로 연결되어 있는 동안
     * Auto Attach를 일시 정지한다.
     */
    suppress(
        device: UsbDevice
    ): void {

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
    clearSuppression(
        device: UsbDevice
    ): void {

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
    releaseOwnership(
        device: UsbDevice
    ): void {

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
    private async process():
    Promise<void> {

        if (this.running) {
            return;
        }

        this.running =
            true;

        try {
            const devices =
                await this.deviceService.refresh();

            this.cleanupOwnedBusIds(
                devices
            );

            this.cleanupSuppression(
                devices
            );

            const autoAttachDevices =
                this.autoAttachStore.getAll();

            let deviceStateChanged =
                false;

            for (const device of devices) {

                if (
                    !this.isAutoAttachEnabled(
                        device,
                        autoAttachDevices
                    )
                ) {
                    continue;
                }

                if (
                    this.isSuppressed(
                        device
                    )
                ) {
                    continue;
                }

                if (
                    this.deviceService
                        .isAttached(device)
                ) {
                    continue;
                }

                if (
                    !this.isShared(device)
                ) {
                    continue;
                }

                try {
                    console.log(
                        `[WSL USB] Auto attaching ` +
                        `${device.vid}:${device.pid} ` +
                        `BUSID=${device.busId}`
                    );

                    await this.deviceService.attach(
                        device,
                        false
                    );

                    this.ownedBusIds.add(
                        device.busId
                    );

                    deviceStateChanged =
                        true;

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

            /**
             * 실제 Attach가 발생한 경우에만
             * usbipd 상태를 다시 읽는다.
             *
             * attach(..., false)에서 refresh하지 않는다는
             * 전제로 사용하는 구조다.
             */
            if (deviceStateChanged) {
                await this.deviceService.refresh();
            }

        } catch (error) {
            console.error(
                '[WSL USB] Auto attach scan failed',
                error
            );

        } finally {
            this.running =
                false;
        }
    }


    /**
     * 현재 연결에서 사라진 BUSID를
     * ownership 목록에서 제거한다.
     */
    private cleanupOwnedBusIds(
        devices: UsbDevice[]
    ): void {

        const currentBusIds =
            new Set(
                devices.map(
                    device =>
                        device.busId
                )
            );

        for (
            const busId
            of Array.from(
                this.ownedBusIds
            )
        ) {
            if (
                !currentBusIds.has(
                    busId
                )
            ) {
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
    private cleanupSuppression(
        devices: UsbDevice[]
    ): void {

        const currentDeviceKeys =
            new Set(
                devices.map(
                    device =>
                        this.createDeviceKey(
                            device.vid,
                            device.pid
                        )
                )
            );

        for (
            const key
            of Array.from(
                this.suppressedDeviceKeys
            )
        ) {
            if (
                !currentDeviceKeys.has(
                    key
                )
            ) {
                this.suppressedDeviceKeys
                    .delete(
                        key
                    );
            }
        }
    }


    /**
     * Auto Attach 등록 장치인지 확인한다.
     */
    private isAutoAttachEnabled(
        device: UsbDevice,
        autoAttachDevices: {
            vid: string;
            pid: string;
        }[]
    ): boolean {

        return autoAttachDevices.some(
            rule =>
                rule.vid.toLowerCase() ===
                    device.vid.toLowerCase() &&
                rule.pid.toLowerCase() ===
                    device.pid.toLowerCase()
        );
    }


    /**
     * 현재 session에서 Auto Attach가
     * 일시 중지된 장치인지 확인한다.
     */
    private isSuppressed(
        device: UsbDevice
    ): boolean {

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
    private isShared(
        device: UsbDevice
    ): boolean {

        return device.state
            .toLowerCase()
            .includes('shared');
    }


    /**
     * Extension session 종료 시
     * Auto Attach로 붙인 장치만 Detach한다.
     */
    private async detachOwnedDevices():
    Promise<void> {

        const busIds =
            Array.from(
                this.ownedBusIds
            );

        for (const busId of busIds) {
            try {
                console.log(
                    `[WSL USB] Detaching managed device ` +
                    `BUSID=${busId}`
                );

                await this.deviceService
                    .detachByBusId(
                        busId,
                        false
                    );

                this.ownedBusIds.delete(
                    busId
                );

                console.log(
                    `[WSL USB] Detached ` +
                    `BUSID=${busId}`
                );

            } catch (error) {
                console.error(
                    `[WSL USB] Failed to detach ` +
                    `BUSID=${busId}`,
                    error
                );
            }
        }

        /**
         * 종료 시점이 아닌 일반 stop/restart에서도
         * 사용할 수 있도록 최종 상태를 맞춘다.
         */
        if (busIds.length > 0) {
            try {
                await this.deviceService.refresh();
            } catch {
                // Extension 종료 중에는 refresh 실패를 무시한다.
            }
        }
    }


    /**
     * VID:PID 기반 Device Key.
     */
    private createDeviceKey(
        vid: string,
        pid: string
    ): string {

        return (
            `${vid.toLowerCase()}:` +
            `${pid.toLowerCase()}`
        );
    }
}