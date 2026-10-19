import { CATALOG, catalogEntry, contextualCall } from "./function-catalog.js?v=20261019-help1";
import { referenceName, referenceText } from "./equations.js?v=20261019-help1";

const fold = text => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const element = (tag, text, className) => {
  const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node;
};
export function createEquationHelp({ dialog, input, previous, insert }) {
  const $=id=>document.getElementById(id), panel=$("functionCatalog"), context=$("functionContext"), toggle=$("toggleFunctionCatalog");
  function close(focus=false) { panel.hidden=true;toggle.setAttribute("aria-expanded","false");if(focus)toggle.focus(); }
  function renderCatalog() {
    const query=fold($("catalogSearch").value), category=$("catalogCategory").value;
    const entries=CATALOG.filter(entry=>(!category||entry.category===category)&&fold([entry.name,entry.title,entry.description,...entry.aliases,...entry.variants.flatMap(v=>[v.signature,...v.args.map(a=>a.description)])].join(' ')).includes(query));
    $("catalogResults").replaceChildren(...entries.map(entry=>{
      const card=element('details',undefined,'catalog-entry'),summary=element('summary');
      summary.append(element('strong',entry.title),element('code',entry.variants[0].signature));card.append(summary);
      const body=element('div',undefined,'catalog-entry-body');body.append(element('p',entry.description));
      if(entry.aliases.length)body.append(element('p',`Autres écritures : ${entry.aliases.join(', ')}`,'catalog-aliases'));
      for(const v of entry.variants){
        const block=element('div',undefined,'catalog-variant'),header=element('div',undefined,'catalog-variant-heading'),button=element('button','Insérer','secondary-button');button.type='button';button.setAttribute('aria-label',`Insérer ${v.signature}`);
        button.addEventListener('click',()=>{close();insert(v.insert);refresh();});header.append(element('code',v.signature),button);block.append(header);
        if(v.args.length){const dl=element('dl');v.args.forEach(arg=>{dl.append(element('dt',arg.name),element('dd',arg.description));});block.append(dl);}body.append(block);
      }
      const example=element('p',undefined,'catalog-example');example.append(document.createTextNode('Exemple : '),element('code',entry.example));body.append(example);card.append(body);
      card.open=Boolean(query);return card;
    }));
    $('catalogEmpty').hidden=entries.length!==0;
  }
  const categories=[...new Set(CATALOG.map(entry=>entry.category))];
  categories.forEach(category=>{const option=element('option',category);option.value=category;$('catalogCategory').append(option);});
  $('catalogSearch').addEventListener('input',renderCatalog);$('catalogCategory').addEventListener('change',renderCatalog);
  toggle.addEventListener('click',()=>{
    if(!panel.hidden){close(true);return;}
    panel.hidden=false;toggle.setAttribute('aria-expanded','true');context.hidden=true;renderCatalog();$('catalogSearch').focus();
  });
  $('closeFunctionCatalog').addEventListener('click',()=>close(true));
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();close(true);}});
  dialog.addEventListener('close',()=>{close();context.hidden=true;});

  function refresh() {
    const field=input();context.hidden=true;
    if(!dialog.open||!panel.hidden||!field?.isConnected||document.activeElement!==field)return;
    const call=contextualCall(field.value,field.selectionStart??field.value.length);if(!call)return;
    const raw=call.name.startsWith('`')?call.name.slice(1,-1).replace(/\\(.)/gs,'$1'):call.name;
    const signal=previous().find(signal=>referenceName(signal)===raw&&referenceText(signal)===call.name);
    const entry=signal?{description:`Réévalue le signal « ${referenceName(signal)} » au temps demandé. Il vaut 0 hors de son intervalle.`,variants:[{signature:`${referenceText(signal)}(temps)`,args:[{name:'temps',description:'Expression temporelle : t-d pour un retard, t+d pour une avance, a*t pour un changement d’échelle.'}]}]}:catalogEntry(call.name);
    if(!entry)return;
    const normalized=fold(call.name);
    const v=normalized==='%'?entry.variants.at(-1):normalized==='ln'?entry.variants[0]:entry.variants.find(v=>v.args.length>=call.count)||entry.variants.at(-1);
    const signatureText=call.argument!==null&&!signal?v.signature.replace(/^[\p{L}_][\p{L}\p{N}_]*(?=\()/u,call.name):v.signature;
    const signature=element('code',undefined,'context-signature');
    const open=signatureText.indexOf('('),closeParen=signatureText.lastIndexOf(')');
    if(open>=0&&closeParen>open){
      signature.append(document.createTextNode(signatureText.slice(0,open+1)));
      v.args.forEach((arg,index)=>{
        if(index)signature.append(document.createTextNode(', '));
        const active=call.argument!==null&&(index===call.argument||(index===v.args.length-1&&call.argument>=index));
        signature.append(element(active?'strong':'span',arg.name,active?'context-current-argument':undefined));
      });signature.append(document.createTextNode(')'));
    }else signature.textContent=signatureText;
    const description=call.argument!==null&&v.args.length?v.args[Math.min(call.argument,v.args.length-1)].description:entry.description;
    context.replaceChildren(signature,element('span',description,'context-description'));context.hidden=false;
  }
  dialog.addEventListener('input',refresh);dialog.addEventListener('keyup',refresh);dialog.addEventListener('click',refresh);dialog.addEventListener('focusin',refresh);
  document.addEventListener('selectionchange',refresh);
  return { refresh, reset(){close();context.hidden=true;} };
}
