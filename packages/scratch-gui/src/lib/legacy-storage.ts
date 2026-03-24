import {ScratchStorage, Asset} from 'scratch-storage';
import {Logger} from 'tslog';

import defaultProject from './default-project';
import {GUIStorage, TranslatorFunction, VirtualMachine, GUICloudVariableProvider} from '../gui-config';
import {LegacyBackpackStorage} from './legacy-backpack-storage';
import CloudProvider from './cloud-provider';

import saveProjectToServer from '../lib/save-project-to-server';

const log = new Logger({name: 'legacy-storage'});

export class LegacyStorage implements GUIStorage {
    private projectHost?: string;
    private projectToken?: string;
    private assetHost?: string;
    private translator?: TranslatorFunction;

    readonly scratchStorage = new ScratchStorage();
    readonly backpackStorage = new LegacyBackpackStorage({
        readAuth (session) {
            if (!session) {
                return Promise.reject(new Error('missing session'));
            }

            return Promise.resolve({
                username: session.username,
                authType: 'x-token',
                authToken: session.token
            });
        }
    });
    readonly cloudVariables = {
        createProvider (
            cloudHost: string,
            vm: VirtualMachine,
            username: string,
            projectId: string
        ): GUICloudVariableProvider {
            return new CloudProvider(cloudHost, vm, username, projectId);
        }
    };

    constructor () {
        this.cacheDefaultProject(this.scratchStorage);
        this.addOfficialScratchWebStores(this.scratchStorage);
        this.disableFetchWorkerForSubdirectoryDeployment(this.scratchStorage);
    }

    setProjectHost (host: string): void {
        this.projectHost = host;
    }

    setProjectToken (token: string): void {
        this.projectToken = token;
    }

    setProjectMetadata (projectId: string | null | undefined): void {
        const {RequestMetadata, setMetadata, unsetMetadata} = this.scratchStorage.scratchFetch;

        // If project ID is '0' or zero, it's not a real project ID. In that case, remove the project ID metadata.
        // Same if it's null undefined.
        if (projectId && projectId !== '0') {
            setMetadata(RequestMetadata.ProjectId, projectId);
        } else {
            unsetMetadata(RequestMetadata.ProjectId);
        }
    }

    setAssetHost (host: string): void {
        log.info(`Asset host set to: ${host}`);
        this.assetHost = host;
    }

    setTranslatorFunction (translator: TranslatorFunction): void {
        this.translator = translator;

        this.cacheDefaultProject(this.scratchStorage);
    }

    setBackpackHost (host: string): void {
        this.backpackStorage.setHostAndRegisterWebStore(host, this.scratchStorage);
    }

    saveProject (
        projectId: number,
        vmState: string,
        params: {originalId: string; isCopy: boolean; isRemix: boolean; title: string;}
    ): Promise<{id: string | number;}> {
        const host = this.projectHost;

        if (!host) {
            return Promise.reject(new Error('Project host not set'));
        }
        // Haven't inlined the code here so that we can keep Git history on the implementation, just in case
        return saveProjectToServer(host, projectId, vmState, params);
    }

    private cacheDefaultProject (storage: ScratchStorage) {
        const defaultProjectAssets = defaultProject(this.translator);
        defaultProjectAssets.forEach(asset => storage.builtinHelper._store(
            storage.AssetType[asset.assetType],
            storage.DataFormat[asset.dataFormat],
            asset.data,
            asset.id
        ));
    }

    /**
     * scratch-storage's pre-built webpack bundle has publicPath hardcoded to "/".
     * This causes the fetch web worker URL to resolve from the host root rather
     * than relative to the page. When deployed to a subdirectory (e.g. GitHub Pages
     * at /repo-name/branch/scratch-gui/), the worker tries to load from /chunks/...
     * which is a 404, and then silently hangs all asset requests forever.
     *
     * Fix: when serving from a subdirectory, remove the broken worker tool so
     * scratch-storage falls back to direct fetch() which works correctly.
     */
    private disableFetchWorkerForSubdirectoryDeployment (storage: ScratchStorage): void {
        if (typeof window === 'undefined') return;

        // Only needed when page is served from a subdirectory (not root)
        const path = window.location.pathname;
        const isSubdirectory = path !== '/' && path !== '/index.html';

        if (isSubdirectory) {
            const webHelper = (storage as any).webHelper;
            if (webHelper?.assetTool?.tools) {
                // Filter out PublicFetchWorkerTool (has an 'inner' property),
                // keeping only FetchTool which uses direct fetch()
                const originalCount = webHelper.assetTool.tools.length;
                webHelper.assetTool.tools = webHelper.assetTool.tools.filter(
                    (tool: any) => !('inner' in tool)
                );
                if (webHelper.assetTool.tools.length < originalCount) {
                    log.info('Disabled fetch worker for subdirectory deployment (using direct fetch)');
                }
            }
        }
    }

    private addOfficialScratchWebStores (storage: ScratchStorage) {
        storage.addWebStore(
            [storage.AssetType.Project],
            this.getProjectGetConfig.bind(this),
            this.getProjectCreateConfig.bind(this),
            this.getProjectUpdateConfig.bind(this)
        );

        storage.addWebStore(
            [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap, storage.AssetType.Sound],
            this.getAssetGetConfig.bind(this),
            // We set both the create and update configs to the same method because
            // storage assumes it should update if there is an assetId, but the
            // asset store uses the assetId as part of the create URI.
            this.getAssetCreateConfig.bind(this),
            this.getAssetCreateConfig.bind(this)
        );

        storage.addWebStore(
            [storage.AssetType.Sound],
            asset => `static/extension-assets/scratch3_music/${asset.assetId}.${asset.dataFormat}`
        );
    }

    private getProjectGetConfig (projectAsset) {
        const path = `${this.projectHost}/${projectAsset.assetId}`;
        const qs = this.projectToken ? `?token=${this.projectToken}` : '';
        return path + qs;
    }

    private getProjectCreateConfig () {
        return {
            url: `${this.projectHost}/`,
            withCredentials: true
        };
    }

    private getProjectUpdateConfig (projectAsset: Asset) {
        return {
            url: `${this.projectHost}/${projectAsset.assetId}`,
            withCredentials: true
        };
    }

    private getAssetGetConfig (asset: Asset) {
        const url = `${this.assetHost}/internalapi/asset/${asset.assetId}.${asset.dataFormat}/get/`;
        log.debug(`Fetching asset from: ${url}`);
        return url;
    }

    private getAssetCreateConfig (asset: Asset) {
        return {
            // There is no such thing as updating assets, but storage assumes it
            // should update if there is an assetId, and the asset store uses the
            // assetId as part of the create URI. So, force the method to POST.
            // Then when storage finds this config to use for the "update", still POSTs
            method: 'post',
            url: `${this.assetHost}/${asset.assetId}.${asset.dataFormat}`,
            withCredentials: true
        };
    }
}
