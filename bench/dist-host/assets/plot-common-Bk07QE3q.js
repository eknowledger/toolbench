import{s as f,a as x}from"./index-DPMZcgQm.js";const y=`
.tb-out-chart { margin: 0; }
.tb-out-chart svg { width: 100%; height: auto; display: block; overflow: visible; }
.tb-plot { font-size: var(--tb-chart-font, 0.75rem); max-width: var(--tb-chart-max-width, 100%); }
.tb-out-chart-card .tb-plot { max-width: min(var(--tb-chart-max-width, 100%), var(--tb-chart-card-max, 52rem)); }
.tb-grid { stroke: var(--tb-border); stroke-width: 1; }
.tb-axis { stroke: var(--tb-faint); stroke-width: 1; }
.tb-tick, .tb-axis-label { fill: var(--tb-faint); font-family: var(--tb-mono); }
.tb-axis-label { font-family: var(--tb-font); }
.tb-annotation { stroke: var(--tb-accent); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.8; }
.tb-annotation-label { fill: var(--tb-accent-text); font-family: var(--tb-mono); }
.tb-threshold { stroke: var(--tb-muted); stroke-width: 1.25; stroke-dasharray: 6 4; }
.tb-threshold[data-tone="warn"] { stroke: var(--tb-warn); }
.tb-threshold[data-tone="bad"] { stroke: var(--tb-bad); }
.tb-threshold[data-tone="good"] { stroke: var(--tb-good); }
.tb-threshold-label { fill: var(--tb-muted); font-family: var(--tb-mono); stroke: var(--tb-bg); stroke-width: 3; paint-order: stroke; }
.tb-threshold-label[data-tone="warn"] { fill: var(--tb-warn); }
.tb-threshold-label[data-tone="bad"] { fill: var(--tb-bad); }
.tb-threshold-label[data-tone="good"] { fill: var(--tb-good); }
.tb-s1 { --c: var(--tb-s1); }
.tb-s2 { --c: var(--tb-s2); }
.tb-s3 { --c: var(--tb-s3); }
.tb-s4 { --c: var(--tb-s4); }
.tb-s5 { --c: var(--tb-s5); }
.tb-s6 { --c: var(--tb-s6); }
.tb-line { fill: none; stroke: var(--c); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.tb-area { stroke: none; fill: var(--c); opacity: 0.14; }
.tb-box { fill: var(--c); fill-opacity: 0.18; stroke: var(--c); stroke-width: 1.5; }
.tb-box.tb-hot { fill-opacity: 0.32; }
.tb-median { stroke: var(--c); stroke-width: 2.5; }
.tb-whisker { stroke: var(--c); stroke-width: 1.25; }
.tb-outlier { fill: var(--tb-bg); stroke: var(--c); stroke-width: 1.5; }
.tb-swatch-box { width: 0.75rem; height: 0.6rem; border-radius: 2px; flex: none; border: 1.5px solid var(--c, currentColor); background: color-mix(in oklab, var(--c, currentColor) 18%, transparent); }
.tb-band { stroke: none; fill: var(--c); opacity: 0.22; }
.tb-swatch-band { width: 0.75rem; height: 0.6rem; border-radius: 2px; flex: none; background: var(--c, currentColor); opacity: 0.45; }
.tb-bar  { stroke: none; fill: var(--c); }
.tb-bar[data-stacked] { stroke: var(--tb-bg); stroke-width: 1.5; }
.tb-legend { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.5rem 0 0; padding: 0; list-style: none; font-size: 0.78rem; color: var(--tb-muted); }
.tb-legend li { display: flex; align-items: center; gap: 0.375rem; }
.tb-swatch { width: 0.75rem; height: 0.1875rem; border-radius: 2px; background: var(--c, currentColor); }
.tb-marker { fill: var(--tb-bg); stroke: var(--c); stroke-width: 1.75; }
.tb-bubble { fill: var(--c); fill-opacity: 0.5; stroke: var(--tb-bg); stroke-width: 1.5; }
.tb-bubble.tb-hot { fill-opacity: 0.8; stroke: var(--tb-fg); }
.tb-size-key { font-size: var(--tb-chart-font, 0.75rem); margin-top: 0.5rem; display: flex; align-items: flex-end; gap: 0.5rem; }
.tb-size-key svg { width: auto; height: auto; display: block; overflow: visible; }
.tb-size-title { margin: 0 0 0.25rem; font-size: 0.78rem; color: var(--tb-muted); }
.tb-size-ref { fill: none; stroke: var(--tb-muted); stroke-width: 1; }
.tb-swatch-marker { width: 0.7rem; height: 0.7rem; flex: none; background: var(--c, currentColor); }
.tb-out-chart { position: relative; }
.tb-plot { outline: none; border-radius: 4px; }
.tb-plot:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: 4px; }
.tb-crosshair { stroke: var(--tb-muted); stroke-width: 1; stroke-dasharray: 3 3; }
.tb-marker.tb-hot { stroke-width: 3; }
.tb-bar.tb-hot { stroke: var(--tb-fg); stroke-width: 1.5; }
.tb-readout {
  position: absolute; z-index: 2; pointer-events: none; transform: translate(12px, -50%);
  min-width: 9rem; max-width: 16rem; padding: 0.5rem 0.625rem;
  background: var(--tb-bg); color: var(--tb-fg); border: 1px solid var(--tb-border); border-radius: 8px;
  box-shadow: 0 6px 18px -8px rgb(0 0 0 / 0.35); font-size: 0.78rem; line-height: 1.35;
}
.tb-chart-data tr.tb-hot > * { background: var(--tb-accent-bg); }
.tb-chart-data tr.tb-hot > :first-child { box-shadow: inset 3px 0 0 var(--tb-accent); }
.tb-readout[data-flip] { transform: translate(calc(-100% - 12px), -50%); }
.tb-readout-title { margin: 0 0 0.25rem; color: var(--tb-muted); font-weight: 600; }
.tb-readout-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }
.tb-readout-rows li { display: flex; align-items: center; gap: 0.4rem; }
.tb-readout-rows strong { font-family: var(--tb-mono); font-weight: 600; }
.tb-readout-rows span:last-child { color: var(--tb-muted); }
.tb-swatch-marker[data-marker="0"] { clip-path: circle(50%); }
.tb-swatch-marker[data-marker="1"] { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.tb-swatch-marker[data-marker="2"] { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.tb-swatch-marker[data-marker="4"] { clip-path: polygon(0 0, 100% 0, 50% 100%); }
.tb-swatch-marker[data-marker="5"] { clip-path: polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%); }
.tb-chart-data { margin-top: 0.5rem; font-size: 0.8rem; overflow-x: auto; }
.tb-chart-data summary:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: -2px; }
.tb-chart-data summary { color: var(--tb-faint); cursor: pointer; min-height: 24px; line-height: 24px; }
.tb-chart-data table { margin-top: 0.5rem; }
`;function R(e){x(e,"chart",()=>y)}function F(e){if(!Number.isFinite(e))return"n/a";const t=Math.abs(e);return Number.isInteger(e)&&t<1e3?String(e):t>=1e3?e.toLocaleString(void 0,{maximumFractionDigits:0}):t>=10?e.toFixed(t%1===0?0:1):t>=1?e.toFixed(2):t===0?"0":e.toPrecision(2)}const O=e=>e.ascent+e.descent,W=e=>(e.ascent-e.descent)/2,S=480,d={width:640,font:12,narrow:!1,ascent:11.2,descent:2.9,char:.62},z="Recognition Synthesis 0123456789 k$";function A(e,t){const a=f("svg",{"aria-hidden":"true",style:"position:absolute;width:0;height:0;overflow:visible;visibility:hidden"}),s=[z,"0123456789"].flatMap(r=>[f("text",{class:"tb-tick",x:0,y:0},r),f("text",{class:"tb-axis-label",x:0,y:0},r),f("text",{class:"tb-axis-label",x:0,y:0,style:"font-weight:600"},r)]);a.append(...s),e.append(a);let i=0,n=0,o=0;for(const r of s){const l=r.getBBox();i=Math.max(i,-l.y),n=Math.max(n,l.y+l.height),o=Math.max(o,l.width/(r.textContent??"").length/t)}return a.remove(),i>0?{ascent:i,descent:n,char:o}:{ascent:t*.93,descent:t*.24,char:d.char}}let m=d.char;const q=(e,t)=>e.length*t*m;function E(e,t,a){const s=Math.max(1,Math.floor(t/(a*m)));return e.length>s?`${e.slice(0,Math.max(1,s-1))}…`:e}function L(e,t,a,s=6){for(let i=1;i<=e.length;i++){const n=e.filter((o,r)=>r%i===0);if(n.every((o,r)=>r===0||Math.abs(t(o)-t(n[r-1]))>=(a(o)+a(n[r-1]))/2+s))return n}return e.slice(0,1)}function T(e){m=d.char;let t=e(d),a=d,s=new Set(t.getAttributeNames());if(typeof ResizeObserver!="function")return t;const i=r=>r.querySelector(".tb-plot")??r;let n=!1;const o=new ResizeObserver(()=>{if(!t.isConnected)return n?o.disconnect():void 0;n=!0;const r=i(t),l=Math.floor(r.clientWidth),u=Number.parseFloat(getComputedStyle(r).fontSize)||d.font,v=t.clientWidth<S;if(l<=0)return;const h=A(r,u),p=(c,w)=>Math.abs(c-w)<.01;if(l===a.width&&u===a.font&&v===a.narrow&&p(h.ascent,a.ascent)&&p(h.descent,a.descent)&&p(h.char,a.char)){t.setAttribute("data-fitted","");return}a={width:l,font:u,narrow:v,...h},m=a.char;const b=e(a),g=new Set(b.getAttributeNames());for(const c of t.getAttributeNames())!s.has(c)&&c!=="data-fitted"&&b.setAttribute(c,t.getAttribute(c)??"");s=g,t.querySelector("details.tb-chart-data")?.hasAttribute("open")&&b.querySelector("details.tb-chart-data")?.setAttribute("open","");const k=t.getRootNode().activeElement===r;o.disconnect(),t.replaceWith(b),t=b,k&&i(b).focus({preventScroll:!0}),requestAnimationFrame(()=>{t===b&&(o.observe(i(b)),o.observe(b))})});return o.observe(i(t)),o.observe(t),t}export{q as a,F as b,E as c,R as d,T as f,O as l,W as m,L as t};
