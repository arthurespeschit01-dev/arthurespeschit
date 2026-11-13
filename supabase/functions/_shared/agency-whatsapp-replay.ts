// Checkpoint only after every event in the page has been durably ingested.
export async function replayHistoryPage(db:any,connection:any,account:any,loadPage:(offset:number)=>Promise<any>,ingest:(payload:any)=>Promise<any>){
 const offset=Number(connection.replay_offset)||0;const page=await loadPage(offset);
 for(const event of page.events||[])await ingest(event.payload);
 if(page.has_more&&(!Number.isInteger(page.next_offset)||page.next_offset<=offset))throw Error('Invalid replay cursor');
 const {error}=await db.from('agency_whatsapp_connections').update({replay_offset:page.has_more?page.next_offset:0}).eq('user_id',connection.user_id).eq('active_account_id',account.id);if(error)throw error;
 return {done:!page.has_more,processed:(page.events||[]).length};
}
