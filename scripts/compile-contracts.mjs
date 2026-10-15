import solc from 'solc';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function compile(){
 const sources=Object.fromEntries(['AgentEscrow.sol','AgentVault.sol','test/MockToken.sol'].map(f=>[f,{content:readFileSync(new URL('../contracts/'+f,import.meta.url),'utf8')}]));
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 return Object.fromEntries(Object.values(output.contracts).flatMap(contracts=>Object.entries(contracts).map(([name,c])=>[name,{abi:c.abi,bytecode:'0x'+c.evm.bytecode.object}])));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){mkdirSync('contracts/artifacts',{recursive:true});for(const [name,artifact]of Object.entries(compile()))writeFileSync(`contracts/artifacts/${name}.json`,JSON.stringify(artifact,null,2));console.log('Compiled AgentEscrow, AgentVault and test token.');}
