export interface ConditionalField {id:string;label:string;type:string;required:boolean;options?:string[];condition?:{fieldId:string;operator:'equals'|'not_equals'|'contains'|'filled'|'not_filled';value?:string}}
const normalize=(value:unknown)=>typeof value==='string'?value.trim().toLocaleLowerCase('pt-BR'):'';
export function visibleFormFields<T extends ConditionalField>(fields:T[],answers:Record<string,unknown>):T[]{
 const visible=new Set<string>();return fields.filter(field=>{
  const c=field.condition;if(!c){visible.add(field.id);return true;}
  if(!visible.has(c.fieldId))return false;
  const answer=normalize(answers[c.fieldId]),expected=normalize(c.value);
  const show=c.operator==='equals'?answer===expected:c.operator==='not_equals'?!!answer&&answer!==expected:c.operator==='contains'?!!expected&&answer.includes(expected):c.operator==='filled'?!!answer:c.operator==='not_filled'?!answer:false;
  if(show)visible.add(field.id);return show;
 });
}
export function formDefinitionError(fields:ConditionalField[]):string|null{
 const seen=new Set<string>();for(const f of fields){
  if(!f.id||seen.has(f.id)||!f.label.trim())return 'Preencha o nome dos campos sem repetir identificadores.';
  if(f.type==='select'&&(!f.options?.length||f.options.some(o=>!o.trim())||new Set(f.options).size!==f.options.length))return `Informe opções diferentes para ${f.label}.`;
  const c=f.condition;if(c){if(!seen.has(c.fieldId))return `A condição de “${f.label}” deve usar um campo anterior.`;
   if(!['equals','not_equals','contains','filled','not_filled'].includes(c.operator))return 'Condição inválida.';
   if(['equals','not_equals','contains'].includes(c.operator)&&!c.value?.trim())return `Informe o valor da condição de “${f.label}”.`;
  }seen.add(f.id);
 }return null;
}
