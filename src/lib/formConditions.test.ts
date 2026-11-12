import {describe,it,expect} from 'vitest';import {visibleFormFields,formDefinitionError} from './formConditions';import {validateAnswers} from '../../supabase/functions/_shared/agency-validation';
const fields=[{id:'want',label:'Precisa de design?',type:'select',required:true,options:['Sim','Não']},{id:'budget',label:'Orçamento',type:'number',required:true,condition:{fieldId:'want',operator:'equals' as const,value:'Sim'}},{id:'details',label:'Detalhes',type:'text',required:true,condition:{fieldId:'budget',operator:'filled' as const}}];
describe('conditional forms',()=>{
 it('shows only matching branches and hides dependent descendants',()=>{expect(visibleFormFields(fields,{want:'Não',budget:'500'}).map(f=>f.id)).toEqual(['want']);expect(visibleFormFields(fields,{want:'Sim',budget:'500'}).map(f=>f.id)).toEqual(['want','budget','details'])});
 it('requires only visible fields and validates select options server-side',()=>{expect(validateAnswers(fields,{want:'Não'})).toBeNull();expect(validateAnswers(fields,{want:'Sim'})).toContain('Orçamento');expect(validateAnswers(fields,{want:'Talvez'})).toContain('Opção inválida');expect(validateAnswers(fields,{want:'Sim',budget:'500',details:'Logo'})).toBeNull()});
 it('rejects forward references and cycles',()=>{expect(formDefinitionError([...fields].reverse())).toBeTruthy();expect(formDefinitionError(fields)).toBeNull()});
});
