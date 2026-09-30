// node build.mjs → js/src/04-motion.js (libreria, con le licenze in testa) e css/src/01-springs.css (curve a molla).
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

// Letti direttamente da node_modules: alcuni pacchetti non «esportano» package.json e LICENSE.md.
const here = new URL(".", import.meta.url);
const read = (p, f) => readFileSync(new URL(`node_modules/${p}/${f}`, here), "utf8");
const ver = (p) => JSON.parse(read(p, "package.json")).version;
const lic = (p) => read(p, "LICENSE.md").trim();

const out = await build({
  entryPoints: ["entry.mjs"], bundle: true, minify: true, format: "iife", globalName: "Motion",
  target: "es2020", legalComments: "none", write: false,
});
const code = out.outputFiles[0].text.trim();

const pkgs = ["motion", "framer-motion", "motion-dom", "motion-utils"];
// Una copia per ogni testo di licenza diverso (i copyright sono due: Motion B.V. e Framer B.V.).
const texts = [...new Set(pkgs.map(lic))];
const indent = (t) => t.split("\n").map((l) => "   " + l).join("\n").replace(/[ ]+$/gm, "");
const header = `/* Motion ${ver("motion")} · https://motion.dev · animazioni del sito (molle fisiche sulla Web Animations API).
   Solo animate (mini), spring, stagger e inView, impacchettati con esbuild da vendor/motion (npm run build):
   il codice non è modificato. Pacchetti inclusi: ${pkgs.map((p) => `${p} ${ver(p)}`).join(", ")}.
   Licenza MIT: i testi qui sotto per intero, come richiede la licenza.
${texts.map((t) => `\n   — ${pkgs.filter((q) => lic(q) === t).join(", ")} —\n\n${indent(t)}`).join("\n")}
*/
`;
writeFileSync("../../js/src/04-motion.js", header + code + "\n");

// Le stesse molle come variabili CSS, per le transizioni che non passano dal JavaScript (hover, pressione, dossier).
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ animate() { throw new Error("no"); } }) };
const { spring } = (0, eval)(`(() => { ${code}; return Motion; })()`);
const curve = (visualDuration, bounce) => spring({ visualDuration, bounce, keyframes: [0, 1] }).toString();
const springs = {
  "spring": [0.42, 0, "senza rimbalzo: pannelli, dossier, pagine"],
  "spring-soft": [0.5, 0.12, "un filo di rimbalzo: schede e pulsanti che si sollevano"],
  "spring-pop": [0.38, 0.38, "rimbalzo evidente, per le cose rare: la stella scelta, il segui"],
  "spring-quick": [0.26, 0.15, "passaggio del mouse: veloce, con un accenno di rimbalzo"],
};
let css = `/* GENERATO da vendor/motion/build.mjs con spring() di Motion ${ver("motion")}: curve a molla native (linear()).
   Ogni variabile è «durata curva»: transition: transform var(--spring). Dove il browser non conosce linear()
   vale la regola di ripiego qui sotto, con la curva di 00-tokens.css. */\n:root {\n`;
for (const [name, [vd, b, why]] of Object.entries(springs)) css += `  --${name}: ${curve(vd, b)};   /* ${why} */\n`;
css += `}\n@supports not (transition-timing-function: linear(0, 1)) {\n  :root { --spring: 480ms cubic-bezier(.16, 1, .3, 1); --spring-soft: 520ms cubic-bezier(.16, 1, .3, 1); --spring-pop: 520ms cubic-bezier(.34, 1.4, .64, 1); --spring-quick: 300ms cubic-bezier(.16, 1, .3, 1); }\n}\n`;
writeFileSync("../../css/src/01-springs.css", css);
console.log(`04-motion.js ${(header.length + code.length) / 1000} kB · 01-springs.css scritti`);
