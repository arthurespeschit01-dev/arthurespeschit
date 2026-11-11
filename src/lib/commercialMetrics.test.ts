import {describe,it,expect} from 'vitest';
import {conversationMetrics,inPeriod,pipelineMetrics,phoneKey,type CommercialMessage} from './commercialMetrics';
import type {PipelineCard,Stage} from './pipelines';
const stage=(id:string,name:string,outcome:Stage['outcome']):Stage=>({id,name,outcome,pipeline_id:'p',position:0,color:'#ffffff'});
const card=(stage_id:string,value:number):PipelineCard=>({id:crypto.randomUUID(),pipeline_id:'p',stage_id,value,client_id:null,title:'Lead',phone:'',notes:'',contact_status:'novo',meeting_at:null,created_at:'2026-11-10T12:00:00Z',updated_at:'2026-11-10T12:00:00Z'});
const msg=(phone_key:string,direction:CommercialMessage['direction'],created_at:string,status=direction==='entrada'?'recebido':'enviado'):CommercialMessage=>({id:crypto.randomUUID(),user_id:'u',phone_key,direction,status,created_at});
describe('commercial metrics',()=>{
 it('uses configured stage outcomes, not display names, and exact card values',()=>{
  const stages=[stage('a','Conversando','in_progress'),stage('b','Contrato assinado','won'),stage('c','Arquivado','lost')];
  const m=pipelineMetrics([card('a',100),card('b',250),card('b',50),card('c',400)],stages);
  expect(m).toMatchObject({total:4,value:800,won:2,lost:1,revenue:300,conversion:50});expect(m.stages.map(s=>s.count)).toEqual([1,2,1]);
 });
 it('returns zero totals and keeps dynamic names for an empty pipeline',()=>{const m=pipelineMetrics([],[stage('a','Minha etapa','in_progress')]);expect(m.total).toBe(0);expect(m.conversion).toBe(0);expect(m.stages[0].name).toBe('Minha etapa')});
 it('deduplicates conversations, excludes failed sends, and counts waiting after the last actual message',()=>{
  const messages=[msg('a','entrada','2026-11-01T12:00:00Z'),msg('a','saida','2026-11-01T12:01:00Z'),msg('a','entrada','2026-11-02T12:00:00Z'),msg('b','entrada','2026-11-02T12:00:00Z'),msg('b','saida','2026-11-02T12:05:00Z','erro'),msg('c','entrada','2026-10-30T12:00:00Z'),msg('c','saida','2026-11-03T12:00:00Z')];
  const m=conversationMetrics(messages,'2026-11-01','2026-11-30');expect(m.started).toBe(2);expect(m.waiting.sort()).toEqual(['a','b']);expect(m.received).toBe(3);expect(m.sent).toBe(2);expect(m.medianResponse).toBe(60);expect(m.responseCount).toBe(1);
 });
 it('does not mark a conversation waiting if a reply arrived outside the selected period',()=>{expect(conversationMetrics([msg('a','entrada','2026-11-02T12:00:00Z'),msg('a','saida','2026-12-02T12:00:00Z')],'2026-11-01','2026-11-30').waiting).toEqual([])});
 it('includes the full final day and normalizes Brazilian phones consistently',()=>{expect(inPeriod('2026-11-11T23:59:59','2026-11-11','2026-11-11')).toBe(true);expect(inPeriod('2026-11-12T00:00:00','2026-11-11','2026-11-11')).toBe(false);expect(phoneKey('+55 (31) 98765-4321')).toBe(phoneKey('(31) 8765-4321'))});
});
