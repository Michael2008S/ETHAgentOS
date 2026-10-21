import {canonical} from '../../cre/workflow/verify.ts';
import {DomainError} from './engine.ts';
import {parseSupplierConfiguration,type OrderSupplier,type SupplierConfiguration,type SupplierDescriptor} from './supplier.ts';

export const MAX_SUPPLIERS=8;
/** Endpoints come exclusively from operator configuration, never request bodies. */
export function parseSupplierConfigurations(raw:unknown,allowLocal=false):SupplierConfiguration[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>MAX_SUPPLIERS)throw new DomainError('Configure between one and eight skill suppliers.','UNAVAILABLE');
 const configurations=raw.map(value=>parseSupplierConfiguration(value,allowLocal));
 if(new Set(configurations.map(c=>c.id)).size!==configurations.length)throw new DomainError('Supplier identifiers must be unique.','UNAVAILABLE');
 return configurations;
}
/** Authentication is isolated from public descriptors and descriptor hashes. */
export function parseSupplierKeys(raw:unknown,configurations:SupplierConfiguration[]):Map<string,string>{
 if(raw===undefined)return new Map();
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length>MAX_SUPPLIERS||Object.entries(raw).some(([id,value])=>!configurations.some(c=>c.id===id)||typeof value!=='string'||!value||value.length>4096))throw new DomainError('Supplier authentication references an invalid configuration.','UNAVAILABLE');
 return new Map(Object.entries(raw) as [string,string][]);
}
export async function readSupplierJSON(response:Response):Promise<unknown>{
 if(!response.ok||!response.body)throw new DomainError('Supplier configuration is unavailable.','UNAVAILABLE');
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';
 try{for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.length)>65536){await reader.cancel();throw new DomainError('Supplier catalog exceeds the size limit.','UNAVAILABLE');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 try{return JSON.parse(text);}catch{throw new DomainError('Supplier configuration is unavailable.','UNAVAILABLE');}
}
export type SupplierPool=OrderSupplier&{suppliers:OrderSupplier[];selectById(id?:string):OrderSupplier;selectDescriptor(descriptor:SupplierDescriptor):OrderSupplier};
export function supplierPool(suppliers:OrderSupplier[]):SupplierPool{
 if(!suppliers.length||suppliers.length>MAX_SUPPLIERS||new Set(suppliers.map(s=>s.descriptor.id)).size!==suppliers.length)throw new DomainError('Supplier identifiers must be unique and bounded.','UNAVAILABLE');
 const selectById=(id?:string)=>{const supplier=id===undefined?suppliers[0]:suppliers.find(s=>s.descriptor.id===id);if(!supplier)throw new DomainError('The selected supplier is not configured.','SUPPLIER_REJECTED');return supplier;};
 const selectDescriptor=(descriptor:SupplierDescriptor)=>{const supplier=selectById(descriptor.id);if(canonical(supplier.descriptor)!==canonical(descriptor))throw new DomainError('Supplier configuration differs from the authorized order.','SUPPLIER_REJECTED');return supplier;};
 return {descriptor:suppliers[0].descriptor,suppliers,selectById,selectDescriptor,execute:request=>selectDescriptor(request.supplier).execute(request),authorize:order=>{if(!order.supplier)throw new DomainError('A frozen supplier is required.','SUPPLIER_REJECTED');return selectDescriptor(order.supplier).authorize(order);}};
}
/** Historical single-supplier test adapters remain compatible; selection never falls back. */
export function supplierForOrder(supplier:OrderSupplier|undefined,descriptor:SupplierDescriptor|undefined){
 if(!supplier)throw new DomainError('Supplier is temporarily unavailable. The execution checkpoint is retained.','SUPPLIER_UNAVAILABLE');
 if(!descriptor)throw new DomainError('A frozen supplier is required.','SUPPLIER_REJECTED');
 if('selectDescriptor' in supplier)return (supplier as SupplierPool).selectDescriptor(descriptor);
 if(canonical(supplier.descriptor)!==canonical(descriptor))throw new DomainError('Supplier configuration differs from the authorized order.','SUPPLIER_REJECTED');return supplier;
}
