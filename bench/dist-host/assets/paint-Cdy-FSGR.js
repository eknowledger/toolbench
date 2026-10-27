import{e as f,c as k}from"./index-DPMZcgQm.js";const y=250,m=2e4,v=`@layer toolbench{
.tb-painted{position:relative}
.tb-painted>.tb-textarea{display:block;position:relative}
.tb-paint{position:absolute;inset:0;margin:0;overflow:hidden;pointer-events:none;visibility:hidden;font:inherit;font-family:var(--tb-mono);font-size:.82rem;padding:.4375rem .5625rem;border:1px solid transparent;border-radius:8px;color:var(--tb-input-fg);background:var(--tb-input-bg);white-space:pre-wrap;overflow-wrap:break-word}
.tb-painted>.tb-textarea,.tb-paint{scrollbar-gutter:stable}
.tb-painted>.tb-textarea::selection{background:color-mix(in srgb,var(--tb-accent) 30%,transparent)}
.tb-painted[data-paint]>.tb-paint{visibility:visible}
.tb-painted[data-paint]>.tb-textarea{color:transparent;background:transparent;caret-color:var(--tb-input-fg)}
.tb-painted[data-paint]>.tb-textarea::selection{color:transparent}
.tb-paint [data-tok=keyword]{color:var(--tb-s2)}
.tb-paint [data-tok=string]{color:var(--tb-good)}
.tb-paint [data-tok=comment]{color:var(--tb-muted)}
.tb-paint [data-tok=operator]{color:var(--tb-s4)}
}`;let g;function x(t){queueMicrotask(()=>{const r=t.getRootNode();if(r instanceof ShadowRoot)try{g??=new CSSStyleSheet,g.cssRules.length||g.replaceSync(v),k(r,g)}catch{t.append(f("style",{},v))}})}const w=t=>t==="_"||t>="0"&&t<="9"||t.toLowerCase()!==t.toUpperCase();function S(t,r){const d=f("span",{"data-grammar":""}),h=new Set(r.keywords??[]),c=[...r.operators??[]].sort((e,i)=>i.length-e.length),l=r.strings??"",b=r.comment;let a="";const s=(e,i)=>{a&&d.append(a),a="",d.append(f("span",{"data-tok":e},i))},p=e=>{const i=t.indexOf(`
`,e);return i<0?t.length:i};let o=0;for(;o<t.length;){const e=t[o];if(b&&t.startsWith(b,o)){const n=p(o);s("comment",t.slice(o,n)),o=n;continue}if(l.includes(e)){let n=o+1;for(;n<t.length&&t[n]!==e&&t[n]!==`
`;)n+=t[n]==="\\"&&t[n+1]!==`
`?2:1;n=Math.min(t[n]===e?n+1:n,t.length),s("string",t.slice(o,n)),o=n;continue}const i=c.find(n=>t.startsWith(n,o));if(i){s("operator",i),o+=i.length;continue}if(w(e)){let n=o+1;for(;n<t.length&&w(t[n]);)n++;const u=t.slice(o,n);h.has(u)?s("keyword",u):a+=u,o=n;continue}a+=e,o++}return a&&d.append(a),d}function C(t,r,d,h){const c=f("pre",{class:"tb-paint","aria-hidden":"true",dir:t.dir}),l=f("div",{class:"tb-painted",role:"none"},c,t);let b;const a=()=>{c.scrollTop=t.scrollTop,c.scrollLeft=t.scrollLeft},s=()=>{const p=t.value,o=n=>n instanceof Node&&n.textContent===p;let e;if(p.length<=m){try{e=d?.(p,r)}catch{}const n=o(e)&&typeof e.querySelector=="function"&&e.querySelector("*")!==null;h&&!n&&(e=S(p,h))}const i=o(e);i&&c.replaceChildren(e,p.endsWith(`
`)?" ":""),l.toggleAttribute("data-paint",i),a()};return t.addEventListener("input",()=>{l.hasAttribute("data-paint")&&l.removeAttribute("data-paint"),clearTimeout(b),b=setTimeout(s,y)}),t.addEventListener("scroll",a),x(l),s(),{wrap:l,paint:s}}export{m as PAINT_MAX,C as paintTextarea,S as tokenise};
