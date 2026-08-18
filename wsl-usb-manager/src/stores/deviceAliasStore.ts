import * as vscode from 'vscode';


const STORAGE_KEY =
    'deviceAliases';


type AliasMap =
    Record<string, string>;


export class DeviceAliasStore {

    constructor(
        private readonly context:
            vscode.ExtensionContext
    ) {
    }


    /**
     * VID:PID 조합을 저장용 key로 변환한다.
     */
    private createKey(
        vid: string,
        pid: string
    ): string {

        return (
            `${vid.toLowerCase()}:` +
            `${pid.toLowerCase()}`
        );
    }


    /**
     * 저장된 별칭을 반환한다.
     *
     * 별칭이 등록되어 있지 않으면 undefined를 반환한다.
     */
    get(
        vid: string,
        pid: string
    ): string | undefined {

        const aliases =
            this.getAll();

        return aliases[
            this.createKey(
                vid,
                pid
            )
        ];
    }


    /**
     * 장치 별칭을 저장한다.
     */
    async set(
        vid: string,
        pid: string,
        alias: string
    ): Promise<void> {

        const aliases = {
            ...this.getAll()
        };

        aliases[
            this.createKey(
                vid,
                pid
            )
        ] = alias;

        await this.save(
            aliases
        );
    }


    /**
     * 저장된 장치 별칭을 삭제한다.
     */
    async remove(
        vid: string,
        pid: string
    ): Promise<void> {

        const aliases = {
            ...this.getAll()
        };

        delete aliases[
            this.createKey(
                vid,
                pid
            )
        ];

        await this.save(
            aliases
        );
    }


    /**
     * 전체 alias map을 읽는다.
     */
    private getAll():
    AliasMap {

        return this.context
            .globalState
            .get<AliasMap>(
                STORAGE_KEY,
                {}
            );
    }


    /**
     * 전체 alias map을 저장한다.
     */
    private async save(
        aliases: AliasMap
    ): Promise<void> {

        await this.context
            .globalState
            .update(
                STORAGE_KEY,
                aliases
            );
    }
}