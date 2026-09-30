/* GENERATO da build.py: si modifica js/src/*.js */
(() => {
"use strict";
/* Sportwire · js. Nessuna dipendenza, nessun tracker. Tutto ciò che è "tuo" (cronologia) resta in localStorage. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const SECTIONS = { calcio: "Calcio", motori: "Motori", tennis: "Tennis", basket: "Basket", ciclismo: "Ciclismo", altri: "Altri sport" };
const secName = (k) => SECTIONS[k] || (k ? k[0].toUpperCase() + k.slice(1) : "");
const ICON_OUT = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M8 16L16.5 7.5M9.5 7.5h7v7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.6 4.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_PREV = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_SPARK = '<svg class="spark" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false"><path d="M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3L12 21.5l-2.3-7.2L2.5 12l7.2-2.3z" fill="currentColor"/></svg>';

const relTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
};
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = (d, now = new Date()) => {
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return "Oggi";
  if (dayKey(d) === dayKey(y)) return "Ieri";
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
};
const whenLabel = (t) => {
  const d = new Date(t), now = new Date();
  const l = dayLabel(d, now);
  return l === "Oggi" ? `oggi alle ${hhmm(d)}` : l === "Ieri" ? `ieri alle ${hhmm(d)}` : `${l} alle ${hhmm(d)}`;
};

/* Chiavi di storia: 8 esadecimali. */
const ID_RX = /^[0-9a-f]{8}$/;
const cssId = (id) => (window.CSS && CSS.escape ? CSS.escape(id) : id);

/* Blocca lo sfondo mentre c'è un overlay: inert + scroll-lock, con contatore per overlay annidati. */
const modal = (() => {
  let n = 0;
  const shell = () => $$(".bar, main, .foot, .fresh");
  return {
    lock() { if (n++ === 0) { document.documentElement.classList.add("is-locked"); shell().forEach((e) => e.setAttribute("inert", "")); } },
    unlock() { if (--n <= 0) { n = 0; document.documentElement.classList.remove("is-locked"); shell().forEach((e) => e.removeAttribute("inert")); } },
  };
})();

/* Tab resta dentro l'overlay. */
const trapTab = (root, e) => {
  if (e.key !== "Tab") return;
  const f = $$('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', root).filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === a || !root.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
};

/* Transizioni di vista (API nativa del browser): il passaggio tra due stati della pagina diventa una dissolvenza o un
   volo dell'elemento condiviso. Dove l'API non c'è, o con «riduci movimento», l'aggiornamento è immediato.
   Tutte le modifiche al DOM vanno DENTRO `update`: il browser fotografa lo stato vecchio solo al fotogramma dopo. */
const canVT = !reduce && typeof document.startViewTransition === "function";
let vtBusy = 0;
function withVT(update, cls = "vt") {
  if (!canVT) { update(); return null; }
  const root = document.documentElement;
  let t;
  root.classList.add(cls);
  vtBusy++;
  try { t = document.startViewTransition(update); }
  catch { vtBusy--; root.classList.remove(cls); update(); return null; }
  const done = () => { if (--vtBusy <= 0) { vtBusy = 0; root.classList.remove("vt", "vt-step", "vt-open"); } };
  t.finished.then(done, done);
  t.ready.catch(() => {});                                   // «saltata» perché ne è partita un'altra: non è un errore
  t.updateCallbackDone.catch((err) => console.error(err));   // un errore vero nell'aggiornamento non deve sparire
  return t;
}

/* uFuzzy v1.0.19 · https://github.com/leeoniya/uFuzzy · ricerca tollerante ai refusi (8,5 KB, nessuna dipendenza).
   Copia non modificata di dist/uFuzzy.iife.min.js. Licenza MIT, qui sotto per intero come richiede la licenza.

   MIT License

   Copyright (c) 2022 Leon Sorokin

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
*/
/*! https://github.com/leeoniya/uFuzzy (v1.0.19) */
var uFuzzy=function(){"use strict";const e=(e,t)=>e>t?1:t>e?-1:0,t=1/0,l=e=>e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),n="eexxaacctt",r=/\p{P}/gu,i=["en",{numeric:!0,sensitivity:"base"}],s=(e,t,l)=>e.replace("A-Z",t).replace("a-z",l),a={unicode:!1,alpha:null,interSplit:"[^A-Za-z\\d']+",intraSplit:"[a-z][A-Z]",interBound:"[^A-Za-z\\d]",intraBound:"[A-Za-z]\\d|\\d[A-Za-z]|[a-z][A-Z]",interLft:0,interRgt:0,interChars:".",interIns:t,intraChars:"[a-z\\d']",intraIns:null,intraContr:"'[a-z]{1,2}\\b",intraMode:0,intraSlice:[1,t],intraSub:null,intraTrn:null,intraDel:null,intraFilt:()=>!0,toUpper:e=>e.toLocaleUpperCase(),toLower:e=>e.toLocaleLowerCase(),compare:null,sort:(t,l,n,r=e)=>{let{idx:i,chars:s,terms:a,interLft2:u,interLft1:g,start:f,intraIns:c,interIns:h,cases:o}=t;return i.map(((e,t)=>t)).sort(((e,t)=>s[t]-s[e]||c[e]-c[t]||a[t]+u[t]+.5*g[t]-(a[e]+u[e]+.5*g[e])||h[e]-h[t]||f[e]-f[t]||o[t]-o[e]||r(l[i[e]],l[i[t]])))}},u=(e,l)=>0==l?"":1==l?e+"??":l==t?e+"*?":e+`{0,${l}}?`,g="(?:\\b|_)";function f(t){t=Object.assign({},a,t);let{unicode:f,interLft:c,interRgt:o,intraMode:p,intraSlice:d,intraIns:m,intraSub:x,intraTrn:R,intraDel:b,intraContr:A,intraSplit:y,interSplit:I,intraBound:S,interBound:z,intraChars:E,toUpper:L,toLower:k,compare:C}=t;m??=p,x??=p,R??=p,b??=p,C??="undefined"==typeof Intl?e:new Intl.Collator(...i).compare;let j=t.letters??t.alpha;if(null!=j){let e=L(j),t=k(j);I=s(I,e,t),y=s(y,e,t),z=s(z,e,t),S=s(S,e,t),E=s(E,e,t),A=s(A,e,t)}let Z=f?"u":"";const $='".+?"',w=RegExp($,"gi"+Z),D=RegExp(`(?:\\s+|^)-(?:${E}+|${$})`,"gi"+Z);let{intraRules:T}=t;null==T&&(T=e=>{let t=a.intraSlice,l=0,n=0,r=0,i=0;if(/[^\d]/.test(e)){let s=e.length;s>4?(t=d,l=m,n=x,r=R,i=b):3>s||(r=Math.min(R,1),4==s&&(l=Math.min(m,1)))}return{intraSlice:t,intraIns:l,intraSub:n,intraTrn:r,intraDel:i}});let B=!!y,M=RegExp(y,"g"+Z),U=RegExp(I,"g"+Z),F=RegExp("^"+I+"|"+I+"$","g"+Z),O=RegExp(A,"gi"+Z);const v=(e,t=!1)=>{let l=[];e=(e=e.replace(w,(e=>(l.push(e),n)))).replace(F,""),t||(e=k(e)),B&&(e=e.replace(M,(e=>e[0]+" "+e[1])));let r=0;return e.split(U).filter((e=>""!=e)).map((e=>e===n?l[r++]:e))},G=/[^\d]+|\d+/g,K=(e,n=0,r=!1)=>{let i=v(e);if(0==i.length)return[];let s,a=Array(i.length).fill("");if(i=i.map(((e,t)=>e.replace(O,(e=>(a[t]=e,""))))),1==p)s=i.map(((e,t)=>{if('"'===e[0])return l(e.slice(1,-1));let n="";for(let l of e.matchAll(G)){let e=l[0],{intraSlice:r,intraIns:i,intraSub:s,intraTrn:g,intraDel:f}=T(e);if(i+s+g+f==0)n+=e+a[t];else{let[l,c]=r,h=e.slice(0,l),o=e.slice(c),p=e.slice(l,c);1==i&&1==h.length&&h!=p[0]&&(h+="(?!"+h+")");let d=p.length,m=[e];if(s)for(let e=0;d>e;e++)m.push(h+p.slice(0,e)+E+p.slice(e+1)+o);if(g)for(let e=0;d-1>e;e++)p[e]!=p[e+1]&&m.push(h+p.slice(0,e)+p[e+1]+p[e]+p.slice(e+2)+o);if(f)for(let e=0;d>e;e++)m.push(h+p.slice(0,e+1)+"?"+p.slice(e+1)+o);if(i){let e=u(E,1);for(let t=0;d>t;t++)m.push(h+p.slice(0,t)+e+p.slice(t)+o)}n+="(?:"+m.join("|")+")"+a[t]}}return n}));else{let e=u(E,m);2==n&&m>0&&(e=")("+e+")("),s=i.map(((t,n)=>'"'===t[0]?l(t.slice(1,-1)):t.split("").map(((e,t,l)=>(1==m&&0==t&&l.length>1&&e!=l[t+1]&&(e+="(?!"+e+")"),e))).join(e)+a[n]))}let f=2==c?g:"",h=2==o?g:"",d=h+u(t.interChars,t.interIns)+f;return n>0?r?s=f+"("+s.join(")"+h+"|"+f+"(")+")"+h:(s="("+s.join(")("+d+")(")+")",s="(.??"+f+")"+s+"("+h+".*)"):(s=s.join(d),s=f+s+h),[RegExp(s,"i"+Z),i,a]},N=(e,t,l)=>{let[n]=K(t);if(null==n)return null;let r=[];if(null!=l)for(let t=0;l.length>t;t++){let i=l[t];n.test(e[i])&&r.push(i)}else for(let t=0;e.length>t;t++)n.test(e[t])&&r.push(t);return r};let P=!!S,W=RegExp(z,Z),Y=RegExp(S,Z);const _=(e,l,n)=>{let[r,i,s]=K(n,1),a=v(n,!0),[u]=K(n,2),g=i.length,f=Array(g),h=Array(g);for(let e=0;g>e;e++){let t=i[e],l=a[e],n='"'==t[0]?t.slice(1,-1):t+s[e],r='"'==l[0]?l.slice(1,-1):l+s[e];f[e]=n,h[e]=r}let p=e.length,d=Array(p).fill(0),m={idx:Array(p),start:d.slice(),chars:d.slice(),cases:d.slice(),terms:d.slice(),interIns:d.slice(),intraIns:d.slice(),interLft2:d.slice(),interRgt2:d.slice(),interLft1:d.slice(),interRgt1:d.slice(),ranges:Array(p)},x=1==c||1==o,R=0;for(let n=0;e.length>n;n++){let i=l[e[n]],s=i.match(r),a=s.index+s[1].length,p=a,d=!1,b=0,A=0,y=0,I=0,S=0,z=0,E=0,L=0,C=0,j=[];for(let e=0,l=2;g>e;e++,l+=2){let n=k(s[l]),r=f[e],u=r.length,m=n.length,R=n==r;if(s[l]==h[e]&&E++,!R&&s[l+1].length>=u){let t=k(s[l+1]).indexOf(r);t>-1&&(j.push(p,m,t,u),p+=q(s,l,t,u),n=r,m=u,R=!0,0==e&&(a=p))}if(x||R){let t=p-1,g=p+m,f=!1,h=!1;if(-1==t||W.test(i[t]))R&&b++,f=!0;else{if(2==c){d=!0;break}if(P&&Y.test(i[t]+i[t+1]))R&&A++,f=!0;else if(1==c){let t=s[l+1],g=p+m;if(t.length>=u){let c,h=0,o=!1,d=RegExp(r,"ig"+Z);for(;c=d.exec(t);){h=c.index;let e=g+h,t=e-1;if(-1==t||W.test(i[t])){b++,o=!0;break}if(Y.test(i[t]+i[e])){A++,o=!0;break}}o&&(f=!0,j.push(p,m,h,u),p+=q(s,l,h,u),n=r,m=u,R=!0,0==e&&(a=p))}if(!f){d=!0;break}}}if(g==i.length||W.test(i[g]))R&&y++,h=!0;else{if(2==o){d=!0;break}if(P&&Y.test(i[g-1]+i[g]))R&&I++,h=!0;else if(1==o){d=!0;break}}R&&(S+=u,f&&h&&z++)}if(m>u&&(C+=m-u),e>0&&(L+=s[l-1].length),!t.intraFilt(r,n,p)){d=!0;break}g-1>e&&(p+=m+s[l+1].length)}if(!d){m.idx[R]=e[n],m.interLft2[R]=b,m.interLft1[R]=A,m.interRgt2[R]=y,m.interRgt1[R]=I,m.chars[R]=S,m.terms[R]=z,m.cases[R]=E,m.interIns[R]=L,m.intraIns[R]=C,m.start[R]=a;let t=i.match(u),l=t.index+t[1].length,r=j.length,s=r>0?0:1/0,g=r-4;for(let e=2;t.length>e;)if(s>g||j[s]!=l)l+=t[e].length,e++;else{let n=j[s+1],r=j[s+2],i=j[s+3],a=e,u="";for(let e=0;n>e;a++)u+=t[a],e+=t[a].length;t.splice(e,a-e,u),l+=q(t,e,r,i),s+=4}l=t.index+t[1].length;let f=m.ranges[R]=[],c=l,h=l;for(let e=2;t.length>e;e++){let n=t[e].length;l+=n,e%2==0?h=l:n>0&&(f.push(c,h),c=h=l)}h>c&&f.push(c,h),R++}}if(e.length>R)for(let e in m)m[e]=m[e].slice(0,R);return m},q=(e,t,l,n)=>{let r=e[t]+e[t+1].slice(0,l);return e[t-1]+=r,e[t]=e[t+1].slice(l,l+n),e[t+1]=e[t+1].slice(l+n),r.length};return{search:(...e)=>((e,n,i,s=1e3,a)=>{i=i?!0===i?5:i:0;let u=null,g=null,f=[];n=n.replace(D,(e=>{let t=e.trim().slice(1);return t='"'===t[0]?l(t.slice(1,-1)):t.replace(r,""),""!=t&&f.push(t),""}));let c,o=v(n);if(f.length>0){if(c=RegExp(f.join("|"),"i"+Z),0==o.length){let t=[];for(let l=0;e.length>l;l++)c.test(e[l])||t.push(l);return[t,null,null]}}else if(0==o.length)return[null,null,null];if(i>0){let t=v(n);if(t.length>1){let l=t.slice().sort(((e,t)=>t.length-e.length));for(let t=0;l.length>t;t++){if(0==a?.length)return[[],null,null];a=N(e,l[t],a)}if(t.length>i)return[a,null,null];u=h(t).map((e=>e.join(" "))),g=[];let n=new Set;for(let t=0;u.length>t;t++)if(a.length>n.size){let l=a.filter((e=>!n.has(e))),r=N(e,u[t],l);for(let e=0;r.length>e;e++)n.add(r[e]);g.push(r)}else g.push([])}}null==u&&(u=[n],g=[a?.length>0?a:N(e,n)]);let p=null,d=null;if(f.length>0&&(g=g.map((t=>t.filter((t=>!c.test(e[t])))))),s>=g.reduce(((e,t)=>e+t.length),0)){p={},d=[];for(let l=0;g.length>l;l++){let n=g[l];if(null==n||0==n.length)continue;let r=u[l],i=_(n,e,r),s=t.sort(i,e,r,C);if(l>0)for(let e=0;s.length>e;e++)s[e]+=d.length;for(let e in i)p[e]=(p[e]??[]).concat(i[e]);d=d.concat(s)}}return[[].concat(...g),p,d]})(...e),split:v,filter:N,info:_,sort:t.sort}}const c=(()=>{let e={A:"ÁÀÃÂÄĄĂÅĀǍ",a:"áàãâäąăåāǎ",E:"ÉÈÊËĖĘĚĒ",e:"éèêëęěē",I:"ÍÌÎÏĮİĪǏ",i:"íìîïįıīǐ",O:"ÓÒÔÕÖŐŌǑØ",o:"óòôõöőōǒø",U:"ÚÙÛÜŪŲŮŰǓ",u:"úùûüūųůűǔ",C:"ÇČĆ",c:"çčć",D:"ĎĐ",d:"ďđ",G:"ĞĢ",g:"ğģ",K:"Ķ",k:"ķ",L:"ŁĹĽĻ",l:"łĺľļ",N:"ÑŃŇŅ",n:"ñńňņ",R:"ŘŔ",r:"řŕ",S:"ŠŚȘŞ",s:"šśșş",T:"ŢȚŤ",t:"ţțť",W:"Ŵ",w:"ŵ",Y:"ÝŸŶ",y:"ýÿŷ",Z:"ŻŹŽ",z:"żźž"},t={},l="";for(let n in e)e[n].split("").forEach((e=>{l+=e,t[e]=n}));let n=RegExp(`[${l}]`,"g"),r=e=>t[e];return e=>{if("string"==typeof e)return e.replace(n,r);let t=Array(e.length);for(let l=0;e.length>l;l++)t[l]=e[l].replace(n,r);return t}})();function h(e){let t,l,n=(e=e.slice()).length,r=[e.slice()],i=Array(n).fill(0),s=1;for(;n>s;)s>i[s]?(t=s%2&&i[s],l=e[s],e[s]=e[t],e[t]=l,++i[s],s=1,r.push(e.slice())):(i[s]=0,++s);return r}const o=(e,t)=>t?`<mark>${e}</mark>`:e,p=(e,t)=>e+t;return f.latinize=c,f.permute=e=>h([...Array(e.length).keys()]).sort(((e,t)=>{for(let l=0;e.length>l;l++)if(e[l]!=t[l])return e[l]-t[l];return 0})).map((t=>t.map((t=>e[t])))),f.highlight=function(e,t,l=o,n="",r=p){n=r(n,l(e.substring(0,t[0]),!1))??n;for(let i=0;t.length>i;i+=2)n=r(n,l(e.substring(t[i],t[i+1]),!0))??n,t.length-3>i&&(n=r(n,l(e.substring(t[i+1],t[i+2]),!1))??n);return r(n,l(e.substring(t[t.length-1]),!1))??n},f}();

/* Ricerca tollerante ai refusi (uFuzzy, qui sopra). Serve solo quando la ricerca esatta non trova abbastanza:
   «pogachar» → Pogacar, «orsatto» → Orsato. Gira sui titoli già scaricati, niente rete. */
const fuzzy = (() => {
  const uf = typeof uFuzzy === "function"
    ? new uFuzzy({ intraMode: 1, intraIns: 1, intraSub: 1, intraTrn: 1, intraDel: 1 })   // un errore per parola: scambio, lettera in più/in meno/sbagliata
    : null;
  const flat = (t) => uFuzzy.latinize(String(t ?? ""));
  return {
    /* haystack: array di testi. Ritorna [{ i, ranges }] dal più pertinente, al più `max`. Sotto le 4 lettere ogni cosa «somiglia» a ogni cosa: niente. */
    find(haystack, q, max = 8) {
      const needle = flat(q).trim();
      if (!uf || needle.replace(/[^a-z0-9]/gi, "").length < 4) return [];
      const hay = haystack.map(flat);
      let res;
      try { res = uf.search(hay, needle, 3, 1e3); } catch { return []; }
      const [idxs, info, order] = res || [];
      if (!idxs || !idxs.length || !info || !order) return [];
      return order.slice(0, max).map((o) => {
        const i = info.idx[o];
        return { i, ranges: hay[i].length === String(haystack[i] ?? "").length ? info.ranges[o] : null };   // se latinize ha cambiato la lunghezza, non si evidenzia
      });
    },
    /* Il testo con le parti trovate in <mark>, tutto con l'escape. */
    mark(text, ranges) {
      const t = String(text ?? "");
      return ranges && ranges.length ? uFuzzy.highlight(t, ranges, (part, hit) => (hit ? `<mark>${esc(part)}</mark>` : esc(part))) : esc(t);
    },
  };
})();

/* La tua cronostoria: cosa hai aperto e quando. Solo localStorage, nessun server. */
const store = (() => {
  const KEY = "sw:cronologia:v1", SESS = "sw:sessione";
  const MAX = 600, MAX_AGE = 180 * 864e5, REOPEN = 30 * 60e3;
  let s = read();
  let ids = new Set(s.log.map((e) => e.id));
  let prevSeen = 0;

  function read() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || "null");
      if (j && j.v === 1 && Array.isArray(j.log)) return j;
    } catch { /* dati corrotti: si riparte */ }
    return { v: 1, log: [], seen: 0 };
  }
  const emit = () => document.dispatchEvent(new CustomEvent("sw:store"));
  function write() {
    const cut = Date.now() - MAX_AGE;
    s.log = s.log.filter((e) => e.t > cut).slice(0, MAX);
    ids = new Set(s.log.map((e) => e.id));
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota o navigazione privata: resta in memoria */ }
    emit();
  }

  /* "Dall'ultima volta": il timestamp della sessione precedente, fisso per tutta la sessione corrente. */
  try {
    const cached = sessionStorage.getItem(SESS);
    if (cached === null) { prevSeen = s.seen || 0; sessionStorage.setItem(SESS, String(prevSeen)); s.seen = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ok */ } }
    else prevSeen = Number(cached) || 0;
  } catch { prevSeen = s.seen || 0; }

  addEventListener("storage", (e) => { if (e.key === KEY) { s = read(); ids = new Set(s.log.map((x) => x.id)); emit(); } });

  return {
    log: () => s.log,
    has: (id) => ids.has(id),
    count: () => s.log.length,
    prevSeen: () => prevSeen,
    /* via: "d" = dossier aperto in pagina, "o" = articolo originale aperto */
    open(st, via = "d") {
      const now = Date.now();
      const i = s.log.findIndex((x) => x.id === st.id && now - x.t < REOPEN);
      const old = i >= 0 ? s.log.splice(i, 1)[0] : null;
      s.log.unshift({
        id: st.id, t: now, p: st.ts || "", ti: st.title || "", s: st.source || "", c: st.section || "", k: st.kicker || "",
        l: st.link || "", i: st.image || "", b: String(st.brief || st.summary || "").slice(0, 280),
        v: via === "o" || (old && old.v === "o") ? "o" : "d",
      });
      write();
    },
    remove(id, t) { s.log = s.log.filter((x) => !(x.id === id && x.t === t)); write(); },
    clear() { s.log = []; write(); },
    export: () => ({ app: "sportwire", version: 1, exported: new Date().toISOString(), cronologia: s.log }),
  };
})();

