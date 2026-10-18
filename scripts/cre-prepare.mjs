import { constants, copyFileSync } from 'node:fs';
for(const [source,target] of [['cre/project.example.yaml','cre/project.yaml'],['cre/workflow/workflow.example.yaml','cre/workflow/workflow.yaml'],['cre/workflow/config.example.json','cre/workflow/config.local.json']]){
  try{copyFileSync(source,target,constants.COPYFILE_EXCL);console.log('Created '+target);}
  catch(error){if(error.code!=='EEXIST')throw error;console.log('Preserved existing '+target);}
}
