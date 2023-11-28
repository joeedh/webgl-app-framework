export const ResourcePages: any[];
export class ResourcePageType {
    static resDefine(): {
        name: string;
        uiname: string;
        description: string;
        icon: number;
        flag: number;
    };
    static register(cls: any): void;
    getResClass(): void;
    getResources(): any[];
    loadResource(res: any): any;
}