/* Le notizie dell'edizione corrente (data/news.json), caricate una volta sola. */
const NEWS = { data: null, byId: new Map(), ready: false, promise: null };

function indexNews(d) {
  NEWS.data = d;
  NEWS.byId = new Map();
  for (const s of d.stories) {
    s._t = Date.parse(s.ts);
    s.sources = s.sources || [];
    s.items = s.items || [];
    s.related = s.related || [];
    s._nt = norm(s.title);
    s._nk = norm(`${s.kicker} ${secName(s.section)} ${s.source} ${s.sources.join(" ")}`);
    s._nb = norm(`${s.brief} ${s.summary}`);
    s._ni = norm(s.items.map((i) => i.title).join(" "));
    NEWS.byId.set(s.id, s);
  }
  NEWS.ready = true;
  document.dispatchEvent(new CustomEvent("sw:news"));
  return d;
}
function loadNews() {
  if (!NEWS.promise) {
    NEWS.promise = fetch("data/news.json", { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(indexNews)
      .catch((err) => { NEWS.promise = null; throw err; });
  }
  return NEWS.promise;
}

/* Se il JSON non c'è (offline, file:// …) la scheda letta dalla pagina basta per aprire il dossier. */
function storyFromDom(id) {
  const el = $(`[data-id="${cssId(id)}"]`);
  if (!el) return null;
  const a = $("a[data-story]", el);
  const img = $("img", el);
  const kick = $(".kicker", el);
  const time = $("time[datetime]", el);
  const src = $(".meta__src", el);
  const own = $(".brief--own", el);
  const plain = $(".brief:not(.brief--own)", el);
  return {
    id, title: (a ? a.textContent : el.textContent).trim(), link: a ? a.href : "",
    source: src ? src.textContent : "", ts: time ? time.getAttribute("datetime") : "",
    section: el.dataset.c || "", kicker: kick && kick.firstChild ? kick.firstChild.textContent : "",
    image: img ? img.currentSrc || img.src : "", brief: own ? own.textContent.trim() : "", summary: plain ? plain.textContent.trim() : "",
    sources: [], items: [], related: [], live: !!$(".badge--live", el), _from: "dom",
  };
}
function storyFromLog(id) {
  const e = store.log().find((x) => x.id === id);
  if (!e) return null;
  return { id, title: e.ti, link: e.l, source: e.s, ts: e.p || new Date(e.t).toISOString(), section: e.c, kicker: e.k, image: e.i,
    brief: "", summary: e.b, sources: [], items: [], related: [], _from: "log", _readAt: e.t };
}
const getStory = (id) => NEWS.byId.get(id) || storyFromDom(id) || storyFromLog(id);

/* Le tue squadre: chi segui (squadre, piloti, atleti). Le sue notizie salgono in cima alla prima pagina, nelle sezioni
   c'è il filtro «Le mie» e nel dossier si segue con un tocco. Come la cronologia vive solo in localStorage: nessun
   account, nessun server. */
const follow = (() => {
  const KEY = "sw:squadre:v1", MAX = 24;
  /* Chi si segue con un tocco: [nome, parole che lo indicano nei titoli]. Si cercano parole intere e senza accenti,
     così Milan non prende Milano e Inter non prende intervista. Chiunque altro si aggiunge scrivendone il nome. */
  const CATALOG = [
    ["Inter", "inter|nerazzurri|!inter miami"], ["Milan", "milan|rossoneri"], ["Juventus", "juventus|juve|bianconeri"],
    ["Napoli", "napoli|!napoli basket"], ["Roma", "roma|giallorossi|!bc roma|!virtus roma|!maxima roma"], ["Lazio", "lazio|biancocelesti"], ["Atalanta", "atalanta"],
    ["Fiorentina", "fiorentina"], ["Bologna", "bologna|!virtus bologna|!virtus costa bologna|!fortitudo bologna|!milano bologna"],
    ["Torino", "torino|granata|!reale mutua torino"], ["Genoa", "genoa"],
    ["Como", "como"], ["Udinese", "udinese"], ["Parma", "parma"], ["Cagliari", "cagliari"], ["Lecce", "lecce"],
    ["Sassuolo", "sassuolo"], ["Verona", "verona|hellas"], ["Cremonese", "cremonese"], ["Pisa", "pisa"],
    ["Sampdoria", "sampdoria|samp|blucerchiati"], ["Palermo", "palermo"],
    ["Italia", "italia|azzurri|azzurre|italbasket|italvolley|!coppa italia|!rally italia|!giro d italia|!supercoppa italiana"],
    ["Sinner", "sinner"], ["Alcaraz", "alcaraz"], ["Musetti", "musetti"], ["Cobolli", "cobolli"], ["Paolini", "paolini"],
    ["Djokovic", "djokovic"], ["Ferrari", "ferrari"], ["Leclerc", "leclerc"], ["Hamilton", "hamilton"],
    ["Antonelli", "antonelli|kimi antonelli"], ["Verstappen", "verstappen"], ["Bagnaia", "bagnaia|pecco"],
    ["Marquez", "marquez"], ["Bezzecchi", "bezzecchi"], ["Ducati", "ducati"], ["Pogacar", "pogacar"], ["Ganna", "ganna"],
    ["Olimpia Milano", "olimpia milano|olimpia"], ["Virtus Bologna", "virtus"],
  ];
  const catalog = new Map(CATALOG.map(([label, t]) => [norm(label), t]));
  /* «!frase»: da togliere prima di cercare (Coppa Italia non è l'Italia, Virtus Bologna non è il Bologna) */
  const termsOf = (label) => {
    const raw = (catalog.get(norm(label)) || label).split("|");
    const w = (xs) => xs.map((x) => norm(x)).filter(Boolean).map((x) => ` ${x} `);
    return { pos: w(raw.filter((x) => !x.startsWith("!"))), neg: w(raw.filter((x) => x.startsWith("!")).map((x) => x.slice(1))) };
  };
  const hay = (st) => st._fw || (st._fw = ` ${norm(`${st.title} ${st.kicker || ""} ${(st.items || []).map((i) => i.title).join(" ")}`)} `);
  const hits = (st, terms) => {
    let h = hay(st);
    for (const n of terms.neg) h = h.split(n).join("   ");
    return terms.pos.some((t) => h.includes(t));
  };

  function read() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || "null");
      if (j && j.v === 1 && Array.isArray(j.list)) return { v: 1, list: j.list.filter((x) => typeof x === "string").slice(0, MAX), later: Number(j.later) || 0 };
    } catch { /* dati rovinati: si riparte */ }
    return { v: 1, list: [], later: 0 };
  }
  let s = read(), editing = false;
  const emit = () => document.dispatchEvent(new CustomEvent("sw:follow"));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota o navigazione privata: resta in memoria */ } emit(); };
  addEventListener("storage", (e) => { if (e.key === KEY) { s = read(); emit(); } });

  const list = () => s.list.map((label) => ({ label, terms: termsOf(label) }));
  const has = (label) => s.list.some((l) => norm(l) === norm(label));
  function toggle(label) {
    label = String(label || "").replace(/\s+/g, " ").trim().slice(0, 32);
    if (!norm(label)) return;
    s.list = has(label) ? s.list.filter((l) => norm(l) !== norm(label)) : [...s.list, label].slice(-MAX);
    save();
  }
  const mine = (st, fs = list()) => fs.length > 0 && fs.some((f) => hits(st, f.terms));
  const stories = () => {
    if (!NEWS.ready || !s.list.length) return [];
    const fs = list();
    return NEWS.data.stories.filter((st) => mine(st, fs)).sort((a, b) => b._t - a._t);
  };
  /* nomi del catalogo di cui si parla oggi, dal più presente */
  const suggest = (n) => (NEWS.ready ? CATALOG.map(([label]) => ({ label, n: NEWS.data.stories.filter((st) => hits(st, termsOf(label))).length }))
    .filter((x) => x.n > 0 && !has(x.label)).sort((a, b) => b.n - a.n).slice(0, n) : []);
  /* chi compare in questa notizia (per «Segui» nel dossier): il catalogo e i nomi già seguiti */
  function spotted(st) {
    const out = CATALOG.map(([label]) => label).filter((label) => hits(st, termsOf(label)));
    s.list.forEach((l) => { if (!out.some((x) => norm(x) === norm(l)) && hits(st, termsOf(l))) out.push(l); });
    return out.slice(0, 4);
  }

  const toggleBtn = (label, extra = "") => `<button type="button" class="chip chip--follow" data-follow-toggle="${esc(label)}" aria-pressed="${has(label)}"><span class="chip__star" aria-hidden="true">${has(label) ? "★" : "☆"}</span>${esc(label)}${extra}</button>`;
  const chips = (st) => {
    const names = spotted(st);
    return names.length ? `<div class="follow-chips"><span class="follow-chips__label">Segui</span>${names.map((l) => toggleBtn(l)).join("")}</div>` : "";
  };
  const item = (st) => `<li class="follow__item" data-id="${esc(st.id)}"><p class="kicker">${esc(secName(st.section))}${st.kicker && st.kicker !== secName(st.section) ? `<span class="kicker__sub">${esc(st.kicker)}</span>` : ""}</p>
      <a class="follow__t stretch" href="${esc(st.link)}" data-story="${esc(st.id)}">${esc(st.title)}</a>
      <p class="meta"><span class="meta__src">${esc(st.source)}</span><time datetime="${esc(st.ts)}" data-rel>${esc(relTime(st.ts))}</time>${st.brief ? '<span class="meta__own">✦ in breve</span>' : ""}</p></li>`;

  /* — il riquadro in prima pagina: invito (prima volta), scelta (Modifica), oppure le notizie — */
  function paintHome() {
    const box = $("[data-follow]");
    if (!box || !NEWS.ready) return;
    const fs = list();
    const choosing = editing || (!fs.length && (!s.later || Date.now() - s.later > 7 * 864e5));   // «Non ora» vale una settimana
    let html = "";
    if (choosing) {
      const sug = suggest(editing ? 12 : 8);
      html = `<div class="follow__head"><h2 class="follow__title" id="h-follow">Le tue squadre</h2>
        <p class="follow__note">${fs.length || editing ? "Tocca per seguire o smettere di seguire, oppure scrivi un nome." : "Scegli chi segui: le sue notizie arrivano qui, in cima. Restano solo su questo dispositivo."}</p></div>
        <div class="follow__chips">${fs.map((f) => toggleBtn(f.label)).join("")}${sug.map((x) => toggleBtn(x.label, `<span class="chip__n">${x.n}</span>`)).join("")}</div>
        <form class="follow__add" data-follow-add><input class="follow__input" name="q" type="text" maxlength="32" list="follow-names" placeholder="Un altro nome…" aria-label="Aggiungi chi segui" autocomplete="off" enterkeyhint="done"><button class="btn btn--quiet" type="submit">Segui</button>
        <datalist id="follow-names">${CATALOG.map(([l]) => `<option value="${esc(l)}"></option>`).join("")}</datalist></form>
        <div class="follow__foot">${fs.length || editing ? '<button type="button" class="btn btn--primary" data-follow-done>Fatto</button>' : '<button type="button" class="follow__link" data-follow-later>Non ora</button>'}</div>`;
    } else if (fs.length) {
      const all = stories(), top = all.slice(0, 6);
      html = `<div class="follow__head"><h2 class="follow__title" id="h-follow">Le tue squadre</h2>
        <p class="follow__note">${fs.map((f) => esc(f.label)).join(" · ")} — ${all.length ? `<b>${all.length} ${all.length === 1 ? "notizia" : "notizie"}</b> nelle ultime ore` : "oggi nessuna notizia"}</p>
        <button type="button" class="follow__link" data-follow-edit>Modifica</button></div>
        ${top.length ? `<ul class="follow__list">${top.map(item).join("")}</ul>` : ""}
        ${all.length > top.length ? `<button type="button" class="follow__link" data-follow-all>Leggile tutte (${all.length}) →</button>` : ""}`;
    }
    const typing = box.contains(document.activeElement) && document.activeElement.matches(".follow__input");
    box.innerHTML = html;
    box.hidden = !html;
    if (typing) { const i = $(".follow__input", box); if (i) i.focus(); }
  }

  /* — segno ★ sulle notizie di chi segui, ovunque — */
  function paintMarks() {
    if (!NEWS.ready) return;
    const fs = list();
    $$("[data-id]").forEach((n) => { const st = NEWS.byId.get(n.dataset.id); n.classList.toggle("is-mine", !!st && mine(st, fs)); });
  }

  /* — filtro «Le mie» nelle pagine di sezione (compare solo se c'è qualcosa da mostrare) — */
  function sectionChip() {
    const bar = $(".chips");
    if (!bar || !NEWS.ready) return;
    const n = $$("[data-hit][data-k]").filter((x) => x.classList.contains("is-mine")).length;
    let chip = $('[data-filter="__mine"]', bar);
    if (!n) {
      if (chip) { if (chip.getAttribute("aria-pressed") === "true") $('[data-filter="*"]', bar).click(); chip.remove(); }
      return;
    }
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button"; chip.className = "chip chip--mine"; chip.dataset.filter = "__mine"; chip.setAttribute("aria-pressed", "false");
      $('[data-filter="*"]', bar).after(chip);
    }
    chip.innerHTML = `<span class="chip__star" aria-hidden="true">★</span>Le mie<span class="chip__n">${n}</span>`;
  }

  function paintToggles() {
    $$("[data-follow-toggle]").forEach((b) => {
      const on = has(b.dataset.followToggle);
      b.setAttribute("aria-pressed", String(on));
      const star = $(".chip__star", b);
      if (star) star.textContent = on ? "★" : "☆";
    });
  }

  function paint() { paintHome(); paintMarks(); sectionChip(); paintToggles(); }
  document.addEventListener("sw:news", paint);
  document.addEventListener("sw:follow", paint);

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-follow-toggle]");
    if (t) {
      e.preventDefault();
      if (t.closest("[data-follow]")) editing = true;          // scelta in corso: il riquadro resta aperto finché non si preme «Fatto»
      toggle(t.dataset.followToggle);
      return;
    }
    if (e.target.closest("[data-follow-edit]")) { editing = true; paintHome(); const c = $("[data-follow] .chip"); if (c) c.focus(); return; }
    if (e.target.closest("[data-follow-done]")) { editing = false; paintHome(); const b = $("[data-follow] .follow__link, [data-follow] a"); if (b) b.focus(); return; }
    if (e.target.closest("[data-follow-later]")) { s.later = Date.now(); save(); return; }
    if (e.target.closest("[data-follow-all]")) { const ids = stories().map((x) => x.id); if (ids.length) reader.open(ids[0], ids); return; }
    const a = e.target.closest("[data-follow] a[data-story]");
    if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button)) { e.preventDefault(); reader.open(a.dataset.story, stories().map((x) => x.id)); }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-follow-add]");
    if (!f) return;
    e.preventDefault();
    const inp = $(".follow__input", f);
    const v = inp.value.trim();
    editing = true;
    if (v && !has(v)) toggle(v); else paintHome();
    inp.value = "";
  });

  return { chips, stories, mine: (st) => mine(st), paint, count: () => s.list.length };
})();

