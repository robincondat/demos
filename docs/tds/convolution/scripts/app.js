import { createChart } from "./chart.js?v=20261022-pointer1";
import { createConvolutionInspector } from "./convolution-inspector.js?v=20261022-pointer1";
import { decodeWav, makeSignal, palette, signalName } from "./signals.js?v=20261019-help1";
import { parseEquation, parsePiecewise, renderFormula, renameSignal } from "./equations.js?v=20261019-help1";
import { createEquationEditor } from "./equation-editor.js?v=20261019-help1";
const byId=id=>document.getElementById(id);
const slots=['input','impulse'];
const elements={signalTemplate:byId('signalTemplate'),signalError:byId('signalError')};
const charts=Object.fromEntries([...slots,'output'].map(slot=>[slot,createChart({stage:byId(slot+'Stage'),canvas:byId(slot+'Chart'),tooltip:byId(slot+'Tooltip'),xLabel:slot==='impulse'?'τ (s)':'Temps (s)',yLabel:()=> 'Amplitude',onPointerTime:slot!=='input'?time=>{charts.output.setCursor(time);charts.impulse.setCursor(time);if(time!==null)inspector.hoverTime(time);}:undefined})]));
const inspector=createConvolutionInspector({chart:charts.impulse,stage:byId('impulseStage')});
charts.output.onViewChange(view=>charts.impulse.setView(view));
charts.impulse.onViewChange(view=>charts.output.setView(view));
const worker=new Worker('./scripts/scientific-worker.js?v=20261022-pointer1');
let signals=[],updateTimer=null,requestId=0,pythonReady=false;
const importsInProgress={input:0,impulse:0},busy={input:false,impulse:false};
const mode=()=>document.querySelector('input[name="mode"]:checked').value;
const numeric=input=>input.value.trim()!==''&&Number.isFinite(Number(input.value))?Number(input.value):NaN;
const schedule=()=>{clearTimeout(updateTimer);++requestId;clearOutput();updateTimer=setTimeout(update,80);};
const equationEditor=createEquationEditor({signals:()=>signals,onSave(signal){renderSignals(signal.id);schedule();}});
function refreshActions(){for(const slot of slots){const filled=signals.some(signal=>signal.slot===slot);byId(slot+'Actions').hidden=filled;document.querySelectorAll('[data-create="'+slot+'"], [data-load="'+slot+'"]').forEach(button=>button.disabled=filled||busy[slot]);}}
function clearOutput(){inspector.clear();charts.output.setData([]);byId('outputEmpty').hidden=false;byId('outputEmpty').textContent='Définissez les deux signaux pour calculer leur convolution.';}
function clearResults(){for(const slot of slots){charts[slot].setData([]);byId(slot+'Empty').hidden=false;}clearOutput();}
function renderSignalFormula(card, signal, index) {
  const formula = card.querySelector("[data-equation-formula]");
  formula.hidden = !signal.equationLatex || signal.definition === "wav";
  if (formula.hidden) return;
  try {
    const parsed = signal.equationMode === "cases" ? parsePiecewise(signal.equationCases, signal.equationOtherwise, signals.slice(0, index)) : parseEquation(signal.expression, signals.slice(0, index));
    signal.equationLatex = parsed.latex;
  } catch { /* Conserver l'affichage précédent si une référence a été supprimée. */ }
  renderFormula(formula, signal.equationLatex);
}
function bindField(card, signal, field) {
  card.querySelectorAll(`[data-field="${field}"]`).forEach((input) => {
    if (input.type === "checkbox") input.checked = Boolean(signal[field]); else input.value = signal[field] ?? "";
    input.addEventListener("input", () => {
      if (field === "name") {
        try { renameSignal(signals, signal, input.value); input.setCustomValidity(""); }
        catch (error) { input.setCustomValidity(error.message); return; }
        const name = signalName(signal);
        card.querySelector("[data-summary-code]").textContent = name;
        card.querySelector("[data-summary-code]").title = name;
        const identifier = card.querySelector("[data-card-code]");
        if (identifier) identifier.textContent = name;
        [...document.querySelectorAll(".signal-card")].forEach((item, index) => renderSignalFormula(item, signals[index], index));
      } else signal[field] = input.type === "checkbox" ? input.checked : input.type === "number" ? numeric(input) : input.value;
      card.querySelectorAll(`[data-field="${field}"]`).forEach((peer) => { if (peer !== input) peer.value = input.value; });
      schedule();
    });
    if (field === "name") input.addEventListener("change", () => input.reportValidity());
  });
}
function renderSignals(openId = null) {
  for (const slot of slots) byId(`${slot}List`).replaceChildren();
  signals.forEach((signal, index) => {
    const card = elements.signalTemplate.content.firstElementChild.cloneNode(true); card.dataset.id = signal.id; card.style.setProperty("--signal-color", palette[slots.indexOf(signal.slot)]); card.open = signal.id === openId;
    signal.name ??= signalName(signal);
    const equationButton = card.querySelector("[data-equation-button]");
    equationButton.hidden = signal.definition === "wav";
    equationButton.textContent = signal.expression ? "Modifier l’équation" : "Saisir l’équation";
    equationButton.addEventListener("click", () => equationEditor.open(signal));
    renderSignalFormula(card, signal, index);
    const periodFormula = card.querySelector("[data-period-formula]");
    periodFormula.hidden = !signal.periodic?.enabled || signal.definition === "wav";
    if (!periodFormula.hidden) renderFormula(periodFormula, `${signal.periodic.expression.trim() === "T" ? "\\text{Période }T" : `T=${signal.periodic.latex}\\,\\mathrm{s}`}\\quad ${signal.periodic.origin === "centered" ? "[-T/2,T/2[" : "[0,T["}`);
    const parameters = card.querySelector("[data-equation-parameters]");
    parameters.hidden = signal.definition === "wav" || !Object.keys(signal.variables || {}).length;
    for (const [name, value] of Object.entries(signal.variables || {})) {
      const label = document.createElement("label"), title = document.createElement("span"), input = document.createElement("input");
      label.className = "field"; title.textContent = name;
      input.type = "number"; input.step = "any"; input.value = value ?? ""; input.setAttribute("aria-label", `Paramètre ${name}`);
      input.addEventListener("input", () => { signal.variables[name] = input.value.trim() ? Number(input.value) : null; schedule(); });
      label.append(title, input); parameters.append(label);
    }
    for (const field of ["name","sampleRate","start","end"]) bindField(card, signal, field);
    const name = signalName(signal);
    card.querySelector("[data-summary-code]").textContent = name;
    card.querySelector("[data-summary-code]").title = name;
    const identifier = card.querySelector("[data-card-code]");
    if (identifier) identifier.textContent = name;


    card.querySelector(".remove-signal").addEventListener("click", () => { signals = signals.filter(({ id }) => id !== signal.id); renderSignals(); schedule(); });
    byId(`${signal.slot}List`).append(card);
  });
  refreshActions();
}

