import {
    execFile
} from 'node:child_process';

import {
    promisify
} from 'node:util';

import {
    UsbDevice
} from '../models/usbDevice';


const execFileAsync =
    promisify(execFile);


const USBIPD_EXECUTABLE =
    'usbipd.exe';


export class UsbipdService {

    /**
     * 현재 Windows에 연결된 USB 장치 목록을 반환한다.
     *
     * usbipd.exe list 출력 중 Connected 섹션만 파싱한다.
     */
    async listDevices():
    Promise<UsbDevice[]> {

        const {
            stdout
        } =
            await this.execute([
                'list'
            ]);

        return this.parseDeviceList(
            stdout
        );
    }


    /**
     * 지정한 BUSID 장치를 WSL에 Attach한다.
     */
    async attach(
        busId: string
    ): Promise<void> {

        if (!busId) {
            throw new Error(
                'BUSID is required for attach.'
            );
        }

        await this.execute([
            'attach',
            '--wsl',
            '--busid',
            busId
        ]);
    }


    /**
     * 지정한 BUSID 장치를 WSL에서 Detach한다.
     */
    async detach(
        busId: string
    ): Promise<void> {

        if (!busId) {
            throw new Error(
                'BUSID is required for detach.'
            );
        }

        await this.execute([
            'detach',
            '--busid',
            busId
        ]);
    }


    /**
     * usbipd.exe를 실행한다.
     */
    private async execute(
        args: string[]
    ): Promise<{
        stdout: string;
        stderr: string;
    }> {

        try {
            const result =
                await execFileAsync(
                    USBIPD_EXECUTABLE,
                    args,
                    {
                        windowsHide: true
                    }
                );

            return {
                stdout:
                    result.stdout ?? '',

                stderr:
                    result.stderr ?? ''
            };

        } catch (error) {
            throw this.createExecutionError(
                args,
                error
            );
        }
    }


    /**
     * usbipd.exe list 출력을 UsbDevice[]로 변환한다.
     */
    private parseDeviceList(
        output: string
    ): UsbDevice[] {

        const devices:
            UsbDevice[] = [];

        const lines =
            output.split(
                /\r?\n/
            );

        let insideConnectedSection =
            false;

        for (const rawLine of lines) {

            const line =
                rawLine.trimEnd();

            if (
                line.trim() ===
                'Connected:'
            ) {
                insideConnectedSection =
                    true;

                continue;
            }

            if (
                line.trim() ===
                'Persisted:'
            ) {
                break;
            }

            if (
                !insideConnectedSection
            ) {
                continue;
            }

            const device =
                this.parseDeviceLine(
                    line
                );

            if (device) {
                devices.push(
                    device
                );
            }
        }

        return devices;
    }


    /**
     * Connected 섹션의 한 줄을 UsbDevice로 변환한다.
     *
     * 예상 형식:
     *
     * BUSID  VID:PID    DEVICE    STATE
     */
    private parseDeviceLine(
        line: string
    ): UsbDevice | undefined {

        const match =
            line.match(
                /^\s*(\S+)\s+([0-9A-Fa-f]{4}):([0-9A-Fa-f]{4})\s+(.+?)\s{2,}(.+?)\s*$/
            );

        if (!match) {
            return undefined;
        }

        const [
            ,
            busId,
            vid,
            pid,
            device,
            state
        ] = match;

        return {
            busId,
            vid:
                vid.toLowerCase(),
            pid:
                pid.toLowerCase(),
            device:
                device.trim(),
            state:
                state.trim()
        };
    }


    /**
     * usbipd.exe 실행 오류를 사람이 읽기 쉬운 Error로 변환한다.
     */
    private createExecutionError(
        args: string[],
        error: unknown
    ): Error {

        if (
            error &&
            typeof error === 'object'
        ) {
            const candidate =
                error as {
                    message?: string;
                    stderr?: string;
                };

            const stderr =
                candidate.stderr?.trim();

            const message =
                stderr ||
                candidate.message ||
                'Unknown usbipd error.';

            return new Error(
                `usbipd.exe ${args.join(' ')} failed: ${message}`
            );
        }

        return new Error(
            `usbipd.exe ${args.join(' ')} failed: ${String(error)}`
        );
    }
}