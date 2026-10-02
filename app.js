
const MONTHS=["01","02","03","04","05","06","07","08","09","10","11","12"];
const MONTH_NAMES={"01":"Enero","02":"Febrero","03":"Marzo","04":"Abril","05":"Mayo","06":"Junio","07":"Julio","08":"Agosto","09":"Septiembre","10":"Octubre","11":"Noviembre","12":"Diciembre"};
let DATA=[], META={}, INDEX={}, charts={};

const sum=a=>a.reduce((x,r)=>x+(+r.n||0),0);
const uniq=(arr)=>[...new Set(arr.filter(x=>x!==null&&x!==undefined&&String(x).trim()!==""))].sort((a,b)=>String(a).localeCompare(String(b),"es"));
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

function fill(id,vals,all="Todos"){
  const el=document.getElementById(id), current=el.value;
  el.innerHTML=`<option value="">${all}</option>`+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if(vals.includes(current)) el.value=current;
}
function monthFill(id, def){
  const el=document.getElementById(id);
  el.innerHTML=MONTHS.map(m=>`<option value="${m}">${MONTH_NAMES[m]}</option>`).join("");
  el.value=def;
}
function group(rows,key){const m={}; rows.forEach(r=>m[r[key]]=(m[r[key]]||0)+(+r.n||0)); return m}
function top(obj,n=15){return Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n)}
function chart(id,type,labels,values,label){
  if(charts[id]) charts[id].destroy();
  charts[id]=new Chart(document.getElementById(id),{
    type,data:{labels,datasets:[{label,data:values,borderWidth:1.5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:type==="doughnut"||type==="pie"}},scales:(type==="doughnut"||type==="pie")?{}:{y:{beginAtZero:true}}}
  });
}
function filters(){
  return {
    year:document.getElementById("f_year").value,
    from:document.getElementById("f_from").value,
    to:document.getElementById("f_to").value,
    eess:document.getElementById("f_eess").value,
    tipo_prof:document.getElementById("f_tipo_prof").value,
    prof:document.getElementById("f_prof").value,
    servicio:document.getElementById("f_servicio").value,
    fua:document.getElementById("f_fua").value,
    sexo:document.getElementById("f_sexo").value,
    edad:document.getElementById("f_edad").value,
    lugar:document.getElementById("f_lugar").value,
    tipo_at:document.getElementById("f_tipo_at").value,
  }
}
function filtered(){
  const f=filters();
  return DATA.filter(r=>
    (!f.year||r.year===f.year)&&
    (!f.from||r.month>=f.from)&&(!f.to||r.month<=f.to)&&
    (!f.eess||r.eess===f.eess)&&(!f.tipo_prof||r.tipo_prof===f.tipo_prof)&&
    (!f.prof||r.prof===f.prof)&&(!f.servicio||r.servicio===f.servicio)&&
    (!f.fua||r.fua===f.fua)&&(!f.sexo||r.sexo===f.sexo)&&
    (!f.edad||r.edad===f.edad)&&(!f.lugar||r.lugar===f.lugar)&&
    (!f.tipo_at||r.tipo_at===f.tipo_at)
  );
}
function render(){
  const rows=filtered(), total=sum(rows);
  document.getElementById("k_total").textContent=total.toLocaleString("es-PE");
  document.getElementById("k_prof").textContent=uniq(rows.map(r=>r.prof)).length;
  document.getElementById("k_eess").textContent=uniq(rows.map(r=>r.eess)).length;
  const days=new Set(rows.map(r=>r.date).filter(Boolean)).size;
  document.getElementById("k_daily").textContent=days?Math.round(total/days):0;
  const obs=sum(rows.filter(r=>String(r.fua).toUpperCase().includes("OBSERV")));
  document.getElementById("k_obs").textContent=total?`${(obs*100/total).toFixed(1)}%`:"0%";

  const byM=group(rows,"period"), months=Object.keys(byM).sort();
  let vari="—", cls="";
  if(months.length>=2){const a=byM[months.at(-2)],b=byM[months.at(-1)]; if(a){const v=(b-a)*100/a;vari=`${v>=0?"▲":"▼"} ${Math.abs(v).toFixed(1)}%`;cls=v>=0?"good":"bad"}}
  const kv=document.getElementById("k_var"); kv.textContent=vari; kv.className=cls;

  chart("c_month","line",months,months.map(m=>byM[m]),"Atenciones");
  let t=top(group(rows,"eess"),15); chart("c_eess","bar",t.map(x=>x[0]),t.map(x=>x[1]),"Atenciones");
  t=top(group(rows,"prof"),15); chart("c_prof","bar",t.map(x=>x[0]),t.map(x=>x[1]),"Atenciones");
  t=top(group(rows,"servicio"),12); chart("c_service","bar",t.map(x=>x[0]),t.map(x=>x[1]),"Atenciones");
  t=top(group(rows,"fua"),12); chart("c_fua","doughnut",t.map(x=>x[0]),t.map(x=>x[1]),"FUA");
  t=top(group(rows,"edad"),12); chart("c_age","doughnut",t.map(x=>x[0]),t.map(x=>x[1]),"Grupo etario");
  t=top(group(rows,"lugar"),12); chart("c_place","doughnut",t.map(x=>x[0]),t.map(x=>x[1]),"Lugar");

  const combo={}; rows.forEach(r=>{const k=[r.prof,r.tipo_prof,r.eess].join("|||");combo[k]=(combo[k]||0)+(+r.n||0)});
  const arr=Object.entries(combo).sort((a,b)=>b[1]-a[1]).slice(0,50);
  document.getElementById("tbl_prof").innerHTML=arr.map(([k,n])=>{
    const [p,tp,e]=k.split("|||"); return `<tr><td>${esc(p)}</td><td>${esc(tp)}</td><td>${esc(e)}</td><td>${n.toLocaleString("es-PE")}</td><td>${total?(n*100/total).toFixed(1):0}%</td></tr>`
  }).join("");
}

async function loadData(){
  INDEX=await fetch("data/index.json",{cache:"no-store"}).then(r=>r.json());
  META=await fetch("data/metadata.json",{cache:"no-store"}).then(r=>r.json());
  document.getElementById("updated").innerHTML=`<b>Actualizado:</b> ${esc(META.updated_at||"—")}<br><small>${esc(META.files||0)} archivos procesados · ${esc(META.chunk_count||0)} bloques</small>`;

  const files=(INDEX.chunks||[]).map(x=>x.file);
  const chunks=await Promise.all(files.map(f=>fetch("data/"+f,{cache:"no-store"}).then(r=>r.json())));
  DATA=chunks.flat();
}

async function init(){
  await loadData();
  fill("f_year",uniq(DATA.map(r=>r.year)));
  const periods=uniq(DATA.map(r=>r.period)).sort(), first=periods[0]?.slice(5,7)||"01", last=periods.at(-1)?.slice(5,7)||"12";
  monthFill("f_from",first); monthFill("f_to",last);
  ["eess","tipo_prof","prof","servicio","fua","sexo","edad","lugar","tipo_at"].forEach(k=>fill("f_"+k,uniq(DATA.map(r=>r[k]))));
  document.getElementById("apply").onclick=render;
  document.getElementById("clear").onclick=()=>location.reload();
  render();
}

init().catch(e=>{
  document.body.innerHTML=`<pre style="padding:30px;color:#b00">No se pudieron cargar los JSON.\n${esc(e.message)}\n\nEjecuta GENERAR_JSON.bat y sube index.json, metadata.json y todos los chunk_XXX.json.</pre>`;
});
