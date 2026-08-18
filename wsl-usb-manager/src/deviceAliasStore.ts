import * as vscode from 'vscode';

const STORAGE_KEY = 'deviceAliases';

type AliasMap = Record<string, string>;

export class DeviceAliasStore {
    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
    }

    private makeKey(
        vid: string,
        pid: string
    ): string {
        return `${vid.toLowerCase()}:${pid.toLowerCase()}`;
    }

    get(
        vid: string,
        pid: string
    ): string | undefined {
        const aliases =
            this.context.globalState.get<AliasMap>(
                STORAGE_KEY,
                {}
            );

        return aliases[
            this.makeKey(vid, pid)
        ];
    }

    async set(
        vid: string,
        pid: string,
        alias: string
    ): Promise<void> {
        const aliases = {
            ...this.context.globalState.get<AliasMap>(
                STORAGE_KEY,
                {}
            )
        };

        aliases[
            this.makeKey(vid, pid)
        ] = alias;

        await this.context.globalState.update(
            STORAGE_KEY,
            aliases
        );
    }

    async remove(
        vid: string,
        pid: string
    ): Promise<void> {
        const aliases = {
            ...this.context.globalState.get<AliasMap>(
                STORAGE_KEY,
                {}
            )
        };

        delete aliases[
            this.makeKey(vid, pid)
        ];

        await this.context.globalState.update(
            STORAGE_KEY,
            aliases
        );
    }
}