# vendor/motion

Il sito usa [Motion](https://motion.dev) (MIT) per le animazioni: solo `animate` (versione mini, sulla Web Animations
API), `spring`, `stagger` e `inView`. Il file che il sito carica, `js/src/04-motion.js`, è già nel repository: questa
cartella serve solo a ricostruirlo o ad aggiornare Motion.

```bash
cd vendor/motion
npm install
npm run build     # riscrive js/src/04-motion.js e css/src/01-springs.css
cd ../.. && python3 build.py --no-fetch
```
