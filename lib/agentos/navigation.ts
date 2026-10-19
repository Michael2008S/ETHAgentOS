export const PAGES=['overview','tasks','agents','marketplace','vault','permissions','memory','integrations','developer'] as const;
export function routeFromHash(hash:string){const [name,query='']=hash.replace(/^#/,'').split('?');const page=PAGES.find(p=>p===name)??(name==='prefunded-orders'?'vault':'overview');const params=new URLSearchParams(query);return {page,task:params.get('task'),order:params.get('order')};}
export function routeHash(page:typeof PAGES[number],params:Record<string,string>={}){const query=new URLSearchParams(params).toString();return '#'+page+(query?'?'+query:'');}
