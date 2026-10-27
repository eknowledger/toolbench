import{a as l,e as i,s as d}from"./index-DPMZcgQm.js";const b=`
fieldset.tb-field-row { border: 0; margin: 0; padding: 0; min-width: 0; }
legend.tb-label { padding: 0; margin-bottom: 0.25rem; }
.tb-seg { display: flex; gap: 2px; min-width: 0; overflow: hidden; padding: 2px; border: 1px solid var(--tb-input-border); border-radius: 8px; background: var(--tb-input-bg); }
.tb-seg[aria-invalid="true"] { border-color: var(--tb-bad); }
.tb-seg-opt { flex: 1 1 0; position: relative; display: flex; align-items: center; justify-content: center; gap: 0.4rem; min-height: 24px; padding: 0.3125rem 0.625rem; border-radius: 6px; font-size: 0.85rem; color: var(--tb-muted); cursor: pointer; white-space: nowrap; }
.tb-seg-opt input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
.tb-seg-opt:hover { color: var(--tb-fg); }
.tb-seg-opt:has(:checked) { background: var(--tb-accent); color: var(--tb-accent-ink); font-weight: 600; }
.tb-seg:has(:focus-visible), .tb-seg[data-keys]:has(:focus) { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-seg input:focus-visible { outline: none; }
.tb-seg[data-stack] { flex-direction: column; gap: 0.125rem; overflow: visible; padding: 0.25rem 0.375rem; background: none; }
.tb-seg[data-stack] .tb-seg-opt { justify-content: flex-start; white-space: normal; padding: 0.125rem 0.25rem; color: var(--tb-fg); }
.tb-seg[data-stack] .tb-seg-opt:has(:checked) { background: none; color: var(--tb-fg); }
.tb-seg[data-stack] .tb-seg-opt input { position: static; opacity: 1; width: 1rem; height: 1rem; flex: none; accent-color: var(--tb-accent); }
.tb-color-row { display: flex; gap: 0.5rem; }
.tb-color-row .tb-input { width: 8.5rem; font-family: var(--tb-mono); text-transform: lowercase; }
.tb-swatch { width: 2.25rem; height: auto; flex: none; padding: 3px; border: 1px solid var(--tb-input-border); border-radius: 8px; background: var(--tb-input-bg); cursor: pointer; }
.tb-swatch::-webkit-color-swatch-wrapper { padding: 0; }
.tb-swatch::-webkit-color-swatch { border: 0; border-radius: 5px; }
.tb-swatch::-moz-color-swatch { border: 0; border-radius: 5px; }
.tb-swatch:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-secret-row { position: relative; }
.tb-secret-row .tb-input { font-family: var(--tb-mono); padding-inline-end: 2.5rem; }
.tb-eye { position: absolute; inset-block: 0; inset-inline-end: 0.25rem; margin-block: auto; width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--tb-muted); cursor: pointer; }
.tb-eye:hover { color: var(--tb-fg); }
.tb-eye:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 0; }
.tb-eye svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.tb-eye:not([aria-pressed="true"]) .tb-eye-slash { display: none; }
`;let p=!1;addEventListener("keydown",()=>p=!0,!0);addEventListener("pointerdown",()=>p=!1,!0);function w(t,s,r,o){l(t,"controls",()=>b);const a=i("input",{class:"tb-swatch",type:"color","aria-label":`${s} picker`}),n=()=>{/^#[0-9a-f]{6}$/.test(r())&&(a.value=r())};return n(),t.addEventListener("input",n),a.addEventListener("input",()=>{t.value=a.value,o(a.value)}),{row:i("div",{class:"tb-color-row"},a,t),sync:n}}function m(t,s){l(t,"controls",()=>b);const r=i("button",{class:"tb-eye",type:"button","aria-pressed":"false","aria-label":`Show ${s}`,"aria-controls":t.id},d("svg",{viewBox:"0 0 24 24","aria-hidden":"true"},d("path",{d:"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"}),d("circle",{cx:12,cy:12,r:3}),d("path",{class:"tb-eye-slash",d:"M3 3l18 18"})));return r.addEventListener("click",()=>{const o=t.type==="password";t.type=o?"text":"password",r.setAttribute("aria-pressed",String(o)),r.setAttribute("aria-label",`${o?"Hide":"Show"} ${s}`)}),i("div",{class:"tb-secret-row"},t,r)}function k(t,s,r,o,a){l(t,"controls",()=>b);const n=s.map(e=>{const c=i("input",{type:"radio",name:r,value:e.value});return c.addEventListener("change",()=>a(c.value)),t.append(i("label",{class:"tb-seg-opt"},c,e.label)),c}),u=e=>e.scrollWidth>e.clientWidth+1,g=()=>{t.removeAttribute("data-stack"),t.toggleAttribute("data-stack",u(t)||[...t.children].some(u))};let h=-1;new ResizeObserver(([e])=>{e&&e.contentRect.width!==h&&(h=e.contentRect.width,g())}).observe(t);const v=()=>{for(const e of n)e.checked=e.value===o();g()};for(const e of["focusin","keydown"])t.addEventListener(e,()=>t.toggleAttribute("data-keys",p));return v(),v}export{m as eye,k as segments,w as swatch};
