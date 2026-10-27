import{a as w,e as p}from"./index-DPMZcgQm.js";const y=`
fieldset.tb-field-row { border: 0; margin: 0; padding: 0; min-width: 0; }
legend.tb-label { padding: 0; margin-bottom: 0.25rem; }
.tb-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr)); gap: 0.125rem 0.75rem; }
.tb-check { display: flex; align-items: center; gap: 0.5rem; min-height: 28px; font-size: 0.9rem; border-radius: 6px; padding-inline: 0.25rem; cursor: pointer; }
.tb-check input { width: 16px; height: 16px; margin: 0; flex: none; accent-color: var(--tb-accent); cursor: inherit; }
.tb-check input:focus-visible, .tb-chip:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 2px; }
.tb-chips { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.tb-chip { font: inherit; font-size: 0.82rem; min-height: 28px; padding: 0.2rem 0.65rem; display: inline-flex; align-items: center; gap: 0.3rem; color: var(--tb-input-fg); background: var(--tb-input-bg); border: 1px solid var(--tb-input-border); border-radius: 999px; cursor: pointer; }
.tb-chip:hover { border-color: var(--tb-muted); }
.tb-chip[aria-pressed="true"] { color: var(--tb-accent-text); background: var(--tb-accent-bg); border-color: var(--tb-accent); font-weight: 600; }
.tb-chip[aria-pressed="true"]::before { content: ""; width: 0.7em; height: 0.38em; border-left: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-0.12em) rotate(-45deg); }
:is(.tb-check, .tb-chip):has([aria-disabled="true"]), .tb-chip[aria-disabled="true"] { opacity: 0.5; cursor: default; }
:is(.tb-checks, .tb-chips)[aria-invalid="true"] { box-shadow: inset 3px 0 0 var(--tb-bad); padding-inline-start: 0.625rem; }
`;function S(s,i,h,u,g){w(s,"choices",()=>y);const l=(i.control??(i.options.length>6?"chips":"checkboxes"))==="chips";s.classList.add(l?"tb-chips":"tb-checks");const c=i.options.map(e=>e.value),o=i.max??c.length,m=i.min??0,x=i.options.map(e=>{const r=l?p("button",{type:"button",class:"tb-chip"},e.label):p("input",{type:"checkbox",value:e.value});return r.addEventListener("click",b=>{const a=u(),t=a.includes(e.value);if(!t&&a.length>=o)return b.preventDefault();g(c.filter(n=>n===e.value?!t:a.includes(n))),d()}),s.append(l?r:p("label",{class:"tb-check"},r,e.label)),{option:e,control:r}}),d=()=>{const e=u(),r=e.length>=o&&o<c.length;for(const{option:a,control:t}of x){const n=e.includes(a.value);t instanceof HTMLInputElement?t.checked=n:t.setAttribute("aria-pressed",String(n));const v=r&&!n;for(const[f,k]of[["aria-disabled","true"],["aria-describedby",h.id]])v?t.setAttribute(f,k):t.removeAttribute(f)}const b=[m>0&&`at least ${m}`,o<c.length&&`at most ${o}`].filter(Boolean);h.textContent=r?`${e.length} selected, the most allowed. Deselect one to choose another.`:[`${e.length} selected`,...b].join(", ")};return d(),d}export{S as choices};
