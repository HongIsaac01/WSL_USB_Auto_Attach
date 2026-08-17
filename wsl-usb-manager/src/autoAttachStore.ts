import * as vscode from 'vscode';

import {
    AutoAttachDevice
} from './types';

const STORAGE_KEY =
    'autoAttachDevices';

export class AutoAttachStore {
    constructor(
        private readonly context:
            vscode.ExtensionContext
    ) {
    }

    getAll(): AutoAttachDevice[] {
        return this.context.globalState.get<
            AutoAttachDevice[]
        >(
            STORAGE_KEY,
            []
        );
    }

    async add(
        device: AutoAttachDevice
    ): Promise<void> {
        const devices = this.getAll();

        const exists =
            devices.some(
                item =>
                    item.vid === device.vid &&
                    item.pid === device.pid
            );

        if (exists) {
            return;
        }

        devices.push(device);

        await this.context.globalState.update(
            STORAGE_KEY,
            devices
        );
    }

    async remove(
        vid: string,
        pid: string
    ): Promise<void> {
        const devices =
            this.getAll().filter(
                item =>
                    !(
                        item.vid === vid &&
                        item.pid === pid
                    )
            );

        await this.context.globalState.update(
            STORAGE_KEY,
            devices
        );
    }

    has(
        vid: string,
        pid: string
    ): boolean {
        return this.getAll().some(
            item =>
                item.vid === vid &&
                item.pid === pid
        );
    }
}