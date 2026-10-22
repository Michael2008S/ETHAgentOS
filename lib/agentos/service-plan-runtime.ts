import {configuredPluginPurchaseContext} from './plugin-purchase-runtime';
import {pluginRows} from './plugin-store';
import {pluginDatabase} from './plugin-runtime';
import {serviceCatalog} from './service-catalog';
import type {InstalledPlugin} from './plugin-state';
import type {Workspace} from './types';
export async function configuredServiceCatalog(request:Request,owner:string,state:Workspace){
 const context=await configuredPluginPurchaseContext(request),installed=await pluginRows<InstalledPlugin>(pluginDatabase().database,owner,'agentos_plugins');
 return {...await serviceCatalog(state,installed,context),deployment:context.deployment};
}
