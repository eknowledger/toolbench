const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/chart-BLvi6FxK.js","assets/plot-common-Bk07QE3q.js","assets/heatmap-CM6boTOp.js","assets/pie-BkGlPl_v.js","assets/radar-HdRo6RHj.js","assets/treemap-EG8Z8MvL.js","assets/venn-ojve08Y8.js"])))=>i.map(i=>d[i]);
(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const i of s)if(i.type==="childList")for(const a of i.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&n(a)}).observe(document,{childList:!0,subtree:!0});function e(s){const i={};return s.integrity&&(i.integrity=s.integrity),s.referrerPolicy&&(i.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?i.credentials="include":s.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function n(s){if(s.ep)return;s.ep=!0;const i=e(s);fetch(s.href,i)}})();const jt="modulepreload",Vt=function(r){return"/"+r},ut={},w=function(t,e,n){let s=Promise.resolve();if(e&&e.length>0){let l=function(h){return Promise.all(h.map(c=>Promise.resolve(c).then(f=>({status:"fulfilled",value:f}),f=>({status:"rejected",reason:f}))))};document.getElementsByTagName("link");const a=document.querySelector("meta[property=csp-nonce]"),d=a?.nonce||a?.getAttribute("nonce");s=l(e.map(h=>{if(h=Vt(h),h in ut)return;ut[h]=!0;const c=h.endsWith(".css"),f=c?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${h}"]${f}`))return;const m=document.createElement("link");if(m.rel=c?"stylesheet":jt,c||(m.as="script"),m.crossOrigin="",m.href=h,d&&m.setAttribute("nonce",d),document.head.appendChild(m),c)return new Promise((u,b)=>{m.addEventListener("load",u),m.addEventListener("error",()=>b(new Error(`Unable to preload CSS for ${h}`)))})}))}function i(a){const d=new Event("vite:preloadError",{cancelable:!0});if(d.payload=a,window.dispatchEvent(d),!d.defaultPrevented)throw a}return s.then(a=>{for(const d of a||[])d.status==="rejected"&&i(d.reason);return t().catch(i)})},qt=new Set(["http:","https:","mailto:"]),Bt="https://toolbench.invalid/",Wt=/[\u0000- \u007f-\u009f]/;function Ht(r){if(typeof r!="string"||r.length===0||Wt.test(r))return!1;let t;try{t=new URL(r,Bt)}catch{return!1}return qt.has(t.protocol)}const Ut=9,We=[1,2,3,4,5,6,7,8,9];function Kt(r){return(r.inputs??[]).filter(t=>t.type==="secret"?t.share===!0:t.share!==!1).map(t=>t.id)}const Jt=[{from:1,manifest:r=>r,output:r=>r},{from:2,manifest:r=>r,output:r=>r},{from:3,manifest:r=>r,output:r=>r},{from:4,manifest:r=>r,output:r=>r},{from:5,manifest:r=>r,output:r=>r},{from:6,manifest:r=>r,output:r=>r},{from:7,manifest:r=>r,output:r=>r},{from:8,manifest:r=>r,output:r=>r}];class Et extends Error{constructor(t){super(t),this.name="VersionError"}}function Gt(r,t,e){const n=[];for(let s=r;s<e;s++){const i=t.find(a=>a.from===s);if(!i)throw new Et(`No migration from contract version ${s} to ${s+1}. This is a bug in @toolbench/sdk: the current version is ${e}, so every version below it needs a migration step.`);n.push(i)}return n}function Yt(r,t,e=Jt,n=Ut){if(t>n)throw new Et(`Cannot downgrade an output from version ${t} to ${n}.`);let s=r;for(const i of Gt(t,e,n))s=i.output(s);return s}function Qt(r){const t={};for(const e of r.manifest.inputs)t[e.id]=e.type==="secret"?"":structuredClone(e.default);return t}function o(r,t,...e){const n=document.createElement(r);return _t(n,t,e),n}const Zt="http://www.w3.org/2000/svg";function He(r,t,...e){const n=document.createElementNS(Zt,r);return _t(n,t,e),n}function _t(r,t,e){for(const[n,s]of Object.entries(t??{}))s===void 0||s===!1||r.setAttribute(n,s===!0?"":String(s));for(const n of e.flat())n==null||n===!1||r.append(typeof n=="string"?document.createTextNode(n):n)}function A(r,...t){r.replaceChildren();for(const e of t.flat())e==null||e===!1||r.append(typeof e=="string"?document.createTextNode(e):e)}const Xt=["series","heatmap","pie","radar","treemap","venn","graph"],$t={},te={series:async()=>{const{renderChart:r}=await w(async()=>{const{renderChart:t}=await import("./chart-BLvi6FxK.js");return{renderChart:t}},__vite__mapDeps([0,1]));return(t,e)=>r(t.chart,e)},heatmap:async()=>{const{renderHeatmap:r}=await w(async()=>{const{renderHeatmap:t}=await import("./heatmap-CM6boTOp.js");return{renderHeatmap:t}},__vite__mapDeps([2,1]));return(t,e)=>r(t.heatmap,e)},pie:async()=>{const{renderPie:r}=await w(async()=>{const{renderPie:t}=await import("./pie-BkGlPl_v.js");return{renderPie:t}},__vite__mapDeps([3,1]));return(t,e)=>r(t.pie,e)},radar:async()=>{const{renderRadar:r}=await w(async()=>{const{renderRadar:t}=await import("./radar-HdRo6RHj.js");return{renderRadar:t}},__vite__mapDeps([4,1]));return(t,e)=>r(t.radar,e)},treemap:async()=>{const{renderTreemap:r}=await w(async()=>{const{renderTreemap:t}=await import("./treemap-EG8Z8MvL.js");return{renderTreemap:t}},__vite__mapDeps([5,1]));return(t,e)=>r(t.treemap,e)},venn:async()=>{const{renderVenn:r}=await w(async()=>{const{renderVenn:t}=await import("./venn-ojve08Y8.js");return{renderVenn:t}},__vite__mapDeps([6,1]));return(t,e)=>r(t.venn,e)},graph:async()=>{const{renderGraph:r}=await w(async()=>{const{renderGraph:t}=await import("./graph-DM7jgoya.js").then(e=>e.u);return{renderGraph:t}},[]);return(t,e)=>r(t.graph,e)}};let F,ee;function At(r,t,e){const n=o("span",{class:"tb-copy-note","aria-hidden":"true"}),s=o("button",{type:"button",class:"tb-copy",disabled:!0},r),i=()=>F?.wireCopy(s,n,t,e);return F?i():(ee??=w(()=>import("./copy-DXMXrrUf.js"),[]).then(a=>{F=a})).then(i,()=>{n.textContent="Copy is unavailable: select the text instead"}),o("div",{class:"tb-copy-bar"},n,s)}class Z extends Error{kind;load;constructor(t="series",e){super(`the ${t} renderer has not loaded yet`),this.name="ChartRendererMissing",this.kind=t,this.load=e??(()=>V([t]))}}const j=r=>Xt.includes(r);async function V(r){await Promise.all(r.filter(j).map(async t=>{$t[t]??=await te[t]()}))}async function Tt(r){const t=r.kind==="group"?r.parts:[r];await V(t.map(e=>e.kind)),await Promise.all(t.map(async e=>e.kind==="group"?Tt(e):e.kind==="graph"?(await w(async()=>{const{prepareGraph:n}=await import("./graph-DM7jgoya.js").then(s=>s.u);return{prepareGraph:n}},[])).prepareGraph(e.graph):void 0))}function re(r,t,e){const n=$t[r];if(n===void 0)throw new Z(r);return n(t,e)}const ht="tb-rest";function ne(r,t){const e=`result${r===1?"":"s"}`;return t?`Hide ${r} ${e}`:`Show ${r} more ${e}`}function $(r,t={}){const e=se(r,t);return e.setAttribute("data-kind",r.kind),r.role&&e.setAttribute("data-role",r.role),r.id&&e.setAttribute("data-part",r.id),e}function se(r,t){switch(r.kind){case"fields":return ie(r.fields,t);case"text":return ae(r.text,r.mono===!0);case"code":return de(r.lang,r.source,t);case"table":return le(r,t);case"series":case"heatmap":case"pie":case"radar":case"treemap":case"venn":case"graph":return re(r.kind,r,t);case"group":{const e=t.cardParts===void 0?void 0:Math.max(1,t.cardParts);if(e!==void 0&&r.parts.length>e){const n=r.parts.slice(0,e),s=r.parts.slice(e);if(t.more!=="expand")return o("div",{class:"tb-group"},...n.map(d=>$(d,t)),o("p",{class:"tb-more"},`+${s.length} more result${s.length===1?"":"s"} on the full tool`));const i=t.expanded===!0,a=i?{...t,compact:!1,cardChart:(t.cardChart??t.compact)===!0}:t;return o("div",{class:"tb-group"},...n.map(d=>$(d,a)),o("button",{type:"button",class:"tb-disclose","aria-expanded":String(i),"aria-controls":ht,"data-hidden":String(s.length)},ne(s.length,i)),o("div",{class:"tb-rest",id:ht,...i?{}:{hidden:!0}},...s.map(d=>$(d,a))))}return o("div",{class:"tb-group"},...r.parts.map(n=>$(n,t)))}case"bytes":return ue(r,t);case"error":return he(r);default:return Rt(r.kind)}}function Rt(r){return o("div",{class:"tb-unknown",role:"status"},o("strong",{},"This tool needs a newer version of the runtime."),o("p",{},`It returned a "${r}" result, which this page does not know how to draw.`))}function ie(r,t){const e=t.compact?t.cardFields??4:r.length,n=r.slice(0,e),s=r.length-n.length,i=new Map;for(const d of n){const l=d.group??"";i.set(l,[...i.get(l)??[],d])}const a=[];for(const[d,l]of i){const h=l.map(c=>o("div",{class:"tb-field","data-tone":c.tone??"normal","data-role":c.role||void 0},o("dt",{},c.label),o("dd",{class:c.mono===!1?void 0:"tb-mono"},o("span",{class:"tb-value"},c.value),c.note?o("span",{class:"tb-note"},c.note):null)));a.push(d?o("section",{class:"tb-field-group"},o("h4",{},d),o("dl",{class:"tb-fields"},...h)):o("dl",{class:"tb-fields"},...h))}return s>0&&t.more!=="expand"&&a.push(o("p",{class:"tb-more"},`+${s} more field${s===1?"":"s"}`)),o("div",{class:"tb-out-fields"},...a)}function ae(r,t){return o("div",{class:"tb-out-text"},o(t?"pre":"p",{class:t?"tb-mono":""},r))}function oe(r){return/^[\w+#.-]+$/.test(r)?`language-${r}`:void 0}function de(r,t,e){const n=e.highlight;let s=t;if(n)try{const a=n(t,r);a instanceof Node&&(s=a)}catch{s=t}const i=o("pre",{},o("code",{class:oe(r)},s));return o("div",{class:"tb-out-code","data-lang":r},i,e.copy===!1?null:At("Copy code",()=>t,()=>i))}const bt=r=>r==="prose"||r==="none"?r:void 0;function le(r,t){const e=o("tr",{},...r.columns.map(a=>o("th",{scope:"col","data-align":a.align??"start","data-wrap":bt(a.wrap),"data-row-header":a.rowHeader||void 0,class:a.mono?"tb-mono":""},a.label))),n=r.link,s=r.rows.map((a,d)=>o("tr",n&&n.keys[d]!==null&&n.keys[d]!==void 0?{"data-key":String(n.keys[d])}:{},...a.map((l,h)=>{const c=r.columns[h],f=typeof l=="object"&&l!==null?l:{text:String(l)},m=("mono"in f?f.mono:void 0)??c?.mono??!1;return o(c?.rowHeader?"th":"td",{scope:c?.rowHeader?"row":void 0,"data-align":c?.align??(typeof l=="number"?"end":"start"),"data-tone":("tone"in f?f.tone:void 0)??"normal","data-label":c?.label||void 0,"data-wrap":bt(("wrap"in f?f.wrap:void 0)??c?.wrap),class:m?"tb-mono":""},f.text)}))),i=o("table",n?{"data-link-chart":n.chart}:{},r.caption&&!t.compact?o("caption",{},r.caption):null,o("thead",{},e),o("tbody",{},...s));if(n){const a=(d,l)=>{l?.getRootNode?.()?.querySelector?.(`[data-chart-id="${CSS.escape(n.chart)}"]`)?.dispatchEvent(new CustomEvent("tb-point",{detail:{key:d}}))};i.addEventListener("pointerover",d=>{const l=d.target.closest?.("tr[data-key]");l&&a(l.getAttribute("data-key"),i)}),i.addEventListener("pointerleave",()=>a(null,i))}return o("div",{class:"tb-out-table"},i,t.copy===!1?null:At("Copy table",()=>F.tableToTsv(r),()=>i))}const I=16,ce=4;function ue(r,t){const{bytes:e,highlight:n=[],offset:s=0}=r,i=new Map;for(const u of n)for(let b=u.at;b<u.at+u.len&&b<e.length;b++)i.set(b,u);const a=new Map;let d=0;for(const u of n)a.set(u,u.tone?{"data-tone":u.tone}:{"data-tone":"normal","data-series":String(d++%6+1)});const l=Math.ceil(e.length/I),h=t.compact?Math.min(l,ce):l,c=(u,b)=>u.toString(16).padStart(b,"0"),f=[];for(let u=0;u<h;u++){const b=u*I,p=e.slice(b,b+I);f.push(o("div",{class:"tb-bytes-row"},o("span",{class:"tb-bytes-offset"},c(s+b,8)),o("span",{class:"tb-bytes-hex"},...p.map((g,v)=>{const x=i.get(b+v);return o("span",{class:"tb-byte",...x?{...a.get(x),title:x.label}:{}},c(g,2))})),o("span",{class:"tb-bytes-ascii"},...p.map((g,v)=>{const x=i.get(b+v);return o("span",{class:"tb-byte",...x?a.get(x):{}},g>=32&&g<=126?String.fromCharCode(g):".")}))))}const m=l-h;return o("figure",{class:"tb-out-bytes"},r.caption?o("figcaption",{class:"tb-bytes-caption"},r.caption):null,o("div",{class:"tb-bytes-grid"},o("div",{class:"tb-bytes-grid-inner"},...f)),m>0&&t.more!=="expand"?o("p",{class:"tb-more"},`+${m*I} more bytes on the full tool`):null,n.length>0?o("ul",{class:"tb-bytes-legend"},...n.map(u=>o("li",a.get(u),o("span",{class:"tb-bytes-swatch"}),`${u.label}: ${u.len} byte${u.len===1?"":"s"} at 0x${c(s+u.at,4)}`))):null)}function he(r){const t=r.at!==void 0?o("span",{class:"tb-at"},`at ${r.at}${r.len?`–${r.at+r.len}`:""}`):null;return o("div",{class:"tb-out-error",role:"alert","data-input":r.input??""},o("span",{class:"tb-error-icon","aria-hidden":"true"},"!"),o("span",{class:"tb-error-message"},...r.message.split(/(\d{4}-\d\d-\d\d(?:T\d\d:\d\d)?)/).map((e,n)=>n%2?o("span",{class:"tb-nowrap"},e):e)),t)}class Ct extends Error{ms;constructor(t){super(`The tool did not finish within ${t}ms and was stopped.`),this.name="ToolTimeoutError",this.ms=t}}class M extends Error{toolStack;constructor(t,e){super(t),this.name="ToolCrashError",this.toolStack=e}}class J extends Error{constructor(t){super(t),this.name="WorkerUnavailableError"}}class be{#s;#n;#d=0;#t;constructor(t={}){this.#s=t}async run(t,e,n={}){this.cancel();const s=++this.#d,i=t.manifest.runtime.thread==="worker"&&this.#s.workerFactory!==void 0;return t.manifest.runtime.thread==="worker"&&!i&&console.warn(`[toolbench] "${t.manifest.id}" asked for a worker but no workerFactory was configured; running on the main thread. See the README section on worker mode.`),i?this.#p(t,e,n,s):this.#e(t,e,n,s)}cancel(){const t=this.#t;t&&(this.#t=void 0,t.timer&&clearTimeout(t.timer),t.controller.abort(new DOMException("superseded","AbortError")),this.#n&&this.#m({type:"abort",seq:t.seq}),t.reject(new DOMException("superseded","AbortError")))}dispose(){this.cancel(),this.#n?.terminate(),this.#n=void 0}async#e(t,e,n,s){const i=new AbortController,a=this.#x(s,n),d=new Promise((h,c)=>{this.#t={seq:s,controller:i,resolve:h,reject:c,hooks:n,timer:void 0}}),l=t.tool;if(!l)return this.#l(s,new Error(`"${t.manifest.id}" has no module on this thread. Pass the result of source.load(id), or configure a workerFactory so it runs in a worker.`)),d;try{const h=await l.run(e,{signal:i.signal,progress:(c,f)=>{i.signal.aborted||a(c,f)}});if(this.#t?.seq!==s)return d;this.#i(s,Yt(h,t.manifest.sdk))}catch(h){this.#t?.seq===s&&this.#l(s,fe(h,t.manifest.id))}return d}async#p(t,e,n,s){const i=this.#k(),a=new AbortController,d=this.#x(s,n),l=t.manifest.timeoutMs??5e3,h=new Promise((c,f)=>{const m=setTimeout(()=>{this.#n?.terminate(),this.#n=void 0,this.#l(s,new Ct(l))},l);this.#t={seq:s,controller:a,resolve:c,reject:f,hooks:{onProgress:d},timer:m}});return i.postMessage({type:"run",seq:s,id:t.manifest.id,input:e,sdk:t.manifest.sdk}),h}#x(t,e){return pe(e.onProgress,()=>this.#t?.seq===t)}#k(){if(this.#n)return this.#n;const t=this.#s.workerFactory;if(!t)throw new J("No workerFactory was configured.");const e=t();return e.addEventListener("message",n=>this.#A(n.data)),e.addEventListener("error",n=>{const s=this.#t?.seq;this.#n?.terminate(),this.#n=void 0,s!==void 0&&this.#l(s,new J(`The tool's worker failed to start: ${n.message||"unknown error"}`))}),this.#n=e,e}#A(t){if(t.type==="ready")return;const e=this.#t;if(!(!e||e.seq!==t.seq))switch(t.type){case"progress":e.hooks.onProgress?.(t.fraction,t.partial);return;case"result":this.#i(t.seq,t.output);return;case"crash":this.#l(t.seq,new M(t.message,t.stack));return}}#m(t){this.#n?.postMessage(t)}#i(t,e){const n=this.#t;!n||n.seq!==t||(this.#t=void 0,n.timer&&clearTimeout(n.timer),n.resolve(e))}#l(t,e){const n=this.#t;!n||n.seq!==t||(this.#t=void 0,n.timer&&clearTimeout(n.timer),n.reject(e))}}function Ot(r){return r instanceof DOMException&&r.name==="AbortError"}function fe(r,t){return Ot(r)?r:r instanceof Error?new M(`"${t}" threw ${r.name}: ${r.message}`,r.stack):new M(`"${t}" threw ${String(r)}`)}function pe(r,t){if(!r)return()=>{};let e,n=!1;const s=()=>{if(n=!1,!e||!t())return;const{fraction:i,partial:a}=e;e=void 0,r(i,a)};return(i,a)=>{e=a===void 0?{fraction:i}:{fraction:i,partial:a},!n&&(n=!0,typeof requestAnimationFrame=="function"?requestAnimationFrame(s):setTimeout(s,16))}}class me extends Error{constructor(t,e){super(`No tool with id "${t}". ${e.length>0?`Known ids: ${e.join(", ")}.`:"The registry is empty."}`),this.name="ToolNotFoundError"}}class ge{#s;#n;#d;constructor(t){this.#s=Array.isArray(t)?t:Object.values(t)}#t(){return this.#d??=w(()=>import("./validation-C_w5oIYF.js"),[]).then(t=>this.#n=t.validateEntries(this.#s),t=>{throw this.#d=void 0,t})}async list(){return[...(await this.#t()).values()].map(t=>t.manifest)}async load(t){const e=await this.#t(),n=e.get(t);if(!n)throw new me(t,[...e.keys()]);const s=await n.load();if(typeof s?.default?.run!="function")throw new Error(`"${t}" does not default-export a tool. A tool module looks like: export default { run(input, ctx) { … } }`);return{manifest:n.manifest,tool:s.default}}manifest(t){return this.#n?.get(t)?.manifest}}const ft=`
@layer toolbench {
:host {
  --tb-bg:        #ffffff;
  --tb-fg:        #1a1c22;
  --tb-muted:     #5c6270;
  --tb-faint:     #767d8c;
  --tb-border:    #e2e5ea;
  --tb-surface:   #f7f8fa;
  --tb-accent:    #8a5a00;
  --tb-accent-bg: #fff6e6;
  --tb-bad:       #a3242c;
  --tb-warn:      #8a5a00;
  --tb-good:      #1c6b3c;
  --tb-bg:        light-dark(#ffffff, #16171d);
  --tb-fg:        light-dark(#1a1c22, #e7e9ee);
  --tb-muted:     light-dark(#5c6270, #9aa1b1);
  --tb-faint:     light-dark(#767d8c, #7c8494);
  --tb-border:    light-dark(#e2e5ea, #2b2e38);
  --tb-surface:   light-dark(#f7f8fa, #1c1e26);
  --tb-accent:    light-dark(#8a5a00, #f0b040);
  --tb-accent-bg: light-dark(#fff6e6, #2a2113);
  --tb-bad:       light-dark(#a3242c, #f08b8b);
  --tb-warn:      light-dark(#8a5a00, #e5b567);
  --tb-good:      light-dark(#1c6b3c, #74c98d);
  --tb-radius:    10px;
  --tb-font:      system-ui, -apple-system, "Segoe UI", sans-serif;
  --tb-mono:      ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  --tb-gap:       0.75rem;
  --tb-mark-fg:   var(--tb-warn);
  --tb-mark-bg:   var(--tb-accent-bg);
  --tb-accent-text: var(--tb-accent);
  --tb-accent-ink: var(--tb-bg);
  --tb-input-bg: var(--tb-surface);
  --tb-input-border: var(--tb-border);
  --tb-input-fg: var(--tb-fg);
  --tb-desc-fg: var(--tb-faint);
  --tb-s1: #8a5a00; --tb-s2: #5b3fa8; --tb-s3: #0f6e6e;
  --tb-s4: #1f5aa8; --tb-s5: #a02a5e; --tb-s6: #2d6b32;
  --tb-s1: light-dark(#8a5a00, #e0b877);
  --tb-s2: light-dark(#5b3fa8, #c4a5f0);
  --tb-s3: light-dark(#0f6e6e, #7fd1d1);
  --tb-s4: light-dark(#1f5aa8, #8ec4f0);
  --tb-s5: light-dark(#a02a5e, #f0a5c0);
  --tb-s6: light-dark(#2d6b32, #8fd6a8);
  --tb-s7: #7a4e2d; --tb-s8: #4a5568;
  --tb-s7: light-dark(#7a4e2d, #e3b48f);
  --tb-s8: light-dark(#4a5568, #b9c3d1);
  display: block;
  color: var(--tb-fg);
  font-family: var(--tb-font);
  font-size: 15px;
  line-height: 1.5;
  container-type: inline-size;
}
:host([hidden]) { display: none; }
* { box-sizing: border-box; }
.tb {
  background: var(--tb-bg);
  border: 1px solid var(--tb-border);
  border-radius: var(--tb-radius);
  overflow: hidden;
  container-type: inline-size;
}
:host([mode="embed"]) .tb { border-radius: var(--tb-radius); background: var(--tb-surface); }
.tb-head { padding: 0.875rem 1rem 0; }
.tb-name { margin: 0; font-size: 1.05rem; font-weight: 650; letter-spacing: -0.01em; }
.tb-name a {
  color: inherit;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding-block: 2px;
}
.tb-name a:hover, .tb-name a:focus-visible { color: var(--tb-accent-text); text-decoration: underline; }
.tb-blurb { margin: 0.25rem 0 0; color: var(--tb-muted); font-size: 0.9rem; }
.tb-title { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem 0.55rem; }
.tb-mark {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  color: var(--tb-mark-fg);
  background: var(--tb-mark-bg);
  border: 1px solid var(--tb-mark-fg);
}
.tb-retired { margin: 0; color: var(--tb-muted); font-size: 0.9rem; }
.tb-body { padding: 0.875rem 1rem 1rem; display: grid; gap: var(--tb-gap); }
.tb-form { display: grid; gap: 0.625rem; margin: 0; border: 0; padding: 0; }
.tb-field-row { display: grid; gap: 0.25rem; }
.tb-label { font-size: 0.82rem; font-weight: 600; color: var(--tb-muted); }
.tb-unit { font-weight: 400; color: var(--tb-faint); }
.tb-desc { margin: 0; font-size: 0.78rem; color: var(--tb-desc-fg); }
:is(div.tb-desc, .tb-details-body) > * { margin: 0; }
:is(div.tb-desc, .tb-details-body) > * + * { margin-top: 0.35rem; }
:is(.tb-desc, .tb-details-body) ul { padding-inline-start: 1.1rem; }
:is(.tb-desc, .tb-details-body) li + li { margin-top: 0.15rem; }
:is(.tb-desc, .tb-details-body) code { white-space: nowrap; font-family: var(--tb-mono); font-size: 0.95em; padding: 0 0.2em; border-radius: 4px; background: var(--tb-surface); border: 1px solid var(--tb-border); color: var(--tb-fg); }
:is(.tb-desc, .tb-details-body) strong { font-weight: 650; color: var(--tb-muted); }
:is(.tb-desc, .tb-details-body) [data-tone] { font-weight: 600; }
:is(.tb-desc, .tb-details-body) [data-tone="good"] { color: var(--tb-good); }
:is(.tb-desc, .tb-details-body) [data-tone="warn"] { color: var(--tb-warn); }
:is(.tb-desc, .tb-details-body) [data-tone="bad"] { color: var(--tb-bad); }
:is(.tb-desc, .tb-details-body) [data-tone="accent"] { color: var(--tb-accent-text); }
:is(.tb-desc, .tb-details-body) [data-tone="muted"] { color: var(--tb-faint); font-weight: inherit; }
.tb-details { font-size: 0.78rem; color: var(--tb-desc-fg); }
.tb-details > summary { display: inline-flex; align-items: center; gap: 0.35rem; min-height: 24px; cursor: pointer; color: var(--tb-muted); list-style: none; border-radius: 6px; padding-inline-end: 0.25rem; }
.tb-details > summary::-webkit-details-marker { display: none; }
.tb-details > summary::before { content: ""; border-left: 4px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform 120ms ease; }
.tb-details[open] > summary::before { transform: rotate(90deg); }
.tb-details > summary:hover { color: var(--tb-fg); }
.tb-details > summary:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-details-body { margin: 0.25rem 0 0.15rem; padding: 0.375rem 0 0.375rem 0.625rem; border-inline-start: 2px solid var(--tb-border); }
@media (prefers-reduced-motion: reduce) { .tb-details > summary::before { transition: none; } }
.tb-input, .tb-textarea, .tb-select {
  width: 100%;
  font: inherit;
  font-size: 0.9rem;
  color: var(--tb-input-fg);
  background: var(--tb-input-bg);
  border: 1px solid var(--tb-input-border);
  border-radius: 8px;
  padding: 0.4375rem 0.5625rem;
}
.tb-select { contain: paint; }
.tb-textarea { font-family: var(--tb-mono); font-size: 0.82rem; resize: vertical; min-height: 4.5rem; }
.tb-input:not([type="text"]) { font-family: var(--tb-mono); }
.tb-input:focus-visible, .tb-textarea:focus-visible, .tb-select:focus-visible, .tb-run:focus-visible, .tb-reset:focus-visible, .tb-share:focus-visible, .tb-facade-hint:focus-visible, .tb-sample:focus-visible, .tb-output:focus-visible {
  outline: 2px solid var(--tb-accent);
  outline-offset: 2px;
}
.tb-input[aria-invalid="true"], .tb-textarea[aria-invalid="true"], .tb-select[aria-invalid="true"] { border-color: var(--tb-bad); }
.tb-toggle-row { display: flex; align-items: center; gap: 0.5rem; }
.tb-checkbox { accent-color: var(--tb-accent); }
.tb-field-msg { display: flex; gap: 0.375rem; align-items: baseline; margin: 0; font-size: 0.78rem; color: var(--tb-bad); overflow-wrap: anywhere; }
.tb-field-msg::before { content: "!"; flex: none; width: 0.95rem; height: 0.95rem; border-radius: 50%; background: var(--tb-bad); color: var(--tb-bg); font-size: 0.66rem; font-weight: 700; line-height: 0.95rem; text-align: center; transform: translateY(0.1em); }
.tb-count { margin: 0; font-size: 0.78rem; color: var(--tb-desc-fg); font-variant-numeric: tabular-nums; }
.tb-slider-row { display: flex; align-items: center; gap: 0.75rem; }
.tb-slider-row .tb-input { width: 7rem; flex: none; }
.tb-slider { flex: 1; min-width: 0; min-height: 24px; accent-color: var(--tb-accent); }
.tb-slider:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-actions { display: flex; align-items: center; gap: 0.625rem; flex-wrap: wrap; }
.tb-run, .tb-reset {
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--tb-accent-ink);
  background: var(--tb-accent);
  border: 0;
  border-radius: 8px;
  padding: 0.4375rem 0.875rem;
  cursor: pointer;
}
.tb-run[disabled] { opacity: 0.5; cursor: default; }
.tb-run[data-attention] {
  background: color-mix(in oklab, var(--tb-accent) 70%, black);
  background: light-dark(
    color-mix(in oklab, var(--tb-accent) 70%, black),
    color-mix(in oklab, var(--tb-accent) 62%, white)
  );
}
.tb-reset { color: var(--tb-fg); background: none; border: 1px solid var(--tb-border); padding: calc(0.4375rem - 1px) 0.875rem; }
.tb-reset:hover { border-color: var(--tb-muted); }
.tb-samples { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.tb-samples-label { font-size: 0.82rem; font-weight: 600; color: var(--tb-muted); }
.tb-sample {
  font: inherit;
  font-size: 0.78rem;
  padding: 0.2rem 0.55rem;
  color: var(--tb-fg);
  background: var(--tb-surface);
  border: 1px solid var(--tb-border);
  border-radius: 999px;
  cursor: pointer;
}
.tb-sample:hover { border-color: var(--tb-accent); color: var(--tb-accent-text); }
.tb-progress[hidden] { display: none; }
.tb-progress {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--tb-border);
  overflow: hidden;
  min-width: 4rem;
}
.tb-progress > i { display: block; height: 100%; background: var(--tb-accent); transition: width 0.12s linear; }
@media (prefers-reduced-motion: reduce) {
  .tb-progress > i { transition: none; }
}
.tb-status {
  margin: 0;
  font-size: 0.78rem;
  color: var(--tb-faint);
  font-family: var(--tb-mono);
  min-height: 1.2em;
  overflow-wrap: anywhere;
}
.tb-status:empty { display: none; }
.tb-output { display: grid; gap: 0.75rem; }
.tb-group, .tb-body > *, .tb-output > * { min-width: 0; }
.tb-output[data-state="running"] { opacity: 0.65; }
.tb-output[data-stale] { opacity: 0.45; }
.tb-fields, .tb-field-group dl { margin: 0; display: grid; gap: 0.375rem; }
.tb-field { display: grid; grid-template-columns: minmax(6rem, 34%) 1fr; gap: 0.75rem; align-items: baseline; }
.tb-field dt { color: var(--tb-muted); font-size: 0.82rem; }
.tb-field dd { margin: 0; font-size: 0.85rem; word-break: break-word; }
.tb-field[data-tone="bad"] dd .tb-value { color: var(--tb-bad); }
.tb-field[data-tone="warn"] dd .tb-value { color: var(--tb-warn); }
.tb-field[data-tone="good"] dd .tb-value { color: var(--tb-good); }
.tb-field[data-tone="muted"] dd .tb-value { color: var(--tb-faint); }
.tb-note { color: var(--tb-faint); margin-left: 0.5ch; }
.tb-field-group h4 { margin: 0.5rem 0 0.25rem; font-size: 0.75rem; text-transform: none; color: var(--tb-faint); font-weight: 600; }
.tb-more { margin: 0; font-size: 0.78rem; color: var(--tb-faint); }
.tb-disclose {
  display: inline-flex; align-items: center; gap: 0.4rem;
  min-height: 24px; padding: 0.15rem 0.5rem 0.15rem 0.35rem;
  font: inherit; font-size: 0.78rem; color: var(--tb-faint);
  background: none; border: 1px solid transparent; border-radius: 999px; cursor: pointer;
}
.tb-disclose::before {
  content: ""; width: 0; height: 0;
  border-left: 4px solid currentColor;
  border-top: 4px solid transparent; border-bottom: 4px solid transparent;
  transition: transform 120ms ease;
}
.tb-disclose[aria-expanded="true"]::before { transform: rotate(90deg); }
.tb-disclose:hover { color: var(--tb-fg); border-color: var(--tb-border); }
.tb-disclose:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .tb-disclose::before { transition: none; } }
.tb-out-text p { margin: 0; overflow-wrap: anywhere; }
.tb-mono, .tb-out-text pre, .tb-out-code pre { font-family: var(--tb-mono); font-size: 0.82rem; }
.tb-out-text pre, .tb-out-code pre {
  margin: 0; padding: 0.625rem 0.75rem; overflow-x: auto;
  background: var(--tb-surface); border: 1px solid var(--tb-border); border-radius: 8px;
}
.tb-out-code code { font: inherit; }
.tb-copy-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem;
  margin-top: 0.375rem; position: sticky; inset-inline-start: 0;
}
.tb-copy {
  min-height: 24px; padding: 0.15rem 0.6rem;
  font: inherit; font-size: 0.78rem; color: var(--tb-muted);
  background: var(--tb-bg); border: 1px solid var(--tb-border); border-radius: 999px; cursor: pointer;
}
.tb-out-table .tb-copy-bar { padding: 0 4px 4px; }
.tb-copy:hover:enabled { color: var(--tb-fg); border-color: var(--tb-muted); }
.tb-copy:disabled { opacity: 0.6; cursor: default; }
.tb-copy:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-copy-note { font-size: 0.78rem; color: var(--tb-muted); }
.tb-out-table{overflow-x:auto;--tb-scroll-bg:var(--tb-bg);--s:color-mix(in oklab,var(--tb-fg) 28%,transparent);background:linear-gradient(90deg,var(--tb-scroll-bg) 40%,#0000) left/1.5rem 100% no-repeat local,linear-gradient(270deg,var(--tb-scroll-bg) 40%,#0000) right/1.5rem 100% no-repeat local,radial-gradient(farthest-side at 0,var(--s),#0000) left/.875rem 100% no-repeat,radial-gradient(farthest-side at 100%,var(--s),#0000) right/.875rem 100% no-repeat}
:host([mode="embed"]) .tb-out-table{--tb-scroll-bg:var(--tb-surface)}
.tb-out-table table, .tb-chart-data table { border-collapse: collapse; width: 100%; font-size: 0.84rem; }
.tb-out-table caption, .tb-chart-data caption { text-align: start; color: var(--tb-faint); font-size: 0.78rem; padding-bottom: 0.375rem; }
.tb-out-table th, .tb-out-table td, .tb-chart-data th, .tb-chart-data td {
  text-align: start; padding: 0.3125rem 0.5rem; border-bottom: 1px solid var(--tb-border);
}
.tb-out-table th { color: var(--tb-muted); font-size: 0.78rem; font-weight: 600; }
.tb-out-table td[data-align="end"], .tb-out-table th[data-align="end"] { text-align: end; }
.tb-out-table th[scope=row]{color:var(--tb-fg);font-size:inherit}
.tb-out-table th[scope=row][data-align=end]{text-align:end}
.tb-out-table tr > [data-tone="bad"] { color: var(--tb-bad); }
.tb-out-table tr.tb-hot > * { background: var(--tb-accent-bg); }
.tb-out-table tr.tb-hot > :first-child { box-shadow: inset 3px 0 0 var(--tb-accent); }
.tb-out-table tr > [data-tone="warn"] { color: var(--tb-warn); }
.tb-out-table tr > [data-tone="good"] { color: var(--tb-good); }
.tb-out-table tr > [data-tone="muted"] { color: var(--tb-faint); }
@container (max-width:34rem){
.tb-out-table table:has([data-wrap]){width:max-content;min-width:100%}
.tb-out-table table:has([data-wrap]) thead th,.tb-out-table [data-wrap=none]{white-space:nowrap}
.tb-out-table [data-wrap=prose]{min-width:20ch;width:26ch}
.tb-out-table table:has([data-wrap]) caption{position:sticky;inset-inline-start:0;max-width:calc(100cqi - 2rem)}
.tb-out-table :where(tbody th[scope=row],thead th[data-row-header]){position:sticky;inset-inline-start:0;z-index:1;background:var(--tb-scroll-bg);box-shadow:inset -1px 0 0 var(--tb-border)}
}
.tb-out-error {
  display: flex; gap: 0.5rem; align-items: baseline;
  padding: 0.5rem 0.6875rem;
  background: #fdf2f2;
  background: light-dark(#fdf2f2, #2a1a1c);
  border: 1px solid var(--tb-bad);
  border-radius: 8px;
  font-size: 0.86rem;
}
.tb-error-icon {
  flex: 0 0 auto; width: 1.05rem; height: 1.05rem; border-radius: 50%;
  background: var(--tb-bad); color: var(--tb-bg);
  font-size: 0.72rem; font-weight: 700; line-height: 1.05rem; text-align: center;
}
.tb-error-message { min-width: 0; overflow-wrap: anywhere; }
.tb-nowrap { white-space: nowrap; }
.tb-at { color: var(--tb-faint); font-family: var(--tb-mono); font-size: 0.78rem; }
.tb-unknown {
  padding: 0.75rem; border: 1px dashed var(--tb-border); border-radius: 8px;
  background: var(--tb-surface); font-size: 0.86rem;
}
.tb-unknown p { margin: 0.25rem 0 0; color: var(--tb-muted); }
.tb-out-bytes { margin: 0; }
.tb-bytes-caption { color: var(--tb-faint); font-size: 0.78rem; padding-bottom: 0.375rem; }
.tb-bytes-grid {
  font-family: var(--tb-mono); font-size: 0.78rem; line-height: 1.6;
  background: var(--tb-surface); border: 1px solid var(--tb-border); border-radius: 8px;
  padding: 0.5rem 0.625rem; overflow-x: auto;
}
.tb-bytes-grid-inner { display: grid; grid-template-columns: auto auto auto; gap: 0 0.875rem; justify-content: start; }
.tb-bytes-row { display: contents; }
.tb-bytes-offset, .tb-bytes-hex, .tb-bytes-ascii { white-space: pre; }
.tb-bytes-offset { color: var(--tb-faint); }
.tb-bytes-hex .tb-byte + .tb-byte { margin-left: 0.5ch; }
.tb-bytes-ascii { color: var(--tb-muted); }
.tb-byte[data-tone] { border-radius: 2px; }
.tb-byte[data-tone="normal"] { background: var(--tb-accent); color: var(--tb-accent-ink); }
.tb-byte[data-tone="good"]   { background: var(--tb-good); color: var(--tb-bg); }
.tb-byte[data-tone="warn"]   { background: var(--tb-warn); color: var(--tb-bg); }
.tb-byte[data-tone="bad"]    { background: var(--tb-bad); color: var(--tb-bg); }
.tb-out-bytes [data-series="1"] { --_tb-range: var(--tb-s1); }
.tb-out-bytes [data-series="2"] { --_tb-range: var(--tb-s2); }
.tb-out-bytes [data-series="3"] { --_tb-range: var(--tb-s3); }
.tb-out-bytes [data-series="4"] { --_tb-range: var(--tb-s4); }
.tb-out-bytes [data-series="5"] { --_tb-range: var(--tb-s5); }
.tb-out-bytes [data-series="6"] { --_tb-range: var(--tb-s6); }
.tb-byte[data-series] { background: var(--_tb-range); color: var(--tb-bg); }
.tb-bytes-legend {
  display: flex; flex-wrap: wrap; gap: 0.75rem;
  margin: 0.5rem 0 0; padding: 0; list-style: none;
  font-size: 0.78rem; color: var(--tb-muted);
}
.tb-bytes-legend li { display: flex; align-items: center; gap: 0.375rem; }
.tb-bytes-swatch { width: 0.75rem; height: 0.75rem; border-radius: 2px; background: var(--tb-accent); }
.tb-bytes-legend li[data-tone="good"] .tb-bytes-swatch { background: var(--tb-good); }
.tb-bytes-legend li[data-tone="warn"] .tb-bytes-swatch { background: var(--tb-warn); }
.tb-bytes-legend li[data-tone="bad"]  .tb-bytes-swatch { background: var(--tb-bad); }
.tb-bytes-legend li[data-series] .tb-bytes-swatch { background: var(--_tb-range); }
.tb-facade { cursor: pointer; }
.tb-facade-hint {
  display: inline-flex; align-items: center; gap: 0.375rem;
  font-size: 0.8rem; font-weight: 600; color: var(--tb-accent-text);
}
button.tb-facade-hint {
  font-family: inherit; background: none; border: 0; padding: 0; margin: 0;
  min-height: 24px; cursor: pointer;
  justify-self: start;
}
.tb-facade-hint::before {
  content: ""; width: 0; height: 0;
  border-left: 6px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent;
}
.tb-facade:hover .tb-facade-hint { text-decoration: underline; }
.tb-foot { display: flex; gap: 0.875rem; flex-wrap: wrap; padding: 0 1rem 0.875rem; font-size: 0.8rem; }
.tb-foot a { color: var(--tb-accent-text); text-decoration: none; }
.tb-foot a:hover { text-decoration: underline; }
.tb-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
@container (max-width: 30rem) {
  .tb-field { grid-template-columns: 1fr; gap: 0; }
}
}
`;function ye(r){if("adoptedStyleSheets"in r&&typeof CSSStyleSheet=="function")try{z??=(()=>{const e=new CSSStyleSheet;return e.replaceSync(ft),e})(),Lt(r,z);return}catch{}const t=document.createElement("style");t.textContent=ft,r.append(t)}let z;const W=new WeakSet;function Lt(r,t){W.add(t);const n=r.adoptedStyleSheets.filter(i=>i!==t),s=n.filter(i=>W.has(i));Pt(r,[...t===z?[t,...s]:[...s,t],...n.filter(i=>!W.has(i))])}function Pt(r,t){const e=r.adoptedStyleSheets;(t.length!==e.length||t.some((n,s)=>n!==e[s]))&&(r.adoptedStyleSheets=t)}const H=r=>r===void 0?[]:Array.isArray(r)?[...r]:[r];function ve(r,t){if(r===void 0||typeof r=="string"||Array.isArray(r))return H(r);if(typeof CSSStyleSheet=="function"&&r instanceof CSSStyleSheet)return[r];const e=r;return[...H(e["*"]),...H(e[t])]}const pt=new WeakSet,mt=new Map;function we(r,t){if(z&&r.adoptedStyleSheets?.includes(z)){const e=t.map(n=>{if(typeof n!="string")return n;let s=mt.get(n);return s||(s=new CSSStyleSheet,s.replaceSync(n),mt.set(n,s)),s});for(const n of e)pt.add(n);Pt(r,[...r.adoptedStyleSheets.filter(n=>!pt.has(n)),...e]);return}for(const e of r.querySelectorAll("style[data-tb-host]"))e.remove();for(const e of t){const n=document.createElement("style");n.setAttribute("data-tb-host",""),n.textContent=typeof e=="string"?e:[...e.cssRules].map(s=>s.cssText).join(`
`),r.append(n)}}const gt=new Map;function Ue(r,t,e){const n=()=>`@layer toolbench{${e()}}`;queueMicrotask(()=>{const s=r.getRootNode();if(!(s instanceof ShadowRoot))return;if("adoptedStyleSheets"in s&&typeof CSSStyleSheet=="function")try{let a=gt.get(t);a||(a=new CSSStyleSheet,a.replaceSync(n()),gt.set(t,a)),Lt(s,a);return}catch{}if(s.querySelector(`style[data-tb-sheet="${t}"]`))return;const i=document.createElement("style");i.setAttribute("data-tb-sheet",t),i.textContent=n(),s.append(i)})}const xe=/`([^`]+)`|\*\*([^]+?)\*\*|\{(good|warn|bad|muted|accent)\|([^}]+)\}/g;function q(r){const t=[];let e=0;for(const n of r.matchAll(xe)){const[s,i,a,d,l]=n,h=n.index;h>e&&t.push(r.slice(e,h)),t.push(i?{t:"code",text:i}:a?{t:"strong",kids:q(a)}:{t:"tone",tone:d,kids:q(l)}),e=h+s.length}return e<r.length&&t.push(r.slice(e)),t}function ke(r){const t=[];for(const e of r.split(/\n[ \t]*\n/)){let n=[],s=[];const i=()=>{n.length&&t.push({t:"p",kids:q(n.join(`
`))}),s.length&&t.push({t:"ul",items:s}),n=[],s=[]};for(const a of e.split(`
`))a.startsWith("- ")?(n.length&&i(),s.push(q(a.slice(2)))):a.trim()&&(s.length&&i(),n.push(a));i()}return t}const Se=r=>r.length===1&&r[0].t==="p"&&r[0].kids.every(t=>typeof t=="string");function yt(r,t){const e=ke(r);if(Se(e))return o("p",t,r);const n=a=>typeof a=="string"?a:a.t==="code"?o("code",{},a.text):o(a.t==="strong"?"strong":"span",a.t==="tone"?{"data-tone":a.tone}:{},...a.kids.map(n)),s=a=>a.t==="p"?a.kids.map(n):a.items.map(d=>o("li",{},...d.map(n))),i=e.length===1&&e[0].t==="p"?e[0]:void 0;return i?o("p",t,...s(i)):o("div",t,...e.map(a=>o(a.t,{},...s(a))))}function P(r,t){switch(r.type){case"number":{const e=Number(t);return Number.isFinite(e)?Math.min(r.max,Math.max(r.min,e)):r.default}case"toggle":return!!t;case"select":return r.options.some(e=>e.value===String(t))?String(t):r.default;case"date":return String(t);case"color":return String(t).trim().toLowerCase();case"multiselect":{const e=Array.isArray(t)?r.options.map(s=>s.value).filter(s=>t.includes(s)):[];return Array.isArray(t)&&e.length===t.length&&e.length<=(r.max??1/0)?e:[...r.default]}case"rows":{const e=Array.isArray(t)&&t.length<=r.maxRows?t.map(n=>Ee(r.columns,n)):void 0;return e?.every(Boolean)?e:structuredClone(r.default)}default:{const e=String(t);return r.maxLength!==void 0?e.slice(0,r.maxLength):e}}}function Ee(r,t){const e=Object(t),n={};for(const s of r){const i=e[s.id];if(i==null||typeof i=="object")return;if(s.type==="number"){const a=i===""?Number.NaN:Number(i);if(!Number.isFinite(a))return;n[s.id]=Math.min(s.max,Math.max(s.min,a))}else if(s.type==="toggle"){if(i!==!0&&i!==!1&&i!=="true"&&i!=="false")return;n[s.id]=i===!0||i==="true"}else if(s.type==="select"){if(!s.options.some(a=>a.value===String(i)))return;n[s.id]=String(i)}else n[s.id]=String(i).slice(0,s.maxLength)}return n}function U(r,t,e){const n={...t};for(const s of r){const i=e[s.id];i!==void 0&&(n[s.id]=P(s,i))}return n}function _e(r,t,e){const n={};for(const s of t){const i=`${r}.${s.id}`,a=e.getAll(i),d=a.at(-1);if(s.type==="rows"&&d===void 0){const l=s.columns.map(c=>e.getAll(`${i}.${c.id}`)),h=l[0]?.length??0;if(h===0)continue;n[s.id]=l.every(c=>c.length===h)?Array.from({length:h},(c,f)=>Object.fromEntries(s.columns.map((m,u)=>[m.id,l[u]?.[f]??""]))):"";continue}if(d!==void 0){if(s.type==="rows"){n[s.id]=[];continue}n[s.id]=s.type==="multiselect"?a.filter(Boolean):s.type==="toggle"?d==="true":d}}return n}const $e=400;let y;const vt=new Set;let N,G,Ae,S,O,L,K;const wt=()=>Ae??=w(()=>import("./share-VEM_1xa2.js"),[]).then(r=>{G=r});function Te(r,t="tool-host"){y=r,!(typeof customElements>"u")&&(customElements.get(t)||customElements.define(t,Re))}class Re extends HTMLElement{static observedAttributes=["tool","mode","parts","more","layout","controls","wide","wide-toggle","reset","links","share","share-label","share-position"];#s;#n;#d;#t;#e={};#p={};#x="";#k="";#A=!1;#m=0;#i=!1;#l=Promise.resolve();#g;#S;#y;#E;#v=!1;#h=!1;#a;#o;#j="";#T=!1;#L=!1;#R=new Map;#C=new Map;#b=new Map;#V=new Map;#r={};constructor(){super(),this.#s=this.attachShadow({mode:"open"}),this.#$()}#H=()=>this.#$();set seed(t){this.#a=t,this.#v||this.#_()}set values(t){if(!(t==null||typeof t!="object"||Array.isArray(t))){if(!this.#t){this.#p={...this.#p,...t},this.#i=!0;return}this.#ot(t)}}get values(){return structuredClone(this.#t?this.#e:this.#p)}async run(t={}){await this.#l,this.#t&&(await this.#O(),await this.#w({focusResult:t.focus===!0}))}async reveal(t){if(await this.#l,!this.#t)return!1;await this.#O(),this.#o===void 0&&this.#a===void 0&&await this.#w({focusResult:!1});const e=()=>this.#r.output?.querySelector(`[data-part="${CSS.escape(t)}"]`);let n=e();const s=this.#o??this.#a;if((!n||n.closest("[hidden]"))&&s&&Mt(s,t)){this.#T=!0,this.#L=this.more!=="expand";const i=this.#o===void 0;this.#f(s),i&&(this.#o=void 0),n=e()}return n?(n.hasAttribute("tabindex")||n.setAttribute("tabindex","-1"),n.scrollIntoView({block:"start"}),n.focus({preventScroll:!0}),!0):!1}get mode(){const t=this.getAttribute("mode");return t==="card"||t==="embed"?t:"page"}get cardParts(){const t=Number(this.getAttribute("parts"));return Number.isFinite(t)&&t>=1?Math.floor(t):1}get#P(){return this.mode==="card"?this.cardParts:this.hasAttribute("parts")?this.cardParts:void 0}get more(){return this.getAttribute("more")==="expand"?"expand":"link"}get layout(){return this.getAttribute("layout")==="answer-first"?"answer-first":"default"}get links(){const t=this.getAttribute("links");return t==="none"?"none":t==="page"||this.mode==="card"?"page":"all"}set links(t){this.setAttribute("links",t)}get#q(){return this.mode!=="card"&&this.controls!=="none"&&this.getAttribute("share")!=="none"&&y?.share!=="none"}#Q(t){const e=y?.share;let n;try{n=typeof e=="object"?e.read(t.id):_e(t.id,t.inputs??[],new URLSearchParams(location.search))}catch{n=void 0}const s={},i=Kt(t);for(const a of t.inputs??[]){const d=n?.[a.id];d===void 0||!i.includes(a.id)||(s[a.id]=a.type==="toggle"&&typeof d=="string"?d==="true":d)}return s}get reset(){return this.getAttribute("reset")==="none"?"none":"default"}get controls(){return this.getAttribute("controls")==="none"?"none":"default"}get toolId(){return this.getAttribute("tool")??""}connectedCallback(){if(vt.add(this.#H),!y){this.#D("No tool source configured. Call defineToolHost({ source }) before using <tool-host>.");return}this.#lt(),this.#l=this.#U()}disconnectedCallback(){vt.delete(this.#H),this.#n?.dispose(),this.#n=void 0,this.#d=void 0,this.#g=void 0,this.#S?.disconnect(),this.#S=void 0,this.#y&&clearTimeout(this.#y),this.#E&&clearTimeout(this.#E)}attributeChangedCallback(t,e,n){e===n||!this.isConnected||(t==="tool"?(this.#v=!1,this.#d=void 0,this.#g=void 0,this.#i=!1,this.#o=void 0,this.#j="",this.#T=!1,this.#L=!1,this.#l=this.#U()):this.#_())}async#U(){const t=y?.source;if(t)try{const e=await t.list(),n=e.find(d=>d.id===this.toolId);if(!n){this.#D(`No tool with id "${this.toolId}". Known: ${e.map(d=>d.id).join(", ")||"none"}.`);return}this.#t=n;const s=Qt({manifest:n}),i={...this.#p};this.#p={},this.#i&&Object.assign(i,this.#e),this.#q&&Object.assign(i,this.#Q(n)),this.#e=U(n.inputs,s,i),Object.keys(i).length>0&&(this.#i=!0),this.#I(Object.keys(i)),this.#x=this.#k=JSON.stringify(this.#e),this.#A=this.#i;const a=this.mode!=="card"?n.kinds.filter(j):[];if(a.length>0&&await V(a).catch(()=>{}),this.#a&&await Tt(this.#a).catch(()=>{}),this.#_(),_(n)==="retired"||this.mode==="card")return;this.#Z()}catch(e){this.#D(e instanceof Error?e.message:String(e))}}#Z(){const t=y?.rootMargin??"200% 0px";if(typeof IntersectionObserver!="function"){this.#O();return}this.#S=new IntersectionObserver(e=>{e.some(n=>n.isIntersecting)&&(this.#S?.disconnect(),this.#S=void 0,this.#O())},{rootMargin:t}),this.#S.observe(this)}async#O(){if(this.#g)return this.#g;if(!(this.#d&&this.#n)&&!(!this.#t||!y)&&_(this.#t)!=="retired"){this.#g=this.#X(y);try{await this.#g}finally{this.#d||(this.#g=void 0)}}}async#X(t){this.#v=!0,this.#h=!0,this.#_();try{const e=this.#t?.kinds.filter(j)??[],n=e.length>0?V(e).catch(()=>{}):void 0,s=!N&&this.#t?.inputs.some(c=>c.type==="textarea"&&c.lang&&(t.highlight||c.grammar))?w(()=>import("./paint-Cdy-FSGR.js"),[]).then(c=>{N=c},()=>{}):void 0,i=this.#q?wt().catch(()=>{}):void 0,a=!S&&this.#t?.inputs.some(c=>c.type==="color"||c.type==="secret"||c.type==="select"&&c.control==="segmented")?w(()=>import("./controls-DqsD-aoK.js"),[]).then(c=>{S=c},()=>{}):void 0,d=!L&&this.#t?.inputs.some(c=>c.type==="rows")?w(()=>import("./rows-Cm-uYiZw.js"),[]).then(c=>{L=c},()=>{}):void 0,l=!O&&this.#t?.inputs.some(c=>c.type==="multiselect")?w(()=>import("./choices-DS3EEovM.js"),[]).then(c=>{O=c},()=>{}):void 0,h=K?void 0:w(()=>import("./validation-C_w5oIYF.js"),[]).then(c=>{K=c});this.#d=await this.#tt(t),await h,await n,await s,await i,await a,await l,await d,this.#n=new be(t.workerFactory?{workerFactory:t.workerFactory}:{}),this.#h=!1,this.#_(),this.#t?.autoRun===!0?this.#w({focusResult:!1,quiet:!0}):!this.#i&&this.#a&&this.#c("showing the default result. Press Run to try your own")}catch(e){this.#v=!1,this.#h=!1,this.#J(e)}}async#tt(t){const e=this.#t;return e.runtime.thread==="worker"&&t.workerFactory!==void 0?{manifest:e}:t.source.load(e.id)}#K(){if(this.#t?.autoRun===!0){this.#y&&clearTimeout(this.#y);const t=y?.debounceMs??150;this.#y=setTimeout(()=>{this.#w({focusResult:!1})},t);return}this.#M()}#M(){const t=this.#r.output;if(!t)return;const e=t.children.length>0;this.controls==="none"&&this.mode!=="card"||(t.toggleAttribute("data-stale",e),this.#r.run?.toggleAttribute("data-attention",!0),this.#c(e?"inputs changed. Press Run":""))}async#w(t){const e=this.#d,n=this.#n;if(!e||!n||this.#t&&_(this.#t)==="retired")return;const s=this.values,i=(d,l)=>{t.quiet||this.#B("tool-run",{values:s,ok:d,...l!==void 0?{error:l}:{}})},a=this.#m;this.#i=!1,this.#r.output?.removeAttribute("data-stale"),this.#r.run?.removeAttribute("data-attention"),this.#F(!0),this.#c("running…");try{let d;for(const h of this.#t?.inputs??[]){const c=K?.inputProblem(h,this.#e[h.id]);if(c){d={kind:"error",message:c,input:h.id};break}}const l=d??await n.run(e,this.values,{onProgress:(h,c)=>{this.#Y(h),c&&a===this.#m&&this.#f(c)}});if(a!==this.#m)return;if(this.#F(!1),this.#f(l),l.kind==="error"?this.#c(Q(l,this.mode==="card")):this.#dt(Q(l,this.mode==="card")),l.kind==="error"){const h=this.#t?.inputs.find(f=>f.id===l.input)?.label??"",c=l.row!==void 0?`${h}, row ${l.row+1}`:h;this.#W(l.input,l.message.startsWith(h)?l.message:`${c}: ${l.message}`,l.row)}else this.#W(void 0);t.focusResult&&this.#r.output?.focus(),i(l.kind!=="error",l.kind==="error"?l.message:void 0)}catch(d){if(Ot(d)||a!==this.#m)return;this.#F(!1),i(!1,this.#J(d))}}#J(t){if(!this.#r.output){const n=t instanceof Error?t.message:String(t);return this.#D(n),n}const e=t instanceof Ct||t instanceof J?t.message:t instanceof M?`This tool hit a bug and stopped: ${t.message}`:t instanceof Error?t.message:String(t);return this.#f({kind:"error",message:e}),this.#c(`error: ${e}`),t instanceof M&&t.toolStack&&console.error(t.toolStack),e}#B(t,e){this.dispatchEvent(new CustomEvent(t,{bubbles:!0,composed:!0,detail:e}))}#z(){const t=JSON.stringify(this.#e);this.#et(t),t!==this.#x&&(this.#x=t,this.#B("tool-input",{values:this.values}))}#et(t=JSON.stringify(this.#e)){const e=this.#r.reset;e&&e.hidden!==(t===this.#k)&&(e.hidden=!e.hidden)}#rt(){this.#m++,this.#y&&clearTimeout(this.#y),this.#F(!1),this.#e=JSON.parse(this.#k),this.#N(),this.#i=this.#A,this.#o=void 0,this.#T=this.#L=!1;const t=this.#r.output;t?.removeAttribute("data-stale"),this.#r.run?.removeAttribute("data-attention"),t?.replaceChildren(),this.#W(void 0),this.#a&&(this.#f(this.#a),this.#o=void 0,this.#A&&this.#M()),this.#c("inputs reset to their starting values");const e=this.#R.values().next().value;(e?.querySelector(":checked")??e)?.focus(),this.#z(),this.#B("tool-reset",{values:this.values}),this.#t?.autoRun===!0&&this.#w({focusResult:!1})}#_(){const t=this.#t;if(!t)return;if(this.#nt(t),_(t)==="retired"){this.#st(t);return}const e=this.mode,n=e==="card",s=y?.pageUrl?.(t.id),i=_(t),a=o("div",{class:"tb-body"}),d=o("div",{class:"tb"}),l=this.#v&&!this.#h&&this.#q;l&&!G&&wt().then(()=>this.#_(),()=>{});const h=l?G?.shareBar(this,t,()=>this.#e,y,()=>this.#r.announce):void 0,c=this.getAttribute("share-position"),f=h&&(c==="top"||c==="actions"?c:y?.sharePosition??(e==="page"?"top":"actions"))==="top",m=kt(t,n,s);if(e!=="embed"?d.append(o("div",{class:"tb-head"},f?o("div",{class:"tb-share-top"},m,h):m,e==="page"?o("p",{class:"tb-blurb"},t.blurb):null)):f&&a.append(o("div",{class:"tb-share-top"},h)),!this.#v||this.#h){const k=n&&i==="deprecated",E=this.#a?"Try it":"Open this tool",C=n&&!this.#h&&!k,Ft=C?o("button",{class:"tb-facade-hint",type:"button","aria-label":`${E}: ${t.name}`},E):o("span",{class:"tb-facade-hint"},this.#h?"loading…":E),lt=o("div",{class:"tb-body"},e==="page"?null:o("p",{class:"tb-blurb"},t.blurb),e==="embed"?D(i):null,this.#a?Oe(this.#a,St(this,{compact:n,copy:!1,...this.#P!==void 0?{cardParts:this.#P}:{},...t.cardFields!==void 0?{cardFields:t.cardFields}:{}})):null,k?null:Ft);if(C){const B=o("div",{class:"tb-facade"});B.append(lt),B.addEventListener("click",Dt=>{const ct=Dt.target?.closest?.("a, button, summary, input, select, textarea, label");ct&&!ct.classList.contains("tb-facade-hint")||this.#O()}),d.append(B)}else d.append(lt),k&&s&&d.append(o("div",{class:"tb-foot"},o("a",{href:s},"Open the full tool")));A(this.#s,d),this.#$();return}const u=n?Le(t.inputs):t.inputs,b=o("fieldset",{class:"tb-form"});this.#R.clear(),this.#C.clear(),this.#b.clear(),this.#V.clear();for(const k of u)b.append(this.#it(k));const p=o("button",{class:"tb-run",type:"button"},"Run");p.addEventListener("click",k=>{this.#w({focusResult:k.detail===0})});const g=o("div",{class:"tb-progress","aria-hidden":"true",hidden:!0},o("i",{style:"width:0%"})),v=o("p",{class:"tb-status",role:"status","aria-live":"polite"},this.#j),x=o("p",{class:"tb-announce tb-sr",role:"status","aria-live":"polite"}),T=o("div",{class:"tb-output",tabindex:"-1"});T.addEventListener("click",k=>{const E=k.target?.closest?.(".tb-disclose");if(!(E instanceof HTMLButtonElement)||this.#o===void 0)return;this.#T=E.getAttribute("aria-expanded")!=="true",this.#f(this.#o);const C=T.querySelector(".tb-disclose");C instanceof HTMLButtonElement&&C.focus()}),T.addEventListener("tb-copy",k=>{const{message:E}=k.detail;x.textContent="",setTimeout(()=>x.textContent=E,50)});const R=this.reset==="none"||t.reset===!1?void 0:o("button",{class:"tb-reset",type:"button","aria-label":"Reset inputs to their starting values",hidden:JSON.stringify(this.#e)===this.#k},"Reset");R?.addEventListener("click",()=>this.#rt()),this.#r={run:p,progress:g,status:v,announce:x,output:T,...R?{reset:R}:{}};const X=e==="embed"?D(_(t)):null;X&&a.append(X);const tt=t.samples??[],et=t.autoRun===!0,rt=f?void 0:h,It=et&&!R&&!rt?g:o("div",{class:"tb-actions"},et?null:p,R??null,g,rt??null),nt=!n&&this.controls==="none",Nt=!n&&this.layout==="answer-first",st=nt?[g]:[b,...tt.length>0&&!n?[this.#at(tt)]:[],It],it=nt?[x,T]:[v,x,T];a.append(...Nt?[...it,...st]:[...st,...it]),d.append(a);const at=this.links;at==="all"&&(t.links?.length??0)>0?d.append(o("div",{class:"tb-foot"},...(t.links??[]).map(xt))):at==="page"&&s&&d.append(o("div",{class:"tb-foot"},o("a",{href:s},"Open the full tool"))),A(this.#s,d),this.#$();const ot=this.#o===void 0,dt=this.#o??this.#a;dt&&this.#f(dt),ot&&(this.#o=void 0),this.#i&&ot&&this.#M()}#$(){ye(this.#s),we(this.#s,ve(y?.styles,this.toolId))}#nt(t){const e=_(t);e==="live"?this.removeAttribute("data-status"):this.setAttribute("data-status",e)}#st(t){this.#r={},this.#v=!1,this.#h=!1;const e=this.mode,n=e==="card",s=y?.pageUrl?.(t.id),i=t.links??[],a=o("div",{class:"tb"});e!=="embed"&&a.append(o("div",{class:"tb-head"},kt(t,n,s),e==="page"?o("p",{class:"tb-blurb"},t.blurb):null));const d=i.length>0?"This tool has been retired and no longer runs. The links below are the way onward.":"This tool has been retired and no longer runs.";a.append(o("div",{class:"tb-body"},e==="page"?null:o("p",{class:"tb-blurb"},t.blurb),e==="embed"?D("retired"):null,o("p",{class:"tb-retired",role:"status"},d))),i.length>0&&a.append(o("div",{class:"tb-foot"},...i.map(xt))),A(this.#s,a),this.#$()}#it(t){const e=`in-${t.id}`,n=[],s=t.type==="select"&&t.control==="segmented"&&S!==void 0||t.type==="multiselect"&&O!==void 0||t.type==="rows"&&L!==void 0,i=o(s?"legend":"label",{class:"tb-label",for:s?void 0:e,id:`${e}-label`},t.label,t.unit?o("span",{class:"tb-unit"},` (${t.unit})`):null),a=o(s?"fieldset":"div",{class:"tb-field-row","data-input":t.id,"data-type":t.type,"data-role":t.role||void 0}),d=t.type==="multiselect"||t.type==="rows"?o("p",{class:"tb-count",id:`${e}-count`}):null,l=t.description?yt(t.description,{class:"tb-desc",id:`${e}-desc`}):null,h=t.details?o("details",{class:"tb-details"},o("summary",{},"More",o("span",{class:"tb-sr"},` about ${t.label}`)),yt(t.details,{class:"tb-details-body"})):null;l&&n.push(`${e}-desc`),d&&n.push(d.id);const c=`${e}-err`;let f,m;switch(t.type){case"textarea":{const u=o("textarea",{class:"tb-textarea",id:e,rows:t.rows??3,spellcheck:"false",autocapitalize:"off",autocomplete:"off",dir:t.dir??"auto",...t.maxLength!==void 0?{maxlength:t.maxLength}:{}});u.value=String(this.#e[t.id]??t.default),u.addEventListener("input",()=>{this.#e[t.id]=u.value,this.#u(t.id)}),f=u;const b=y?.highlight;if(t.lang&&(b||t.grammar)&&N){const p=N.paintTextarea(u,t.lang,b,t.grammar);m=p.wrap,this.#b.set(t.id,p.paint)}break}case"select":{const u=p=>{this.#e[t.id]=p;const g=t.options.find(v=>v.value===p);g?.sets?this.#G(g.label,g.sets):this.#u(t.id)};if(s&&S){f=o("div",{class:"tb-seg",id:e,role:"radiogroup","aria-labelledby":`${e}-label`}),this.#b.set(t.id,S.segments(f,t.options,e,()=>String(this.#e[t.id]),u));break}const b=o("select",{class:"tb-select",id:e});for(const p of t.options){const g=o("option",{value:p.value},p.label);p.value===String(this.#e[t.id]??t.default)&&(g.selected=!0),b.append(g)}b.addEventListener("change",()=>u(b.value)),f=b;break}case"toggle":{const u=o("input",{class:"tb-checkbox",id:e,type:"checkbox"});u.checked=!!(this.#e[t.id]??t.default),u.addEventListener("change",()=>{this.#e[t.id]=u.checked,this.#u(t.id)}),f=u;break}case"multiselect":{const u=v=>{this.#e[t.id]=v,this.#u(t.id)},b=()=>this.#e[t.id];if(O&&d){f=o("div",{id:e,role:"group","aria-labelledby":`${e}-label`}),this.#b.set(t.id,O.choices(f,t,d,b,u));break}const p=o("select",{class:"tb-select",id:e,multiple:!0,size:Math.min(t.options.length,6)});for(const v of t.options)p.append(o("option",{value:v.value},v.label));const g=()=>{for(const v of p.options)v.selected=b().includes(v.value);d&&(d.textContent=`${b().length} selected`)};p.addEventListener("change",()=>u(P(t,[...p.selectedOptions].map(v=>v.value)))),g(),this.#b.set(t.id,g),f=p;break}case"rows":{if(L&&d){f=o("div",{id:e,role:"group","aria-labelledby":`${e}-label`});const u=L.rows(f,t,e,d,()=>this.#e[t.id],b=>{this.#e[t.id]=b,this.#u(t.id)},b=>{const p=this.#r.announce;p&&(p.textContent="",setTimeout(()=>p.textContent=b,50))});this.#b.set(t.id,u.sync),this.#V.set(t.id,u.mark);break}f=o("p",{class:"tb-desc",id:e},"This list could not be loaded, so the tool runs with its starting rows. Reload the page to edit them.");break}case"number":{const u=o("input",{class:"tb-input",id:e,type:"number",min:t.min,max:t.max,...t.step!==void 0?{step:t.step}:{},inputmode:"decimal",dir:"ltr"});if(u.value=String(this.#e[t.id]??t.default),u.addEventListener("input",()=>{this.#e[t.id]=P(t,u.value);const b=this.#C.get(t.id);b&&(b.value=String(this.#e[t.id])),this.#u(t.id)}),f=u,t.control==="slider"){const b=o("input",{class:"tb-slider",type:"range",min:t.min,max:t.max,...t.step!==void 0?{step:t.step}:{},"aria-labelledby":`${e}-label`});b.value=u.value,b.addEventListener("input",()=>{this.#e[t.id]=P(t,b.value),u.value=String(this.#e[t.id]),this.#u(t.id)}),this.#C.set(t.id,b)}break}default:{const u=o("input",t.type==="date"?{class:"tb-input",id:e,type:t.mode==="datetime"?"datetime-local":t.mode??"date",min:t.min,max:t.max,dir:"ltr"}:{class:"tb-input",id:e,type:t.type==="secret"?"password":"text",spellcheck:"false",autocapitalize:"off",autocomplete:"off",dir:t.type==="text"?t.dir??"auto":"ltr",maxlength:t.type==="color"?7:t.maxLength});if(u.value=String(this.#e[t.id]),u.addEventListener("input",()=>{this.#e[t.id]=P(t,u.value),this.#u(t.id)}),f=u,t.type==="color"&&S){const b=S.swatch(u,t.label,()=>String(this.#e[t.id]),p=>{this.#e[t.id]=p,this.#u(t.id)});m=b.row,this.#b.set(t.id,b.sync)}t.type==="secret"&&S&&(m=S.eye(u,t.label));break}}if(f.addEventListener("keydown",u=>{const b=u;b.key!=="Enter"||t.type==="textarea"&&!(b.metaKey||b.ctrlKey)||(b.preventDefault(),this.#w({focusResult:!0}))}),f.setAttribute("aria-describedby",[...n,c].join(" ")),this.#R.set(t.id,f),t.type==="toggle")a.append(o("div",{class:"tb-toggle-row"},f,i)),l&&a.append(l),h&&a.append(h);else{const u=this.#C.get(t.id);a.append(i,u?o("div",{class:"tb-slider-row"},u,f):m??f),l&&a.append(l),h&&a.append(h)}return d&&!d.parentNode&&a.append(d),a.append(o("p",{class:"tb-sr",id:c})),a}#at(t){const e="tb-samples-label",n=o("div",{class:"tb-samples",role:"group","aria-labelledby":e});n.append(o("span",{class:"tb-samples-label",id:e},"Try:"));for(const s of t){const i=o("button",{class:"tb-sample",type:"button"},s.label);i.addEventListener("click",()=>this.#G(s.label,s.input)),n.append(i)}return n}#G(t,e){this.#e=U(this.#t?.inputs??[],this.#e,e);const n=this.#I(Object.keys(e));this.#N(),this.#K(),this.#t?.autoRun!==!0&&this.#c(`filled with "${t}"${n}. Press Run`),this.#z()}#u(t){const e=this.#I([t]);e&&this.#N(),this.#K(),e&&this.#c(e.slice(2)+(this.#r.output?.hasAttribute("data-stale")?". Press Run":"")),this.#z()}#I(t){let e="";for(const n of this.#t?.inputs??[]){if(n.type!=="select"||t.includes(n.id)||n.options.filter(l=>l.sets&&t.some(h=>h in l.sets)).length===0)continue;const i=l=>l.sets!==void 0&&Object.entries(l.sets).every(([h,c])=>JSON.stringify(this.#e[h])===JSON.stringify(c)),a=n.options.find(l=>l.value===this.#e[n.id]);if(a&&(i(a)||!a.sets&&!n.options.some(i)))continue;const d=n.options.find(i)??n.options.find(l=>!l.sets);d&&(this.#e[n.id]=d.value,e+=`; ${n.label} now shows "${d.label}"`)}return e}#ot(t){this.#e=U(this.#t?.inputs??[],this.#e,t);const e=this.#I(Object.keys(t));this.#N(),this.#i=!0,this.#r.output&&this.#M(),e&&this.#c(e.slice(2)),this.#z()}#N(){for(const t of this.#t?.inputs??[]){const e=this.#R.get(t.id);if(!e)continue;const n=this.#e[t.id];t.type==="toggle"?e.checked=!!n:"value"in e&&(e.value=String(n??""));const s=this.#C.get(t.id);s&&(s.value=String(n??"")),this.#b.get(t.id)?.()}}#f(t){const e=this.#r.output;if(!e)return;this.#o=t;const n=this.#t,s=this.mode==="card";try{A(e,$(t,St(this,{compact:s,...this.#P!==void 0&&!this.#L?{cardParts:this.#P}:{},...this.more==="expand"?{more:"expand",expanded:this.#T}:{},...n?.cardFields!==void 0?{cardFields:n.cardFields}:{}})))}catch(i){if(i instanceof Z){i.load().then(()=>this.#f(t),()=>A(e,zt(t,a=>$(a,{compact:s}))));return}A(e,Rt(t.kind))}}#W(t,e="",n){for(const[s,i]of this.#R){const a=s===t;i.toggleAttribute("aria-invalid",a),a&&i.setAttribute("aria-invalid","true");const d=this.#s.getElementById(`in-${s}-err`);if(!d)continue;d.textContent=a?e:"";const l=this.#V.get(s);l?.(a?n:void 0,e),d.className=a&&!(l&&n!==void 0)?"tb-field-msg":"tb-sr"}}#F(t){this.#r.output?.setAttribute("data-state",t?"running":"idle"),this.#r.output?.setAttribute("aria-busy",String(t)),this.#r.run&&(this.#r.run.disabled=t),this.#E&&clearTimeout(this.#E),this.#E=void 0,t?this.#E=setTimeout(()=>this.#r.progress?.removeAttribute("hidden"),$e):(this.#r.progress?.setAttribute("hidden",""),this.#Y(0))}#Y(t){const e=this.#r.progress?.firstElementChild;e&&(e.style.width=`${Math.round(Math.max(0,Math.min(1,t))*100)}%`)}#c(t){this.#j=t,this.#r.status&&this.#r.status.textContent!==t&&(this.#r.status.textContent=t)}#dt(t){this.#r.announce&&(this.#r.announce.textContent=t),this.#c("")}#lt(){const t=this.querySelector('script[type="application/json"][data-toolbench-seed]');if(t?.textContent)try{this.#a=JSON.parse(t.textContent)}catch{console.warn("[toolbench] a seed script was present but is not valid JSON; ignoring it.")}}#D(t){this.removeAttribute("data-status");const e=o("div",{class:"tb-out-error",role:"alert"},o("span",{class:"tb-error-message"},t));A(this.#s,o("div",{class:"tb"},o("div",{class:"tb-body"},e))),this.#$()}}function _(r){return r.status??"live"}function D(r){return r==="deprecated"?o("span",{class:"tb-mark","data-status":"deprecated"},"Deprecated"):r==="retired"?o("span",{class:"tb-mark","data-status":"retired"},"Retired"):null}function Mt(r,t){return r.id===t||r.kind==="group"&&r.parts.some(e=>Mt(e,t))}function Y(r){return r?r.kind==="group"?[...new Set(r.parts.flatMap(t=>Y(t)))]:j(r.kind)?[r.kind]:[]:[]}function Ce(r){const t=r.includes("graph"),e=r.some(n=>n!=="graph");return t&&e?"chart and the graph":t?"graph":"chart"}function Oe(r,t){try{return $(r,t)}catch(e){if(!(e instanceof Z))throw e;return zt(r,n=>$(n,t))}}function zt(r,t){const e=o("p",{class:"tb-status"},`The ${Ce(Y(r))} could not be loaded.`),n=r.kind==="group"?r.parts.filter(i=>Y(i).length===0):[];if(n.length===0)return e;const s=t(n.length===1?n[0]:{kind:"group",parts:n});return o("div",{},s,e)}function xt(r){return Ht(r.href)?o("a",{href:r.href,rel:"noopener"},r.label):o("span",{},r.label)}function kt(r,t,e){const n=o("h3",{class:"tb-name"},e&&t?o("a",{href:e},r.name):r.name),s=D(_(r));return s?o("div",{class:"tb-title"},n,s):n}function St(r,t){const e=y?.highlight,n=y?.workerFactory,s=r.getAttribute("wide"),i=r.getAttribute("wide-toggle");return{...t,...e?{highlight:e}:{},...n?{graphWorker:n}:{},wide:s==="fit"||s==="scroll"?s:y?.wide??"fit",wideToggle:i==="true"||i==="false"?i==="true":y?.wideToggle??!0}}function Le(r){const t=r.filter(e=>e.primary===!0);return t.length>0?t:r.slice(0,1)}function Q(r,t=!1){switch(r.kind){case"fields":return`${r.fields.length} field${r.fields.length===1?"":"s"}`;case"table":return`table, ${r.rows.length} row${r.rows.length===1?"":"s"}`;case"series":return`chart, ${r.chart.series.length} series`;case"heatmap":return`heatmap, ${r.heatmap.y.length} by ${r.heatmap.x.length}`;case"pie":return`${r.pie.donut?"donut":"pie"} chart, ${r.pie.slices.length} slice${r.pie.slices.length===1?"":"s"}`;case"radar":return`radar chart, ${r.radar.axes.length} axes, ${r.radar.series.length} series`;case"treemap":return`treemap, ${r.treemap.root.children?.length??0} groups`;case"venn":return`Venn diagram, ${r.venn.sets.length} sets`;case"graph":{const{label:e,nodes:n,edges:s}=r.graph;return`Graph, ${e}: ${n.length} node${n.length===1?"":"s"}, ${s.length} edge${s.length===1?"":"s"}`}case"bytes":{const e=r.highlight?.length??0,n=`${r.bytes.length} byte${r.bytes.length===1?"":"s"}`;return e>0?`${n}, ${e} range${e===1?"":"s"} marked`:n}case"text":case"code":return"result ready";case"group":return(t?r.parts.slice(0,1):r.parts).map(n=>Q(n,t)).join(", ");case"error":return`error: ${r.message}`}}const Pe=9,Me="echo",ze="Echo",Ie="Says back what it was given.",Ne="1.0.0",Fe=["pure"],De={entry:"index.ts",thread:"main"},je=["fields","error"],Ve=[{id:"text",type:"text",label:"Text",default:"hello"}],qe={sdk:Pe,id:Me,name:ze,blurb:Ie,version:Ne,capabilities:Fe,runtime:De,kinds:je,inputs:Ve};Te({source:new ge({echo:{manifest:qe,load:()=>w(()=>import("./index-DmgReVJP.js"),[])}}),pageUrl:r=>`./tool.html?id=${encodeURIComponent(r)}`});export{Z as C,Jt as M,Ut as S,Et as V,w as _,Ue as a,Kt as b,Lt as c,Ee as d,o as e,We as f,Gt as g,Ht as i,He as s};
