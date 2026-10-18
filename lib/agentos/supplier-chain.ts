import type { PublicClient } from 'viem';
import { identityABI } from '../../sdk/identity.ts';
import type { WalletDeployment } from '../../sdk/wallet.ts';
import { DomainError } from './engine.ts';
import { inspectIdentity } from './identity.ts';
import { supplierMetadata,SUPPLIER_METADATA_KEY,type SupplierDescriptor } from './supplier.ts';
import type { ChainOrder } from './orders.ts';
export async function authorizeSupplier(client:PublicClient,deployment:WalletDeployment,identity:NonNullable<ChainOrder['agentIdentity']>,supplier:SupplierDescriptor){
 try{await inspectIdentity(client,deployment,identity);}catch(error){if(error instanceof DomainError)throw new DomainError('Supplier identity authority changed. Rebind before execution.','SUPPLIER_REJECTED');throw error;}
 const metadata=await client.readContract({address:identity.registry,abi:identityABI,functionName:'getMetadata',args:[BigInt(identity.registryAgentId),SUPPLIER_METADATA_KEY]});
 if(metadata.toLowerCase()!==supplierMetadata(supplier).toLowerCase())throw new DomainError('The registry owner has not authorized this supplier configuration.','SUPPLIER_REJECTED');
}
