import {describe,it,expect} from 'vitest';import {taskDeadline,subtaskProgress,taskMonthDays,groupTasks} from './tasks';import type {Task} from './tasks';
describe('task workspace',()=>{
 it('flags only open deadlines as overdue',()=>{expect(taskDeadline({status:'pendente',end_date:'2026-11-11'},'2026-11-12')).toBe('atrasada');expect(taskDeadline({status:'concluída',end_date:'2026-11-11'},'2026-11-12')).toBe('encerrada');expect(taskDeadline({status:'pendente',end_date:null},'2026-11-12')).toBe('sem_data')});
 it('keeps progress independent from parent status and handles empty checklists',()=>{expect(subtaskProgress([])).toEqual({done:0,total:0,percent:0});expect(subtaskProgress([{completed:true},{completed:false},{completed:false}])).toEqual({done:1,total:3,percent:33})});
 it('builds a Monday-first calendar across year boundaries',()=>{const days=taskMonthDays('2027-01');expect(days).toHaveLength(42);expect(days[0]).toBe('2026-12-28');expect(days[41]).toBe('2027-02-07')});
 it('groups by assignee without mutating original tasks',()=>{const tasks=[{id:'a',status:'pendente',assignee_name:''},{id:'b',status:'em andamento',assignee_name:'Ana'}] as Task[];expect(groupTasks(tasks,'responsavel',[]).map(g=>[g.label,g.tasks.length])).toEqual([['Ana',1],['Sem responsável',1]]);expect(tasks[0].id).toBe('a')});
});
