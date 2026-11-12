import {describe,it,expect} from 'vitest';import {taskWeek,closedInPeriod} from './taskViews';
describe('task closure history',()=>{
 const now=new Date('2026-11-12T15:00:00Z');
 it('uses Monday through Sunday and São Paulo dates',()=>{expect(taskWeek(now)).toEqual({start:'2026-11-09',end:'2026-11-15'});expect(closedInPeriod({closed_at:'2026-11-09T01:00:00Z'},'semana','','',now)).toBe(false);expect(closedInPeriod({closed_at:'2026-11-12T14:00:00Z'},'semana','','',now)).toBe(true)});
 it('retains undated legacy tasks only in explicit history views',()=>{expect(closedInPeriod({closed_at:null},'semana','','',now)).toBe(false);expect(closedInPeriod({closed_at:null},'sem_data','','',now)).toBe(true);expect(closedInPeriod({closed_at:null},'todos','','',now)).toBe(true)});
 it('filters previous week and custom dates by completion, not deadlines',()=>{expect(closedInPeriod({closed_at:'2026-11-05T15:00:00Z'},'anterior','','',now)).toBe(true);expect(closedInPeriod({closed_at:'2026-10-22T15:00:00Z'},'custom','2026-10-20','2026-10-25',now)).toBe(true);expect(closedInPeriod({closed_at:'2026-10-22T15:00:00Z'},'mes','','',now)).toBe(false)});
});
