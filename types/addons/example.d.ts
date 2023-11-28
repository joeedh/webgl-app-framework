export function validArgv(api: any, argv: any): void;
export function handleArgv(api: any, argv: any): void;
export function register(api: any): void;
export function unregister(): void;
export namespace addonDefine {
    let name: string;
    let version: number;
    let author: string;
    let url: string;
    let icon: number;
    let description: string;
    let documentation: string;
}
