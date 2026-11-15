import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
const page=await browser.newPage();let connected=false,calls=0;
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/functions/v1/workspace-operations?pair_whatsapp=*',async route=>{
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'content-type'}});
 calls++;const token=new URL(route.request().url()).searchParams.get('pair_whatsapp');
 const expired=token==='b'.repeat(64);
 return route.fulfill({status:expired?404:200,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},body:JSON.stringify(expired?{error:'Link expirado ou desativado.'}:{connected,qrcode:connected?null:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII='})});
});
try{
 const base=process.env.TEST_APP_URL||'http://localhost:8081';
 await page.goto(base+'/conectar-whatsapp/'+'a'.repeat(64));
 await page.getByAltText('QR Code para conectar WhatsApp',{exact:true}).waitFor();
 assert.equal(await page.locator('input[type=password]').count(),0);
 connected=true;await page.getByText('WhatsApp conectado. Você pode fechar esta página.',{exact:true}).waitFor();
 await page.goto(base+'/conectar-whatsapp/'+'b'.repeat(64));
 await page.getByRole('alert').filter({hasText:'Link expirado ou desativado.'}).waitFor();
 const before=calls;await page.goto(base+'/conectar-whatsapp/invalido');
 await page.getByRole('alert').filter({hasText:'Link inválido.'}).waitFor();
 assert.equal(calls,before);assert.deepEqual(errors,[]);
 console.log('PASS public pairing page: no login or private data, QR rendering/status, expired/invalid denial');
}finally{await browser.close();}
