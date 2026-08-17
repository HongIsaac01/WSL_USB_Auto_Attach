import { execFile } from 'child_process';
import { promisify } from 'util';

import { UsbDevice } from './types';

const execFileAsync = promisify(execFile);

async function runUsbipd(
    args: string[]
): Promise<string> {
    const { stdout, stderr } =
        await execFileAsync(
            'usbipd.exe',
            args
        );

    if (stderr?.trim()) {
        console.log(
            '[usbipd stderr]',
            stderr.trim()
        );
    }

    return stdout;
}

export async function listUsbDevices():
Promise<UsbDevice[]> {
    const output =
        await runUsbipd(['list']);

    const devices: UsbDevice[] = [];

    let connected = false;

    for (
        const rawLine of output.split(/\r?\n/)
    ) {
        const line =
            rawLine.trimEnd();

        if (
            line.trim() === 'Connected:'
        ) {
            connected = true;
            continue;
        }

        if (
            line.trim() === 'Persisted:'
        ) {
            connected = false;
            continue;
        }

        if (!connected) {
            continue;
        }

        if (
            line.trim() === '' ||
            line.trimStart().startsWith(
                'BUSID'
            )
        ) {
            continue;
        }

        const match = line.match(
            /^\s*(\d+-\d+)\s+([0-9a-fA-F]{4}):([0-9a-fA-F]{4})\s+(.+?)\s{2,}(.+?)\s*$/
        );

        if (!match) {
            continue;
        }

        devices.push({
            busId: match[1],
            vid:
                match[2].toLowerCase(),
            pid:
                match[3].toLowerCase(),
            device:
                match[4].trim(),
            state:
                match[5].trim()
        });
    }

    return devices;
}

export async function attachUsbDevice(
    busId: string
): Promise<void> {
    await runUsbipd([
        'attach',
        '--wsl',
        '--busid',
        busId
    ]);
}

export async function detachUsbDevice(
    busId: string
): Promise<void> {
    await runUsbipd([
        'detach',
        '--busid',
        busId
    ]);
}

export function isAttached(
    device: UsbDevice
): boolean {
    return device.state
        .toLowerCase()
        .includes('attached');
}

export function getDeviceStateLabel(
    device: UsbDevice
): string {
    const state = device.state.toLowerCase();

    if (state.includes('attached')) {
        return 'WSL Attached';
    }

    if (state.includes('shared')) {
        return 'Shared / Ready';
    }

    return 'Windows / Not shared';
}