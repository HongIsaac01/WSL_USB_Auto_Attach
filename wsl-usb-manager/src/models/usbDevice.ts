export interface UsbDevice {
    busId: string;
    vid: string;
    pid: string;
    device: string;
    state: string;
}

export interface AutoAttachDevice {
    vid: string;
    pid: string;
    name: string;
}