const descriptions={
 full:'Convolution complète : N + M − 1 échantillons. Tous les recouvrements sont conservés, avec un prolongement par zéro aux extrémités.',
 same:'Partie centrale de la convolution complète : max(N, M) échantillons, comme np.convolve. Les effets de bord restent présents.',
 valid:'Uniquement les recouvrements complets du signal le plus court dans le plus long : |N − M| + 1 échantillons, sans contribution du prolongement par zéro.'
};
function updateMode(){byId('modeDescription').textContent=descriptions[mode()]+' N et M désignent les nombres d’échantillons des deux signaux.';}
function update(){
 elements.signalError.textContent='';
 if(!signals.length){clearResults();return;}
 if(!pythonReady)return;
 try{
  for(const signal of signals){
   for(const field of ['sampleRate','start','end'])if(!Number.isFinite(signal[field]))throw Error(signalName(signal)+' : saisissez une valeur valide pour '+({sampleRate:'la fréquence d’échantillonnage',start:'le début',end:'la fin'}[field])+'.');
   for(const [name,value] of Object.entries(signal.variables||{}))if(value===null||!Number.isFinite(value))throw Error(signalName(signal)+' : saisissez une valeur pour '+name+'.');
  }
  byId('engineStatus').textContent='Calcul en cours…';
  worker.postMessage({type:'compute',id:++requestId,payload:{signals,mode:mode(),normalize:byId('normalizeConvolution').checked}});
 }catch(error){clearResults();elements.signalError.textContent=error.message;byId('engineStatus').textContent='';}
}
function display(result){
 const sources=slots.flatMap((slot,index)=>{const data=result.signals.find(item=>item.slot===slot),signal=signals.find(item=>item.slot===slot);return data?[{x:data.times,y:data.values,label:signalName(signal),color:palette[index],width:1.7}]:[];});
 charts.input.setData(sources);byId('inputEmpty').hidden=sources.length>0;
 const data=result.convolution;
 charts.output.setData(data?[{x:data.times,y:data.values,label:'Convolution',color:palette[2],width:1.7}]:[]);
 byId('outputEmpty').hidden=Boolean(data);byId('outputEmpty').textContent=result.convolutionError||'Définissez les deux signaux pour calculer leur convolution.';
 elements.signalError.textContent=result.convolutionError||'';
 inspector.setResult(result,signals.find(signal=>signal.slot==='input')?.sampleRate);
 if(data){const shared=[data.times[0],data.times[data.times.length-1]];if(shared[1]===shared[0])shared[1]+=1/signals.find(signal=>signal.slot==='input').sampleRate;inspector.setDomain(shared);charts.output.setDomain(shared);charts.impulse.setDomain(shared);}
}
worker.addEventListener('message',({data})=>{
 if(data.type==='ready'){pythonReady=true;byId('engineStatus').textContent='';update();}
 else if(data.type==='error'&&(data.id==null||data.id===requestId)){clearResults();elements.signalError.textContent=data.message;byId('engineStatus').textContent='';}
 else if(data.type==='result'&&data.id===requestId){display(data.result);byId('engineStatus').textContent='';}
});
worker.addEventListener('error',()=>{clearResults();elements.signalError.textContent='Le moteur de calcul n’a pas pu démarrer. Rechargez la page.';byId('engineStatus').textContent='';});
function addSignal(slot,overrides={}){
 if(signals.some(signal=>signal.slot===slot))return;
 const signal=makeSignal(signals.map(signal=>signal.code),{name:slot==='input'?'A':'B',slot,...overrides});
 const original=signal.name;let suffix=2;while(signals.some(item=>signalName(item)===signal.name))signal.name=original+'_'+suffix++;
 signals.push(signal);signals.sort((a,b)=>slots.indexOf(a.slot)-slots.indexOf(b.slot));renderSignals(signal.id);schedule();
}
for(const slot of slots){
 document.querySelector('[data-create="'+slot+'"]').addEventListener('click',()=>{if(!busy[slot]){byId(slot+'Error').textContent='';addSignal(slot);}});
 document.querySelector('[data-load="'+slot+'"]').addEventListener('click',()=>byId(slot+'Wav').click());
 byId(slot+'Wav').addEventListener('change',async()=>{
  const [file]=byId(slot+'Wav').files;if(!file||signals.some(signal=>signal.slot===slot)||busy[slot])return;
  const version=++importsInProgress[slot];busy[slot]=true;refreshActions();byId(slot+'Error').textContent='Décodage du fichier WAV…';
  try{const decoded=await decodeWav(file);if(version!==importsInProgress[slot])return;if(!(decoded.duration>0))throw Error('Le fichier WAV ne contient aucun échantillon.');addSignal(slot,{...decoded,name:decoded.wavName.replace(/\.wav$/i,''),definition:'wav',start:0,end:decoded.duration});byId(slot+'Error').textContent='';}
  catch(error){if(version===importsInProgress[slot])byId(slot+'Error').textContent='Impossible de lire ce fichier WAV : '+error.message;}
  finally{if(version===importsInProgress[slot]){busy[slot]=false;byId(slot+'Wav').value='';refreshActions();}}
 });
}
document.querySelectorAll('input[name="mode"]').forEach(input=>input.addEventListener('change',()=>{updateMode();schedule();}));
byId('normalizeConvolution').addEventListener('change',schedule);
byId('resetButton').addEventListener('click',()=>{
 clearTimeout(updateTimer);++requestId;equationEditor.close();signals=[];
 byId('normalizeConvolution').checked=false;
 for(const slot of slots){++importsInProgress[slot];busy[slot]=false;byId(slot+'Wav').value='';byId(slot+'Error').textContent='';}
 document.querySelector('input[name="mode"][value="full"]').checked=true;updateMode();renderSignals();clearResults();elements.signalError.textContent='';if(pythonReady)byId('engineStatus').textContent='';
});
updateMode();renderSignals();clearResults();
