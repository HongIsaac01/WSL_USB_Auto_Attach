import * as vscode from 'vscode';

import {
    AutoAttachDevice
} from '../models/usbDevice';


const STORAGE_KEY =
    'autoAttachDevices';


export class AutoAttachStore {

    constructor(
        private readonly context:
            vscode.ExtensionContext
    ) {
    }


    /**
     * 등록된 모든 Auto Attach 장치를 반환한다.
     */
    getAll():
    AutoAttachDevice[] {

        return this.context
            .globalState
            .get<AutoAttachDevice[]>(
                STORAGE_KEY,
                []
            );
    }


    /**
     * VID:PID가 Auto Attach 목록에 등록되어 있는지 확인한다.
     */
    has(
        vid: string,
        pid: string
    ): boolean {

        return this.getAll().some(
            device =>
                this.isSameDevice(
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
    async add(
        device: AutoAttachDevice
    ): Promise<void> {

        const devices =
            this.getAll();

        const exists =
            devices.some(
                item =>
                    this.isSameDevice(
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
    async remove(
        vid: string,
        pid: string
    ): Promise<void> {

        const devices =
            this.getAll().filter(
                device =>
                    !this.isSameDevice(
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
    private async save(
        devices: AutoAttachDevice[]
    ): Promise<void> {

        await this.context
            .globalState
            .update(
                STORAGE_KEY,
                devices
            );
    }


    /**
     * VID:PID 기준으로 같은 장치 종류인지 비교한다.
     */
    private isSameDevice(
        device: AutoAttachDevice,
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
}