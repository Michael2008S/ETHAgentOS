import {defineConfig} from '@playwright/test';
import {readFile} from 'node:fs/promises';
if(!process.env.AGENTOS_BUSINESS_REPORT)throw Error('Supply a passed local business report; this configuration never starts or stops any service.');
const proof=JSON.parse(await readFile(process.env.AGENTOS_BUSINESS_REPORT,'utf8'));
if(proof.status!=='passed'||proof.cleanupError)throw Error('Select a passed and cleaned business demo.');
export default defineConfig({testDir:'./tests/browser',testMatch:'local-business-loop.spec.mjs',timeout:120000,expect:{timeout:20000},workers:1,retries:0,reporter:[['list'],['json',{outputFile:'outputs/original-6097-browser-results.json'}]],use:{baseURL:process.env.AGENTOS_TEST_URL||'http://127.0.0.1:6097',browserName:'chromium',channel:'chromium',trace:'off',screenshot:'off'}});