/* Il dossier: la notizia letta dentro Sportwire (foto, in breve, ora per ora, storie collegate).
   URL profondo #/s/<id>: il tasto Indietro lo chiude, il link si può condividere con se stessi.
   Si scorre con ← → (o j k, o un tocco laterale sul telefono); «Ascolta» legge il breve con la voce italiana del dispositivo. */
const reader = (() => {
  let el, sheet, scroller, posEl, prevBtn, nextBtn;
  let list = [], current = null, lastFocus = null, isOpen = false;
  let sx = 0, sy = 0, st = 0, tracking = false;
  const tts = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function" ? speechSynthesis : null;
  let speaking = false, said = null;

  const parse = () => { const m = /^#\/s\/([0-9a-f]{8})$/.exec(location.hash); return m ? m[1] : null; };
  const hashFor = (id) => `#/s/${id}`;
  const clean = () => history.replaceState(null, "", location.pathname + location.search);

  function build() {
    el = document.createElement("div");
    el.className = "reader";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Dossier della notizia");
    el.innerHTML = `<div class="reader__scrim" data-close></div>
      <div class="reader__sheet" tabindex="-1">
        <div class="reader__top">
          <p class="reader__pos" data-pos></p>
          <div class="reader__nav">
            <button type="button" class="tool" data-prev aria-label="Notizia precedente" title="Precedente ( ← )">${ICON_PREV}</button>
            <button type="button" class="tool" data-next aria-label="Notizia successiva" title="Successiva ( → )">${ICON_NEXT}</button>
            <button type="button" class="tool" data-close aria-label="Chiudi" title="Chiudi ( Esc )">${ICON_X}</button>
          </div>
        </div>
        <div class="reader__scroll" data-scroll></div>
      </div>`;
    document.body.append(el);
    sheet = $(".reader__sheet", el);
    scroller = $("[data-scroll]", el);
    posEl = $("[data-pos]", el);
    prevBtn = $("[data-prev]", el);
    nextBtn = $("[data-next]", el);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return close();
      if (e.target.closest("[data-prev]")) return step(-1);
      if (e.target.closest("[data-next]")) return step(1);
      if (e.target.closest("[data-listen]")) return toggleListen();
      const a = e.target.closest("a[data-goto]");
      if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) { e.preventDefault(); open(a.dataset.goto, null); return; }
      const out = e.target.closest("a[data-visit]");
      if (out && current) store.open(current, "o");
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "ArrowLeft" && !e.altKey && !e.metaKey) { e.preventDefault(); step(-1); return; }
      if (e.key === "ArrowRight" && !e.altKey && !e.metaKey) { e.preventDefault(); step(1); return; }
      if ((e.key === "j" || e.key === "k") && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); step(e.key === "j" ? 1 : -1); return; }
      trapTab(sheet, e);
    });
    /* col dito: un colpo laterale netto passa alla notizia dopo o prima (il bordo sinistro resta al gesto «indietro» di iOS) */
    sheet.addEventListener("pointerdown", (e) => { tracking = e.pointerType === "touch" && e.clientX > 28; sx = e.clientX; sy = e.clientY; st = e.timeStamp; });
    sheet.addEventListener("pointerup", (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6 && e.timeStamp - st < 800) step(dx < 0 ? 1 : -1);
    });
    sheet.addEventListener("pointercancel", () => { tracking = false; });
  }

  /* — Ascolta: sintesi vocale del dispositivo, solo con una voce italiana locale (niente voci in rete) — */
  const voice = () => {
    if (!tts) return null;
    const it = tts.getVoices().filter((v) => /^it([-_]|$)/i.test(v.lang) && v.localService);
    return it.find((v) => v.default) || it[0] || null;
  };
  function paintListen() {
    const b = scroller && $("[data-listen]", scroller);
    if (!b) return;
    b.hidden = !voice() || !b.dataset.text;
    b.setAttribute("aria-pressed", String(speaking));
    b.innerHTML = `${speaking ? ICON_STOP : ICON_PLAY}<span>${speaking ? "Ferma" : "Ascolta"}</span>`;
  }
  function stopListen() {
    if (tts && speaking) tts.cancel();
    speaking = false; said = null;
    paintListen();
  }
  function toggleListen() {
    if (!tts || !current) return;
    if (speaking) return stopListen();
    const v = voice();
    if (!v) return;
    const title = String(current.title || "").trim();
    const body = String(current.brief || current.summary || "").trim();
    try {
      const u = new SpeechSynthesisUtterance(`${title}${/[.!?…»”]$/.test(title) ? " " : ". "}${body}`.trim());
      u.voice = v; u.lang = v.lang;
      const end = () => { if (said === u) { speaking = false; said = null; paintListen(); } };
      u.onend = end; u.onerror = end;
      said = u; speaking = true;
      tts.cancel(); tts.speak(u);
    } catch { speaking = false; said = null; }          // il browser rifiuta la voce: il pulsante resta com'era
    paintListen();
  }
  if (tts) { tts.addEventListener("voiceschanged", paintListen); addEventListener("pagehide", stopListen); }

  const photo = (s) => (s.image ? `<div class="reader__photo media"><img src="${esc(s.image)}" alt="" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('is-loaded')" onerror="this.parentNode.remove()"></div>` : "");

  function chrono(s) {
    const items = (s.items || []).slice().sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    if (items.length < 2) return "";
    return `<section aria-labelledby="rd-h"><h3 id="rd-h">Come l’hanno raccontata, ora per ora</h3><ol class="chrono">${items.map((i) =>
      `<li><time datetime="${esc(i.ts)}">${hhmm(new Date(i.ts))}</time><a href="${esc(i.link)}" target="_blank" rel="noopener" data-visit><b>${esc(i.source)}</b><span>${esc(i.title)}</span></a></li>`).join("")}</ol></section>`;
  }
  function related(s) {
    const rel = (s.related || []).map((id) => NEWS.byId.get(id)).filter(Boolean);
    if (!rel.length) return "";
    return `<section aria-labelledby="rd-r"><h3 id="rd-r">Storie collegate</h3><div class="mini">${rel.map((r) =>
      `<a href="${hashFor(r.id)}" data-goto="${esc(r.id)}"><strong>${esc(r.title)}</strong><span class="meta"><span class="meta__src">${esc(r.source)}</span><time datetime="${esc(r.ts)}">${esc(relTime(r.ts))}</time></span></a>`).join("")}</div></section>`;
  }

  /* Cosa dire del riassunto, a seconda dello stato che calcola build.py (brief_state). Le promesse devono essere vere:
     «in arrivo» solo se il cron la riscriverà davvero; per dirette e video si dice perché non c'è. */
  const NOTE = {
    own: "Riassunto scritto da Sportwire leggendo le testate che ne parlano. Per i dettagli c’è l’articolo originale.",
    wait: "Il riassunto di Sportwire è in coda: si scrivono due volte l’ora, prima le notizie in prima pagina. Intanto c’è il sommario della testata.",
    skip: "Per questa notizia basta il sommario della testata: l’articolo non aggiunge altro da riassumere.",
    live: "È una diretta: cambia di minuto in minuto, quindi non si riassume finché non è finita. Seguila sulla testata.",
    video: "È un video: si guarda sulla testata.",
  };
  function box(s) {
    const own = !!s.brief;
    const state = own ? "own" : (s.brief_state || "wait");
    const text = s.brief || s.summary || "";
    const label = own ? "In breve · Sportwire" : state === "live" ? "Diretta · dalla testata" : state === "video" ? "Video · dalla testata" : "Dalla testata";
    const note = NOTE[state] || NOTE.wait;
    if (!text) return `<div class="reader__box reader__box--${state}"><p class="eyebrow">${label}</p><p class="reader__note">${note}</p></div>`;
    return `<div class="reader__box reader__box--${state}"><p class="eyebrow">${own ? ICON_SPARK : ""}${label}</p><p class="reader__brief${own ? "" : " reader__brief--src"}">${esc(text)}</p><p class="reader__note">${note}</p></div>`;
  }

  function render(s) {
    const others = (s.sources || []).filter((x) => x !== s.source);
    const watch = s.video || s.brief_state === "video";
    scroller.innerHTML = `${photo(s)}<div class="reader__body">
      <div><p class="kicker">${esc(secName(s.section))}${s.kicker && s.kicker !== secName(s.section) ? `<span class="kicker__sub">${esc(s.kicker)}</span>` : ""}${s.live ? '<span class="badge badge--live">Diretta</span>' : ""}</p>
      <h2 class="reader__title" id="rd-title">${esc(s.title)}</h2></div>
      <p class="meta"><span class="meta__src">${esc(s.source)}</span><time datetime="${esc(s.ts)}">${esc(relTime(s.ts))}</time>${others.length ? `<span class="meta__more">+${others.length} ${others.length === 1 ? "testata" : "testate"}: ${esc(others.join(", "))}</span>` : ""}</p>
      ${box(s)}
      <div class="reader__actions">
        <a class="btn btn--primary" href="${esc(s.link)}" target="_blank" rel="noopener" data-visit>${watch ? "Guarda" : s.live ? "Segui" : "Leggi"} su ${esc(s.source || "la testata")} ${ICON_OUT}</a>
        <button type="button" class="btn btn--quiet" data-listen data-text="${s.brief || s.summary ? "1" : ""}" aria-pressed="false" hidden>${ICON_PLAY}<span>Ascolta</span></button>
      </div>
      ${follow.chips(s)}
      ${chrono(s)}${related(s)}
    </div>`;
    scroller.scrollTop = 0;
    paintListen();
  }

  function updateNav() {
    const i = list.indexOf(current.id);
    posEl.textContent = list.length > 1 && i >= 0 ? `${i + 1} di ${list.length}` : "Dossier";
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i < 0 || i >= list.length - 1;
  }

  /* La foto della scheda vola nella foto del dossier: un solo elemento condiviso (stesso nome) tra i due stati. */
  const PHOTO = "story-photo";
  const fliesFrom = (n) => {
    if (!canVT || !n || !n.isConnected) return false;
    const r = n.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  function morph(from, update) {
    from.style.viewTransitionName = PHOTO;
    const clear = () => { from.style.viewTransitionName = ""; const p = scroller && $(".reader__photo", scroller); if (p) p.style.viewTransitionName = ""; };
    const t = withVT(() => {
      from.style.viewTransitionName = "";
      update();
      const p = $(".reader__photo", scroller);
      if (p) p.style.viewTransitionName = PHOTO;
    }, "vt-open");
    if (t) t.finished.then(clear, clear); else clear();
  }

  function show(id, ids, from) {
    const s = getStory(id);
    if (!s) return false;
    if (!el) build();
    if (ids && ids.length) list = ids;
    else if (!list.includes(id)) list = pageIds(id);
    if (speaking && (!current || current.id !== s.id)) stopListen();
    const first = !isOpen;
    current = s;
    const paint = () => {
      if (current !== s) return;                        // nel frattempo si è passati a un'altra notizia: la sua paint disegnerà
      render(s); updateNav();
      const im = $(".reader__photo img", scroller);     // già in cache: subito visibile, così la foto che vola non arriva vuota
      if (im && im.complete && im.naturalWidth) im.classList.add("is-loaded");
    };
    el.setAttribute("aria-labelledby", "rd-title");
    if (first) {
      lastFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      isOpen = true;
      const openIt = () => {
        if (!isOpen) return;                          // chiuso prima che la transizione partisse
        paint();
        modal.lock();
        el.classList.add("is-open");
        sheet.focus({ preventScroll: true });
      };
      if (fliesFrom(from)) morph(from, openIt); else openIt();
      requestAnimationFrame(() => { if (isOpen && !el.contains(document.activeElement)) sheet.focus({ preventScroll: true }); });
    } else if (canVT) withVT(paint, "vt-step");
    else paint();
    document.title = `${s.title} · Sportwire`;
    store.open(s, "d");
    return true;
  }

  function hide() {
    if (!isOpen) return;
    stopListen();
    isOpen = false;
    el.classList.remove("is-open");
    modal.unlock();
    current = null;
    document.title = document.body.dataset.title || document.title;
    const f = lastFocus; lastFocus = null;
    if (f && document.contains(f)) f.focus({ preventScroll: true });
  }

  /* Ordine delle notizie in pagina: è la sequenza di "successiva" / "precedente". */
  function pageIds(also) {
    const ids = [...new Set($$("[data-id]:not([hidden])").map((n) => n.dataset.id))];
    if (also && !ids.includes(also)) ids.push(also);
    return ids;
  }

  function open(id, ids, from) {
    if (!ID_RX.test(id)) return false;
    if (!document.body.dataset.title) document.body.dataset.title = document.title;
    if (!show(id, ids, from)) return false;
    if (parse() !== id) history.pushState({ sw: 1 }, "", hashFor(id));
    return true;
  }
  function close() {
    if (!isOpen) return;
    if (history.state && history.state.sw && parse()) history.back();
    else { clean(); hide(); }
  }
  function step(d) {
    if (!current) return;
    const i = list.indexOf(current.id);
    const n = list[i + d];
    if (i < 0 || !n) return;
    if (show(n)) history.replaceState({ sw: 1 }, "", hashFor(n));
  }

  const sync = () => {
    const id = parse();
    if (id && (!current || current.id !== id)) {
      if (!show(id)) { loadNews().then(() => { if (parse() === id && !show(id)) { clean(); hide(); } }).catch(() => { clean(); hide(); }); }
    } else if (!id && isOpen) hide();
  };
  addEventListener("popstate", sync);
  addEventListener("hashchange", sync);

  return { open, close, step, sync, isOpen: () => isOpen };
})();

