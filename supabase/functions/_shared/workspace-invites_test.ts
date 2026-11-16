import {assertEquals,assertRejects,assert} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {sendWorkspaceInvite} from './workspace-invites.ts';
Deno.test('invite email uses the stored recipient, scoped claim and escaped content; provider acceptance is recorded',async()=>{
 const calls:any[]=[];let sent:any;
 const db={rpc:(_n:string,args:any)=>{calls.push(args);return Promise.resolve({data:args.p_claim?{}:{email:'recipient@example.invalid',display_name:'<script>test</script>',token:'a'.repeat(64),claim:'synthetic-claim'},error:null});}};
 const result=await sendWorkspaceInvite(db,'workspace','invite','https://app.example.invalid','synthetic',async(input,init)=>{assertEquals(String(input),'https://api.resend.com/emails');sent=JSON.parse(String(init?.body));return Response.json({id:'accepted'});});
 assertEquals(result.email_sent,true);assertEquals(sent.to,['recipient@example.invalid']);assert(sent.html.includes('https://app.example.invalid/convite-equipe/'+'a'.repeat(64)));assert(!sent.html.includes('<script>'));assertEquals(calls[0].p_workspace,'workspace');assertEquals(calls[1].p_claim,'synthetic-claim');assertEquals(calls[1].p_error,null);
});
Deno.test('missing configuration or provider failure preserves the invite and reports failure, never delivery',async()=>{
 for(const key of ['', 'synthetic']) {
  let requests=0;let outcome:any;
  const db={rpc:(_n:string,args:any)=>{if(args.p_claim)outcome=args;return Promise.resolve({data:{email:'recipient@example.invalid',display_name:'Test',token:'a'.repeat(64),claim:'claim'},error:null});}};
  const r=await sendWorkspaceInvite(db,'workspace','invite','https://app.example.invalid',key,async()=>{requests++;return Response.json({error:'failed'},{status:500});});
  assertEquals(r.email_sent,false);assert(!!r.email_error);assert(!!outcome.p_error);assertEquals(requests,key?1:0);
 }
});
Deno.test('a refused claim cannot send an invitation',async()=>{
 let requests=0;
 await assertRejects(()=>sendWorkspaceInvite({rpc:()=>Promise.resolve({error:{message:'Denied'}})},'foreign','invite','https://app.example.invalid','synthetic',()=>{requests++;return Promise.resolve(Response.json({id:'unexpected'}));}));
 assertEquals(requests,0);
});
