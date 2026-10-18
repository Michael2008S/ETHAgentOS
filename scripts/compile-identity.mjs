import solc from 'solc';
import { readFileSync } from 'node:fs';
import { encodeFunctionData,parseAbi } from 'viem';
let compiled;
export function compileIdentity(){
 if(compiled)return compiled;
 const files=['vendor/erc8004/IdentityRegistryUpgradeable.sol','vendor/erc8004/ReputationRegistryUpgradeable.sol','test/IdentityBootstrap.sol'];
 const sources=Object.fromEntries(files.map(p=>[p,{content:readFileSync(new URL('../contracts/'+p,import.meta.url),'utf8')}]));
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{viaIR:true,optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:path=>{if(!path.startsWith('@openzeppelin/')||path.split('/').includes('..'))return {error:'Unsupported import'};try{return {contents:readFileSync(new URL('../node_modules/'+path,import.meta.url),'utf8')};}catch{return {error:'Missing OpenZeppelin dependency'};}}}));
 const errors=(output.errors??[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 compiled=Object.fromEntries(Object.values(output.contracts).flatMap(c=>Object.entries(c).map(([name,v])=>[name,{abi:v.abi,bytecode:'0x'+v.evm.bytecode.object}])));return compiled;
}
export async function deployIdentityRegistries(client,signer,admin){
 const artifacts=compileIdentity(),upgradeABI=parseAbi(['function upgradeToAndCall(address newImplementation,bytes data) payable']);
 async function deploy(name,args=[]){const hash=await signer.deployContract({...artifacts[name],args,account:admin,chain:null,gas:10000000n});const r=await client.waitForTransactionReceipt({hash});if(r.status!=='success')throw new Error('Local registry deployment reverted');return r.contractAddress;}
 const bootstrap=await deploy('IdentityBootstrap'),identityImpl=await deploy('IdentityRegistryUpgradeable'),reputationImpl=await deploy('ReputationRegistryUpgradeable');
 const init=encodeFunctionData({abi:artifacts.IdentityBootstrap.abi,functionName:'initialize',args:[admin]});
 const identityRegistry=await deploy('ERC1967Proxy',[bootstrap,init]),reputationRegistry=await deploy('ERC1967Proxy',[bootstrap,init]);
 for(const [address,implementation,name,args]of [[identityRegistry,identityImpl,'IdentityRegistryUpgradeable',[]],[reputationRegistry,reputationImpl,'ReputationRegistryUpgradeable',[identityRegistry]]]){
  const hash=await signer.writeContract({address,abi:upgradeABI,functionName:'upgradeToAndCall',args:[implementation,encodeFunctionData({abi:artifacts[name].abi,functionName:'initialize',args})],account:admin,chain:null,gas:3000000n});const r=await client.waitForTransactionReceipt({hash});if(r.status!=='success')throw new Error('Local registry initialization reverted');
 }
 return {identityRegistry,reputationRegistry};
}