/* Cerca tra le notizie dell'edizione ( / oppure ⌘K ). Tocca solo dati già scaricati: nessuna richiesta a terzi. */
const finder = (() => {
  let el, input, listEl, results = [], sel = 0, isOpen = false, lastFocus = null;

  function build() {
    el = document.createElement("div");
    el.className = "finder";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Cerca tra le notizie");
    el.innerHTML = `<div class="finder__scrim" data-close></div>
      <div class="finder__box">
        <div class="finder__field">${ICON_SEARCH}
          <input class="finder__input" type="search" placeholder="Cerca una squadra, un pilota, una notizia…" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="finder-list" aria-label="Cerca">
          <kbd class="finder__esc" data-close>ESC</kbd>
        </div>
        <div class="finder__list" id="finder-list" role="listbox" aria-label="Risultati"></div>
      </div>`;
    document.body.append(el);
    input = $("input", el);
    listEl = $(".finder__list", el);
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return close();
      const hit = e.target.closest(".hit");
      if (hit) pick(hit.dataset.id);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); if (results[sel]) pick(results[sel].id); }
      else trapTab(el, e);
    });
    input.addEventListener("input", () => run(input.value));
  }

  const allStories = () => (NEWS.ready ? NEWS.data.stories : $$("[data-id]").map((n) => storyFromDom(n.dataset.id)).filter(Boolean));

  function score(s, toks) {
    let sc = 0;
    for (const t of toks) {
      let hit = 0;
      if (s._nt && s._nt.includes(t)) hit = 6 + (s._nt.startsWith(t) || s._nt.includes(" " + t) ? 2 : 0);
      else if (s._nk && s._nk.includes(t)) hit = 4;
      else if (s._ni && s._ni.includes(t)) hit = 3;
      else if (s._nb && s._nb.includes(t)) hit = 2;
      if (!hit) return 0;
      sc += hit;
    }
    return sc + Math.min(3, (s.score || 0) / 6);
  }

  /* Evidenzia i termini cercati ignorando accenti e maiuscole; indici riportati sul testo originale. */
  const mark = (title, toks) => {
    const chars = [...title];
    let plain = "";
    const map = [];
    chars.forEach((c, i) => {
      const b = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      for (const x of b) { plain += x; map.push(i); }
    });
    const on = new Array(chars.length).fill(false);
    for (const t of toks) {
      if (t.length < 2) continue;
      let from = 0, at;
      while ((at = plain.indexOf(t, from)) >= 0) {
        for (let k = at; k < at + t.length; k++) on[map[k]] = true;
        from = at + t.length;
      }
    }
    let out = "", open = false;
    chars.forEach((c, i) => {
      if (on[i] && !open) { out += "<mark>"; open = true; }
      if (!on[i] && open) { out += "</mark>"; open = false; }
      out += esc(c);
    });
    return out + (open ? "</mark>" : "");
  };

  function hitHtml(s, i, toks, ranges) {
    const title = ranges !== undefined ? fuzzy.mark(s.title, ranges) : toks.length ? mark(s.title, toks) : esc(s.title);
    return `<button type="button" class="hit" role="option" id="hit-${i}" data-id="${esc(s.id)}" aria-selected="${i === sel}">
      <span class="hit__t">${title}</span>
      <span class="hit__m">${esc(secName(s.section))} · ${esc(s.source)} · ${esc(relTime(s.ts))}${store.has(s.id) ? " · già letta" : ""}</span></button>`;
  }

  function run(q) {
    const toks = norm(q).split(" ").filter(Boolean);
    let html = "";
    results = [];
    if (!toks.length) {
      const seen = new Set();
      const recent = store.log().filter((e) => !seen.has(e.id) && seen.add(e.id)).slice(0, 4).map((e) => getStory(e.id)).filter(Boolean);
      const mineS = follow.stories().filter((s) => !seen.has(s.id) && seen.add(s.id)).slice(0, 4);
      const top = allStories().filter((s) => !seen.has(s.id)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6);
      let i = 0;
      const group = (label, arr) => {
        if (!arr.length) return "";
        results.push(...arr);
        return `<p class="finder__group">${label}</p>` + arr.map((s) => hitHtml(s, i++, [])).join("");
      };
      html = group("Le tue ultime letture", recent) + group("Le tue squadre", mineS) + group("In apertura", top);
      if (!NEWS.ready) html += '<p class="finder__empty">Carico le notizie…</p>';
    } else {
      const stories = allStories();
      const exact = stories.map((s) => [score(s, toks), s]).filter(([sc]) => sc > 0)
        .sort((a, b) => b[0] - a[0] || (b[1]._t || 0) - (a[1]._t || 0)).slice(0, 30).map(([, s]) => s);
      /* Poche risposte esatte: si prova con i refusi («pogachar», «orsatto»), sui soli titoli. */
      let near = [];
      if (exact.length < 4) {
        const have = new Set(exact.map((s) => s.id));
        near = fuzzy.find(stories.map((s) => s.title), q.trim(), 8).filter((m) => !have.has(stories[m.i].id)).map((m) => ({ s: stories[m.i], ranges: m.ranges }));
      }
      results = exact.concat(near.map((n) => n.s));
      let i = 0;
      html = (exact.length ? `<p class="finder__group">${exact.length} ${exact.length === 1 ? "risultato" : "risultati"}</p>` + exact.map((s) => hitHtml(s, i++, toks)).join("") : "")
        + (near.length ? `<p class="finder__group">${exact.length ? "Anche" : "Forse cercavi"}</p>` + near.map((n) => hitHtml(n.s, i++, toks, n.ranges)).join("") : "");
      if (!results.length) html = `<p class="finder__empty">Niente per “${esc(q.trim())}” nelle ultime ore. Prova con un cognome o una squadra.</p>`;
    }
    sel = 0;
    listEl.innerHTML = html;
    paint();
  }

  function paint() {
    $$(".hit", listEl).forEach((h, i) => h.setAttribute("aria-selected", String(i === sel)));
    const cur = $$(".hit", listEl)[sel];
    if (cur) { input.setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }
  function move(d) { if (!results.length) return; sel = (sel + d + results.length) % results.length; paint(); }

  function pick(id) {
    const ids = results.map((s) => s.id);
    close(true);
    reader.open(id, ids.length > 1 ? ids : null);
  }

  function openIt() {
    if (isOpen) return;
    if (!el) build();
    lastFocus = document.activeElement;
    isOpen = true;
    modal.lock();
    el.classList.add("is-open");
    input.value = "";
    run("");
    requestAnimationFrame(() => input.focus());
    if (!NEWS.ready) loadNews().then(() => { if (isOpen) run(input.value); }).catch(() => {});
  }
  function close(skipFocus) {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove("is-open");
    modal.unlock();
    if (!skipFocus && lastFocus && lastFocus !== document.body && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    /* il focus non deve restare nel campo nascosto: il «/» dopo finirebbe scritto lì invece di riaprire la ricerca */
    if (el.contains(document.activeElement)) document.activeElement.blur();
  }
  return { open: openIt, close, isOpen: () => isOpen };
})();

/* Il cielo: ogni notizia è una stella. Asse x = ora di pubblicazione, corsie = sport, grandezza = quante redazioni ne parlano. */
const sky = (() => {
  const LANE_MIN = 84, GAP = 3;
  /* posizioni di prova attorno al punto vero, dalla più vicina: spostamenti orizzontali piccoli prima di salire di livello */
  const CANDS = (() => {
    const out = [];
    for (const dy of [0, -9, 9, -18, 18, -27, 27, -36, 36, -45, 45, -54, 54, -63, 63, -72, 72]) {
      for (const dx of [0, -6, 6, -12, 12, -18, 18]) out.push([dx, dy]);
    }
    return out.sort((a, b) => Math.hypot(a[0] * 1.15, a[1]) - Math.hypot(b[0] * 1.15, b[1]));
  })();
  let root, stage, frame, peek, canvas, svg, stars = [], byLane = new Map(), selected = null, hovered = null, drawn = false;

  const labW = () => (matchMedia("(max-width: 640px)").matches ? 82 : 112);
  const pxPerHour = () => (matchMedia("(max-width: 640px)").matches ? 46 : 58);

  function layout(data) {
    const t1 = Math.max(Date.parse(data.generated), ...data.stories.map((s) => s._t)) + 25 * 60e3;
    const t0 = t1 - data.window_hours * 3600e3;
    const lab = labW();
    const plotW = Math.round(data.window_hours * pxPerHour());
    const order = Object.keys(SECTIONS);
    const lanes = order.filter((k) => data.stories.some((s) => s.section === k));
    const pos = new Map();
    const heights = [];
    lanes.forEach((k) => {
      const ss = data.stories.filter((s) => s.section === k && s._t >= t0).sort((a, b) => a._t - b._t);
      const placed = [];
      ss.forEach((s) => {
        const d = 6 + Math.min(16, Math.max(0, s.score || 0) * 1.05);
        const x = lab + ((s._t - t0) / (t1 - t0)) * plotW;
        const cand = CANDS.map(([dx, dy]) => [x + dx, dy]);
        let px = x, y = 0;
        for (const [cx, cy] of cand) {
          if (placed.every((p) => Math.hypot(p.x - cx, p.y - cy) >= (p.d + d) / 2 + GAP)) { px = cx; y = cy; break; }
        }
        if (px === x && y === 0 && !placed.every((p) => Math.hypot(p.x - x, p.y) >= (p.d + d) / 2 + GAP)) {
          /* nube molto fitta: scala in verticale finché trova posto */
          for (let k3 = 1; k3 < 80; k3++) {
            const yy = (k3 % 2 ? 1 : -1) * Math.ceil(k3 / 2) * 9;
            if (placed.every((p) => Math.hypot(p.x - x, p.y - yy) >= (p.d + d) / 2 + GAP)) { y = yy; break; }
          }
        }
        placed.push({ s, x: px, y, d });
      });
      const lo = Math.min(0, ...placed.map((p) => p.y - p.d / 2)), hi = Math.max(0, ...placed.map((p) => p.y + p.d / 2));
      const h = Math.max(LANE_MIN, hi - lo + 44);
      heights.push(h);
      placed.forEach((p) => { p.dy = -(lo + hi) / 2; });
      pos.set(k, placed);
    });
    return { t0, t1, lab, plotW, lanes, pos, heights };
  }

  function build(data) {
    const L = layout(data);
    const H = L.heights.reduce((a, b) => a + b, 0);
    const W = L.lab + L.plotW + 24;
    stage.innerHTML = "";
    canvas = document.createElement("div");
    canvas.className = "sky__canvas";
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    stage.append(canvas);
    [...frame.querySelectorAll(".sky__labels")].forEach((n) => n.remove());
    const labels = document.createElement("div");
    labels.className = "sky__labels";
    labels.style.height = `${H}px`;
    labels.setAttribute("aria-hidden", "true");
    frame.prepend(labels);

    /* corsie */
    let y0 = 0;
    const laneTop = new Map();
    L.lanes.forEach((k, i) => {
      const h = L.heights[i];
      laneTop.set(k, y0 + h / 2);
      const lane = document.createElement("div");
      lane.className = "sky__lane";
      lane.style.cssText = `top:${y0}px;height:${h}px`;
      canvas.append(lane);
      const lb = document.createElement("div");
      lb.className = "sky__label";
      lb.style.cssText = `top:${y0}px;height:${h}px`;
      lb.innerHTML = `<b>${esc(secName(k))}</b><span>${L.pos.get(k).length}</span>`;
      labels.append(lb);
      y0 += h;
    });

    /* ore */
    const first = new Date(L.t0); first.setMinutes(0, 0, 0);
    for (let t = first.getTime(); t <= L.t1; t += 3600e3) {
      const d = new Date(t);
      if (t < L.t0 || d.getHours() % 6) continue;
      const x = L.lab + ((t - L.t0) / (L.t1 - L.t0)) * L.plotW;
      const tick = document.createElement("div");
      tick.className = "sky__tick";
      tick.style.left = `${x}px`;
      tick.innerHTML = `<i>${d.getHours() === 0 ? `${GIORNI[d.getDay()].slice(0, 3)} ${d.getDate()}` : `${pad(d.getHours())}:00`}</i>`;
      canvas.append(tick);
    }
    const nowX = L.lab + ((Date.parse(data.generated) - L.t0) / (L.t1 - L.t0)) * L.plotW;
    const now = document.createElement("div");
    now.className = "sky__now";
    now.style.left = `${nowX}px`;
    now.innerHTML = `<i>edizione ${hhmm(new Date(data.generated))}</i>`;
    canvas.append(now);

    /* linee tra storie collegate, poi le stelle */
    const svgNS = "http://www.w3.org/2000/svg";
    svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "sky__lines");
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);
    svg.setAttribute("aria-hidden", "true");
    canvas.append(svg);

    stars = [];
    const at = new Map();
    let g = 0;
    L.lanes.forEach((k) => {
      L.pos.get(k).forEach((p) => {
        const s = p.s;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "star" + (s.sources.length > 1 ? " star--multi" : "") + (s.live ? " star--live" : "") + (store.has(s.id) ? " is-read" : "");
        b.style.cssText = `left:${p.x}px;top:${laneTop.get(k) + p.dy + p.y}px;--d:${p.d.toFixed(1)}px;--g:${g++ % 14}`;
        b.dataset.sid = s.id;
        b.tabIndex = -1;
        b.setAttribute("aria-label", `${s.title}. ${s.source}, ${whenLabel(s._t)}.${s.sources.length > 1 ? ` Ne scrivono ${s.sources.length} testate.` : ""}`);
        canvas.append(b);
        const rec = { s, el: b, x: p.x, y: laneTop.get(k) + p.dy + p.y, lane: k };
        stars.push(rec);
        at.set(s.id, rec);
      });
    });
    byLane = new Map(L.lanes.map((k) => [k, stars.filter((r) => r.lane === k).sort((a, b) => a.x - b.x)]));
    /* tab stop unico (roving): la stella più recente */
    const lead = stars.slice().sort((a, b) => b.s._t - a.s._t)[0];
    if (lead) lead.el.tabIndex = 0;
    return lead;
  }

  /* Apre la mappa sul "adesso": l'ultima notizia a ~88% dello schermo, così si vedono anche le ore prima. */
  function scrollToNow(lead) {
    if (!lead) { stage.scrollLeft = stage.scrollWidth; return; }
    const view = stage.clientWidth;
    stage.scrollLeft = Math.max(0, Math.min(stage.scrollWidth - view, lead.x - view * 0.88));
  }

  const rec = (id) => stars.find((r) => r.s.id === id);
  const laneIds = (lane) => (byLane.get(lane) || []).slice().sort((a, b) => b.s._t - a.s._t).map((x) => x.s.id);

  function focusOn(r, dim) {
    root.classList.toggle("is-focus", !!r && !!dim);
    stars.forEach((x) => x.el.classList.remove("is-on", "is-rel"));
    while (svg.firstChild) svg.firstChild.remove();
    if (!r) return;
    r.el.classList.add("is-on");
    (r.s.related || []).forEach((id) => {
      const o = rec(id);
      if (!o) return;
      o.el.classList.add("is-rel");
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("x1", r.x); ln.setAttribute("y1", r.y); ln.setAttribute("x2", o.x); ln.setAttribute("y2", o.y);
      svg.append(ln);
    });
  }

  function showPeek(s) {
    const own = !!s.brief;
    const text = s.brief || s.summary || "";
    peek.hidden = false;
    peek.innerHTML = `<div><p class="kicker">${esc(secName(s.section))}${s.kicker && s.kicker !== secName(s.section) ? `<span class="kicker__sub">${esc(s.kicker)}</span>` : ""}${s.live ? '<span class="badge badge--live">Diretta</span>' : ""}</p>
      <h3 class="sky__peek-title">${esc(s.title)}</h3>
      ${text ? `<p class="brief${own ? " brief--own" : ""}">${esc(text)}</p>` : ""}
      <p class="meta"><span class="meta__src">${esc(s.source)}</span><time datetime="${esc(s.ts)}">${esc(relTime(s.ts))}</time>${s.sources.length > 1 ? `<span class="meta__more">+${s.sources.length - 1} ${s.sources.length === 2 ? "testata" : "testate"}</span>` : ""}</p></div>
      <button type="button" class="btn btn--primary" data-peek-open="${esc(s.id)}">${own ? "Leggi in breve" : "Apri la notizia"}</button>`;
  }

  function select(r, byKey) {
    selected = r;
    focusOn(r);
    if (r) showPeek(r.s);
    if (r && byKey) { stars.forEach((x) => { x.el.tabIndex = x === r ? 0 : -1; }); r.el.focus({ preventScroll: false }); }
  }

  function neighbour(r, dir) {
    const ln = byLane.get(r.lane);
    const i = ln.indexOf(r);
    if (dir === "l") return ln[i - 1] || r;
    if (dir === "r") return ln[i + 1] || r;
    const lanes = [...byLane.keys()];
    const j = lanes.indexOf(r.lane) + (dir === "u" ? -1 : 1);
    const other = byLane.get(lanes[j]);
    if (!other || !other.length) return r;
    return other.reduce((best, c) => (Math.abs(c.x - r.x) < Math.abs(best.x - r.x) ? c : best), other[0]);
  }

  function init() {
    root = $("[data-sky]");
    if (!root || !NEWS.ready) return;
    stage = $("[data-sky-stage]", root);
    frame = $(".sky__frame", root);
    peek = $("[data-sky-peek]", root);
    const lead = build(NEWS.data);
    root.hidden = false;
    drawn = true;
    scrollToNow(lead);
    if (lead) { selected = lead; focusOn(lead, false); showPeek(lead.s); }

    if (!root.dataset.bound) {
      root.dataset.bound = "1";
      /* Le stelle sono puntini di 6–22px e nelle nubi stanno a pochi pixel l'una dall'altra: il bersaglio non è l'elemento
         sotto il puntatore (le aree di tocco si accavallano e vinceva la vicina) ma la stella col centro più vicino. */
      const nearest = (cx, cy, radius) => {
        const cr = canvas.getBoundingClientRect();
        if (cx < frame.getBoundingClientRect().left + labW()) return null;      // sotto i nomi delle corsie
        const x = cx - cr.left, y = cy - cr.top;
        let best = null, bd = radius;
        for (const r of stars) { const d = Math.hypot(r.x - x, r.y - y); if (d < bd) { bd = d; best = r; } }
        return best;
      };
      const unhover = () => {
        stage.classList.remove("is-pointing");
        if (!hovered) return;
        hovered = null;
        focusOn(selected, false); if (selected) showPeek(selected.s);
      };
      let raf = 0, pt = null;
      stage.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        pt = [e.clientX, e.clientY];
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = nearest(pt[0], pt[1], 18);
          if (!r) { unhover(); return; }
          stage.classList.add("is-pointing");
          if (r !== hovered) { hovered = r; focusOn(r, true); showPeek(r.s); }
        });
      });
      stage.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") unhover(); });
      let lastPT = "mouse";
      stage.addEventListener("pointerdown", (e) => { lastPT = e.pointerType || "mouse"; }, true);
      stage.addEventListener("click", (e) => {
        const b = e.target.closest(".star");
        if (e.detail === 0) { const r = b && rec(b.dataset.sid); if (r) select(r, false); return; }   // da tastiera
        const mouse = lastPT === "mouse";
        const r = nearest(e.clientX, e.clientY, mouse ? 18 : 26);
        if (!r) return;
        if (mouse || r === selected) { select(r, false); reader.open(r.s.id, laneIds(r.lane)); }
        else select(r, false);
      });
      stage.addEventListener("focusin", (e) => {
        const b = e.target.closest(".star");
        if (!b) return;
        const r = rec(b.dataset.sid);
        if (r) { stars.forEach((x) => { x.el.tabIndex = x === r ? 0 : -1; }); selected = r; focusOn(r); showPeek(r.s); }
      });
      stage.addEventListener("keydown", (e) => {
        const b = e.target.closest(".star");
        if (!b) return;
        const r = rec(b.dataset.sid);
        const dir = { ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d" }[e.key];
        if (dir) { e.preventDefault(); const n = neighbour(r, dir); if (n !== r) select(n, true); }
        else if (e.key === "Enter") { e.preventDefault(); reader.open(r.s.id, laneIds(r.lane)); }
      });
      peek.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-peek-open]");
        const r = btn && rec(btn.dataset.peekOpen);
        if (r) reader.open(r.s.id, laneIds(r.lane));
      });
      let rz;
      addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (drawn && NEWS.ready) { const keep = selected && selected.s.id, left = stage.scrollLeft; build(NEWS.data); stage.scrollLeft = left; const r = keep && rec(keep); if (r) { selected = r; focusOn(r, false); } } }, 250); });
    }
  }

  /* Le letture fanno sbiadire le stelle già viste. */
  const refresh = () => { if (!drawn) return; stars.forEach((r) => r.el.classList.toggle("is-read", store.has(r.s.id))); };
  return { init, refresh };
})();

/* Cronostoria: la pagina Cronologia, "Riprendi da qui" in prima pagina, i segni "letta" e "nuova". */
const history_ = (() => {
  const uniq = (log) => { const seen = new Set(); return log.filter((e) => !seen.has(e.id) && seen.add(e.id)); };

  /* — segni sulle schede — */
  function paintMarks() {
    $$("[data-id]").forEach((n) => n.classList.toggle("is-read", store.has(n.dataset.id)));
    const prev = store.prevSeen();
    if (!prev || !NEWS.ready) return;
    $$("[data-id]").forEach((n) => {
      const s = NEWS.byId.get(n.dataset.id);
      const k = $(".kicker", n);
      if (!s || !k || $(".new-dot", k) || store.has(s.id) || s._t <= prev) return;
      const d = document.createElement("i");
      d.className = "new-dot"; d.title = "Nuova dall’ultima visita"; d.setAttribute("role", "img"); d.setAttribute("aria-label", "Nuova dall’ultima visita");
      k.append(d);
    });
  }

  function paintCount() {
    const n = store.count();
    $$("[data-hist-count]").forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n); });
  }

  /* — Riprendi da qui (prima pagina) — */
  function resume() {
    const box = $("[data-resume]");
    if (!box) return;
    const prev = store.prevSeen();
    const fresh = NEWS.ready && prev ? NEWS.data.stories.filter((s) => s._t > prev).length : 0;
    const last = uniq(store.log()).slice(0, 3);
    if (!last.length && !fresh) { box.hidden = true; return; }
    const parts = [];
    if (fresh) parts.push(`<b>${fresh} ${fresh === 1 ? "notizia nuova" : "notizie nuove"}</b> dall’ultima visita${prev ? `, ${whenLabel(prev)}` : ""}`);
    box.innerHTML = `<div class="resume__head"><h2 class="resume__title" id="h-resume">Riprendi da qui</h2><p class="resume__note">${parts.join(" · ")}</p></div>
      ${last.length ? `<div class="resume__list">${last.map((e) => {
        const live = NEWS.byId.get(e.id);
        const href = live ? `#/s/${e.id}` : e.l;
        return `<a class="resume__item" href="${esc(href)}" ${live ? `data-goto="${esc(e.id)}"` : 'target="_blank" rel="noopener"'}><span class="kicker">${esc(secName(e.c))}</span><strong>${esc(e.ti)}</strong><span class="meta"><span class="meta__src">${esc(e.s)}</span><span>letta ${esc(whenLabel(e.t))}</span></span></a>`;
      }).join("")}</div>` : ""}
      <a class="resume__link" href="cronologia.html">Tutta la cronologia →</a>`;
    box.hidden = false;
  }

  /* — pagina Cronologia — */
  let q = "", armed = 0;

  function mix(log) {
    const c = {};
    log.forEach((e) => { c[e.c] = (c[e.c] || 0) + 1; });
    const rows = Object.entries(c).sort((a, b) => b[1] - a[1]);
    return rows;
  }

  /* Le ultime 12 settimane in un colpo d'occhio (una casella per giorno, colonne = settimane, righe = lunedì…domenica). */
  function heat(all) {
    const WEEKS = 12, now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    const counts = new Map();
    all.forEach((e) => { const k = dayKey(new Date(e.t)); counts.set(k, (counts.get(k) || 0) + 1); });
    let active = 0, best = null;
    const cells = [];
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        if (day > today) { cells.push('<i class="cell cell--future"></i>'); continue; }
        const n = counts.get(dayKey(day)) || 0;
        if (n) active++;
        if (n && (!best || n > best.n)) best = { n, day };
        const lvl = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4;
        cells.push(`<i class="cell" data-l="${lvl}"${day.getTime() === today.getTime() ? " data-today" : ""} title="${n} ${n === 1 ? "notizia" : "notizie"} · ${esc(dayLabel(day, now))}"></i>`);
      }
    }
    const sum = `${active} ${active === 1 ? "giorno" : "giorni"} di lettura nelle ultime ${WEEKS} settimane${best ? `; il più intenso ${dayLabel(best.day, now).toLowerCase()}, ${best.n} ${best.n === 1 ? "notizia" : "notizie"}` : ""}.`;
    return `<section class="heat" aria-labelledby="heat-h"><h2 class="heat__title" id="heat-h">Le tue ultime ${WEEKS} settimane</h2>
      <div class="heat__grid" role="img" aria-label="${esc(sum)}">${cells.join("")}</div>
      <div class="heat__foot"><p class="mixkey">${esc(sum)}</p>
      <span class="heat__key" aria-hidden="true">meno ${[0, 1, 2, 3, 4].map((l) => `<i class="cell" data-l="${l}"></i>`).join("")} più</span></div></section>`;
  }

  function page() {
    const host = $("[data-history]");
    if (!host) return;
    const all = store.log();
    if (!all.length) {
      host.innerHTML = `<div class="hist__empty"><p>Ancora niente qui. Apri una notizia dal cielo o dalla prima pagina: la ritrovi in questo diario, con l’ora in cui l’hai letta.</p><a class="btn btn--primary" href="index.html">Vai al cielo</a></div>`;
      return;
    }
    const today = dayKey(new Date());
    const days = new Set(all.map((e) => dayKey(new Date(e.t))));
    const m = mix(all);
    const top = m[0];
    const filt = norm(q);
    const log = filt ? all.filter((e) => norm(`${e.ti} ${e.s} ${secName(e.c)} ${e.k} ${e.b}`).includes(filt)) : all;
    const groups = [];
    log.forEach((e) => {
      const d = new Date(e.t), k = dayKey(d);
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) groups.push((g = { k, d, items: [] }));
      g.items.push(e);
    });
    const stats = `<div class="hist__stats">
      <div class="stat"><b>${all.length}</b><span>notizie aperte</span></div>
      <div class="stat"><b>${all.filter((e) => dayKey(new Date(e.t)) === today).length}</b><span>oggi</span></div>
      <div class="stat"><b>${days.size}</b><span>${days.size === 1 ? "giorno" : "giorni"} di lettura</span></div>
      <div class="stat"><b>${esc(secName(top[0]))}</b><span>lo sport che segui di più · ${Math.round((top[1] / all.length) * 100)}%</span>
        <div class="mix" aria-hidden="true">${m.map(([k, n]) => `<i style="flex:${n}" title="${esc(secName(k))} ${n}"></i>`).join("")}</div>
        <p class="mixkey">${m.slice(0, 4).map(([k, n]) => `${esc(secName(k))} ${n}`).join(" · ")}</p></div>
    </div>`;
    const tools = `<div class="hist__tools">
      <input class="hist__search" type="search" placeholder="Cerca nella cronologia" aria-label="Cerca nella cronologia" value="${esc(q)}" data-hsearch>
      <button type="button" class="btn btn--quiet" data-export>Esporta</button>
      <button type="button" class="btn btn--quiet" data-clear>${armed ? "Sicuro? Cancella tutto" : "Cancella tutto"}</button>
    </div>`;
    const list = groups.length ? groups.map((g) => `<section class="day" aria-label="${esc(dayLabel(g.d))}">
        <h2 class="day__head">${esc(dayLabel(g.d))}<span>${g.items.length}</span></h2>
        <ol class="trail">${g.items.map((e) => {
          const live = NEWS.byId.get(e.id);
          const href = live ? `#/s/${e.id}` : e.l;
          const via = e.v === "o" ? "articolo originale" : "dossier";
          return `<li class="visit"><time class="visit__time" datetime="${new Date(e.t).toISOString()}">${hhmm(new Date(e.t))}</time>
            <div class="visit__body"><p class="kicker">${esc(secName(e.c))}${e.k && e.k !== secName(e.c) ? `<span class="kicker__sub">${esc(e.k)}</span>` : ""}</p>
              <a class="visit__title" href="${esc(href)}" ${live ? `data-goto="${esc(e.id)}"` : 'target="_blank" rel="noopener"'}>${esc(e.ti)}</a>
              ${e.b ? `<p class="brief">${esc(e.b)}</p>` : ""}
              <p class="meta visit__meta"><span class="meta__src">${esc(e.s)}</span><span>${esc(via)}</span>${live ? '<span class="visit__via">ancora nel cielo di oggi</span>' : ""}</p></div>
            <button type="button" class="visit__rm" data-rm="${esc(e.id)}" data-t="${e.t}" aria-label="Rimuovi “${esc(e.ti)}” dalla cronologia" title="Rimuovi">${ICON_X}</button></li>`;
        }).join("")}</ol></section>`).join("")
      : `<p class="empty">Nessun risultato per “${esc(q)}”.</p>`;
    const keep = document.activeElement && document.activeElement.matches("[data-hsearch]");
    host.innerHTML = stats + heat(all) + tools + list;
    if (keep) { const i = $("[data-hsearch]", host); i.focus(); i.setSelectionRange(q.length, q.length); }
  }

  function bindPage() {
    const host = $("[data-history]");
    if (!host) return;
    host.addEventListener("input", (e) => { if (e.target.matches("[data-hsearch]")) { q = e.target.value; page(); } });
    host.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (rm) { store.remove(rm.dataset.rm, Number(rm.dataset.t)); return; }
      if (e.target.closest("[data-export]")) {
        const blob = new Blob([JSON.stringify(store.export(), null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = `sportwire-cronologia-${dayKey(new Date())}.json`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        return;
      }
      const clr = e.target.closest("[data-clear]");
      if (clr) {
        if (armed) { armed = 0; store.clear(); return; }
        armed = setTimeout(() => { armed = 0; page(); }, 4000);
        page();
        return;
      }
      const a = e.target.closest("a[data-goto]");
      if (a && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button)) { e.preventDefault(); reader.open(a.dataset.goto, uniq(store.log()).map((x) => x.id).filter((id) => NEWS.byId.has(id))); }
    });
  }

  return { paintMarks, paintCount, resume, page, bindPage };
})();

/* Avvio. */
(() => {
  const home = document.body.dataset.page === "home";

  /* 1. ingresso: solo dissolvenza, un solo observer */
  const targets = $$(".lead, .resume, .sky, .cards > .card, .front__aside, .block, .rows--grid, .hist");
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px", threshold: 0 });   // soglia 0: un elemento altissimo (cronologia lunga) non potrebbe mai superare una percentuale
    targets.forEach((n) => { n.classList.add("reveal"); io.observe(n); });
  }

  /* 2. orari relativi sempre veri */
  const tick = () => $$("time[data-rel]").forEach((t) => {
    const txt = relTime(t.getAttribute("datetime"));
    if (txt && t.textContent !== txt) t.textContent = txt;
    t.title = new Date(t.getAttribute("datetime")).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });
  });
  tick(); setInterval(tick, 60000);

  /* 3. filtri per argomento (pagine di sezione) */
  const chips = $(".chips");
  if (chips) {
    chips.hidden = false;
    const items = $$("[data-hit][data-k]");
    const empty = $(".empty");
    chips.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".chip");
      if (!btn) return;
      const f = btn.dataset.filter;
      $$(".chip", chips).forEach((c) => c.setAttribute("aria-pressed", String(c === btn)));
      if (chips.scrollWidth > chips.clientWidth) chips.scrollTo({ left: btn.offsetLeft - chips.clientWidth / 2 + btn.offsetWidth / 2, behavior: reduce ? "auto" : "smooth" });
      withVT(() => {
        let shown = 0;
        items.forEach((n) => { const on = f === "*" || (f === "__mine" ? n.classList.contains("is-mine") : n.dataset.k === f); n.hidden = !on; if (on) shown++; });
        if (empty) empty.hidden = shown > 0;
      });
    });
  }

  /* 3b. barra delle sezioni su telefono: scorre in orizzontale. La sezione aperta si vede sempre, e le sfumature
     sui bordi compaiono solo dove c'è altro da scoprire. */
  const links = $(".pill__links");
  if (links) {
    const edges = () => {
      links.classList.toggle("at-start", links.scrollLeft < 4);
      links.classList.toggle("at-end", links.scrollLeft + links.clientWidth >= links.scrollWidth - 4);
    };
    const cur = $('[aria-current="page"]', links);
    if (cur && links.scrollWidth > links.clientWidth) links.scrollTo({ left: cur.offsetLeft - links.clientWidth / 2 + cur.offsetWidth / 2, behavior: "instant" });
    edges();
    links.addEventListener("scroll", edges, { passive: true });
    addEventListener("resize", edges, { passive: true });
  }

  /* 4. le notizie si aprono dentro Sportwire; l'articolo originale resta a un tocco (e viene registrato) */
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target.closest("a[data-story]");
    if (t) {
      e.preventDefault();
      const card = t.closest("[data-id]");
      reader.open(t.dataset.story, null, card && $(".card__media, .lead__planet", card));
      return;
    }
    const ext = e.target.closest('[data-id] a[href^="http"]');
    if (ext) {
      const s = getStory(ext.closest("[data-id]").dataset.id);
      if (s) store.open(s, "o");
    }
  });
  const opener = e => { const b = e.target.closest("[data-open-search]"); if (b) finder.open(); };
  document.addEventListener("click", opener);
  addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || "")) || e.target.isContentEditable;
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey)) {
      if (reader.isOpen()) return;
      e.preventDefault(); finder.isOpen() ? finder.close() : finder.open();
    }
  });

  /* 5. dati, cielo, cronologia */
  history_.bindPage();
  const paint = () => { history_.paintCount(); history_.paintMarks(); sky.refresh(); };
  document.addEventListener("sw:store", () => { paint(); history_.resume(); history_.page(); });
  paint(); history_.page();
  loadNews().then(() => { sky.init(); history_.resume(); paint(); history_.page(); reader.sync(); }).catch(() => { history_.resume(); reader.sync(); });

  /* 6. nuova edizione: controllo ogni 5 minuti */
  const stamp = $("[data-stamp]");
  if (stamp && location.protocol.startsWith("http")) {
    const mine = new Date(stamp.getAttribute("datetime")).getTime();
    let shown = false;
    const check = async () => {
      if (shown || document.hidden) return;
      try {
        const r = await fetch("data/news.json", { cache: "no-store" });
        if (!r.ok) return;
        const { generated } = await r.json();
        if (new Date(generated).getTime() - mine < 60000) return;
        shown = true;
        const b = document.createElement("button");
        b.type = "button"; b.className = "fresh";
        b.innerHTML = '<span class="pulse" aria-hidden="true"></span>Nuova edizione · aggiorna';
        b.addEventListener("click", () => location.reload());
        document.body.append(b);
        requestAnimationFrame(() => b.classList.add("is-in"));
      } catch { /* offline: la pagina resta valida */ }
    };
    setInterval(check, 300000);
    document.addEventListener("visibilitychange", check);
  }

  /* 7. installabile e leggibile offline (solo su https o localhost) */
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
})();
